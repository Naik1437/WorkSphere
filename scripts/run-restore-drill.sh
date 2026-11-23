#!/usr/bin/env bash
# ==============================================================================
# WorkSphere Database Restore Drill Orchestrator - Bash (A14-R07)
# Executes a safe, reproducible, end-to-end backup and restore drill against
# an isolated disposable database environment without altering live data.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

DRILL_TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
DRILL_DB="worksphere_drill_${DRILL_TIMESTAMP}"
BACKUP_DIR="${PROJECT_ROOT}/backups"

echo "======================================================================"
echo " WorkSphere Automated Database Restore Drill (A14-R07)"
echo " Started At : $(date +"%Y-%m-%d %H:%M:%S")"
echo " Drill DB   : ${DRILL_DB} (ISOLATED DISPOSABLE TARGET)"
echo "======================================================================"

# Step 1: Check postgres container
if ! docker compose ps --services --filter "status=running" 2>/dev/null | grep -q "^postgres$"; then
  echo "[ERROR] PostgreSQL container is not running." >&2
  exit 1
fi

# Step 2: Create fresh timestamped backup
echo "[STEP 1/5] Generating fresh timestamped backup..."
bash "${SCRIPT_DIR}/backup-db.sh" >/dev/null

LATEST_BACKUP="$(ls -t "${BACKUP_DIR}"/worksphere_*.sql | head -n 1)"
if [ ! -s "${LATEST_BACKUP}" ]; then
  echo "[ERROR] Valid backup file not found in ${BACKUP_DIR}." >&2
  exit 1
fi
echo "  -> Verified Backup: $(basename "${LATEST_BACKUP}")"

# Step 3: Restore into isolated drill database
echo "[STEP 2/5] Restoring backup into isolated database '${DRILL_DB}'..."
bash "${SCRIPT_DIR}/restore-db.sh" "${LATEST_BACKUP}" "${DRILL_DB}" >/dev/null

# Step 4: Verify schema table count
DB_USER="${POSTGRES_USER:-worksphere}"
PRIMARY_DB="${POSTGRES_DB:-worksphere}"

TABLES_QUERY="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"
PRIMARY_COUNT="$(docker compose exec -T postgres psql -U "${DB_USER}" -d "${PRIMARY_DB}" -t -c "${TABLES_QUERY}" 2>/dev/null | tr -d '[:space:]')"
RESTORED_COUNT="$(docker compose exec -T postgres psql -U "${DB_USER}" -d "${DRILL_DB}" -t -c "${TABLES_QUERY}" 2>/dev/null | tr -d '[:space:]')"

echo "[STEP 3/5] Verifying schema parity..."
echo "  -> Primary Tables : ${PRIMARY_COUNT}"
echo "  -> Restored Tables: ${RESTORED_COUNT}"

if [ "${PRIMARY_COUNT}" -ne "${RESTORED_COUNT}" ] || [ "${RESTORED_COUNT}" -eq 0 ]; then
  echo "[ERROR] Table count mismatch between primary and restored database." >&2
  exit 1
fi
echo "  -> [VERIFIED] Schema table counts match perfectly."

# Step 5: Clean up disposable drill database
echo "[STEP 4/5] Dropping isolated temporary database '${DRILL_DB}'..."
docker compose exec -T postgres psql -U "${DB_USER}" -d postgres -c "DROP DATABASE \"${DRILL_DB}\";" >/dev/null
echo "  -> [OK] Temporary database dropped cleanly. Primary database untouched."

echo "======================================================================"
echo " [SUCCESS] DATABASE RESTORE DRILL PASSED (A14-R07)"
echo "======================================================================"
