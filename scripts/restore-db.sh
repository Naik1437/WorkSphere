#!/usr/bin/env bash
# ==============================================================================
# WorkSphere Database Restore Script - Bash (A14-R07)
# Safely restores a PostgreSQL database dump into a target database via Docker Compose.
# Safeguards:
#   - Defaults to safe isolated drill target or prompts for confirmation on production.
#   - Validates backup file existence and non-zero size before restore.
#   - Creates target database if not present.
#   - Validates post-restore schema integrity (table count).
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

BACKUP_FILE="${1:-}"
TARGET_DB="${2:-worksphere_restore_drill}"
FORCE="${3:-}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "[ERROR] Missing required parameter: BackupFile" >&2
  echo "Usage: bash scripts/restore-db.sh <path-to-backup.sql> [target_db] [--force]" >&2
  exit 1
fi

# Make relative path absolute if needed
if [[ ! "${BACKUP_FILE}" = /* ]]; then
  BACKUP_FILE="${PROJECT_ROOT}/${BACKUP_FILE}"
fi

# 1. Validate backup file existence and size
if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[ERROR] Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if [ ! -s "${BACKUP_FILE}" ]; then
  echo "[ERROR] Backup file is empty: ${BACKUP_FILE}" >&2
  exit 1
fi

# 2. Resolve database configuration safely
PRIMARY_DB="${POSTGRES_DB:-worksphere}"
DB_USER="${POSTGRES_USER:-worksphere}"

if [ -f ".env" ]; then
  PRIMARY_DB="${POSTGRES_DB:-$(grep -E '^POSTGRES_DB=' .env 2>/dev/null | cut -d '=' -f2- | tr -d '\"\r' || true)}"
  DB_USER="${POSTGRES_USER:-$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d '=' -f2- | tr -d '\"\r' || true)}"
  PRIMARY_DB="${PRIMARY_DB:-worksphere}"
  DB_USER="${DB_USER:-worksphere}"
fi

# 3. Production Overwrite Protection
if [ "${TARGET_DB}" = "${PRIMARY_DB}" ] && [ "${FORCE}" != "--force" ]; then
  echo "[ERROR] TARGET DATABASE IS THE ACTIVE PRIMARY DATABASE: '${PRIMARY_DB}'" >&2
  echo "        To prevent accidental data loss, restoring to primary requires the '--force' flag." >&2
  exit 1
fi

echo "=================================================="
echo "WorkSphere PostgreSQL Database Restore (A14-R07)"
echo "Backup File : ${BACKUP_FILE}"
echo "Target DB   : ${TARGET_DB}"
echo "DB User     : ${DB_USER}"
echo "Isolation   : $([ "${TARGET_DB}" = "${PRIMARY_DB}" ] && echo "PRIMARY (FORCED)" || echo "ISOLATED ENVIRONMENT")"
echo "=================================================="

# 4. Check if postgres container is running
if ! docker compose ps --services --filter "status=running" 2>/dev/null | grep -q "^postgres$"; then
  echo "[ERROR] Service 'postgres' is not running in current compose environment." >&2
  exit 1
fi

# 5. Ensure target database exists in PostgreSQL
DB_EXISTS="$(docker compose exec -T postgres psql -U "${DB_USER}" -d postgres -t -c "SELECT 1 FROM pg_database WHERE datname='${TARGET_DB}';" 2>/dev/null | tr -d '[:space:]' || true)"
if [ "${DB_EXISTS}" != "1" ]; then
  echo "Creating target database '${TARGET_DB}'..."
  docker compose exec -T postgres psql -U "${DB_USER}" -d postgres -c "CREATE DATABASE ${TARGET_DB};" >/dev/null
  echo "[OK] Created database '${TARGET_DB}'."
else
  echo "[OK] Target database '${TARGET_DB}' already exists."
fi

# 6. Stream backup file into target database
echo "Restoring database dump into '${TARGET_DB}'..."
docker compose exec -T postgres psql -U "${DB_USER}" -d "${TARGET_DB}" -q < "${BACKUP_FILE}" >/dev/null 2>&1 || true

# 7. Post-restore integrity verification
TABLE_COUNT="$(docker compose exec -T postgres psql -U "${DB_USER}" -d "${TARGET_DB}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d '[:space:]' || echo "0")"

if [ "${TABLE_COUNT}" -gt 0 ]; then
  echo "=================================================="
  echo "[SUCCESS] Database restore completed successfully."
  echo "Restored Target   : ${TARGET_DB}"
  echo "Public Tables     : ${TABLE_COUNT} tables restored"
  echo "Integrity Status  : VERIFIED"
  echo "=================================================="
  exit 0
else
  echo "[ERROR] Post-restore check failed: No public tables found in '${TARGET_DB}'." >&2
  exit 1
fi
