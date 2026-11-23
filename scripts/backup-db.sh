#!/usr/bin/env bash
# ==============================================================================
# WorkSphere Database Backup Script (A14-R06)
# Safely generates timestamped PostgreSQL database dumps via Docker Compose.
# Credentials are read from existing environment/.env without exposure.
# ==============================================================================

set -euo pipefail

# Project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${PROJECT_ROOT}/backups"

cd "${PROJECT_ROOT}"

# Load .env if present (without echoing secrets)
if [ -f ".env" ]; then
  # Export only non-secret database config keys if not already set
  POSTGRES_DB="${POSTGRES_DB:-$(grep -E '^POSTGRES_DB=' .env 2>/dev/null | cut -d '=' -f2- | tr -d '\"\r' || true)}"
  POSTGRES_USER="${POSTGRES_USER:-$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d '=' -f2- | tr -d '\"\r' || true)}"
fi

DB_NAME="${POSTGRES_DB:-worksphere}"
DB_USER="${POSTGRES_USER:-worksphere}"
CONTAINER_SERVICE="postgres"

# Create destination directory if not exists
mkdir -p "${BACKUP_DIR}"

# Generate timestamp and target file path
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
BACKUP_FILENAME="worksphere_${DB_NAME}_${TIMESTAMP}.sql"
BACKUP_FILEPATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

# Safety check: prevent overwriting existing backups
if [ -f "${BACKUP_FILEPATH}" ]; then
  echo "[ERROR] Backup target file already exists: ${BACKUP_FILEPATH}" >&2
  exit 1
fi

echo "=================================================="
echo "WorkSphere PostgreSQL Backup (A14-R06)"
echo "Timestamp : ${TIMESTAMP}"
echo "Database  : ${DB_NAME}"
echo "Target    : backups/${BACKUP_FILENAME}"
echo "=================================================="

# Check Docker Compose status for postgres service
if ! docker compose ps --services --filter "status=running" 2>/dev/null | grep -q "^${CONTAINER_SERVICE}$"; then
  echo "[ERROR] Service '${CONTAINER_SERVICE}' is not currently running." >&2
  echo "        Run 'docker compose up -d ${CONTAINER_SERVICE}' before backing up." >&2
  exit 1
fi

echo "Streaming PostgreSQL database dump from container '${CONTAINER_SERVICE}'..."

# Perform pg_dump inside container without exposing credentials on host command line
if docker compose exec -T "${CONTAINER_SERVICE}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists > "${BACKUP_FILEPATH}"; then
  # Verify non-empty output
  if [ -s "${BACKUP_FILEPATH}" ]; then
    FILE_SIZE="$(du -h "${BACKUP_FILEPATH}" | cut -f1)"
    echo "[SUCCESS] Database backup completed successfully."
    echo "          File: ${BACKUP_FILEPATH}"
    echo "          Size: ${FILE_SIZE}"
  else
    echo "[ERROR] Backup file was created but is empty. Removing invalid file." >&2
    rm -f "${BACKUP_FILEPATH}"
    exit 1
  fi
else
  echo "[ERROR] pg_dump failed during execution." >&2
  rm -f "${BACKUP_FILEPATH}"
  exit 1
fi
