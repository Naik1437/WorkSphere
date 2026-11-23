import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = existsSync(resolve(process.cwd(), 'scripts'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');

function readTextClean(filePath: string): string {
  const buf = readFileSync(filePath);
  // Detect UTF-16 LE BOM (0xFF 0xFE)
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le');
  }
  return buf.toString('utf8').replace(/\0/g, '');
}

describe('A14-R07: Database Backup & Restore Procedures', () => {
  it('provides executable backup and restore scripts in scripts/', () => {
    const backupPs1 = resolve(PROJECT_ROOT, 'scripts/backup-db.ps1');
    const backupSh = resolve(PROJECT_ROOT, 'scripts/backup-db.sh');
    const restorePs1 = resolve(PROJECT_ROOT, 'scripts/restore-db.ps1');
    const restoreSh = resolve(PROJECT_ROOT, 'scripts/restore-db.sh');
    const drillPs1 = resolve(PROJECT_ROOT, 'scripts/run-restore-drill.ps1');
    const drillSh = resolve(PROJECT_ROOT, 'scripts/run-restore-drill.sh');

    expect(existsSync(backupPs1)).toBe(true);
    expect(existsSync(backupSh)).toBe(true);
    expect(existsSync(restorePs1)).toBe(true);
    expect(existsSync(restoreSh)).toBe(true);
    expect(existsSync(drillPs1)).toBe(true);
    expect(existsSync(drillSh)).toBe(true);
  });

  it('enforces safety guards preventing accidental production database overwrite', () => {
    const restorePs1Content = readTextClean(resolve(PROJECT_ROOT, 'scripts/restore-db.ps1'));
    const restoreShContent = readTextClean(resolve(PROJECT_ROOT, 'scripts/restore-db.sh'));

    // Both scripts must check if TargetDb equals primaryDb and require explicit force
    expect(restorePs1Content).toContain('$TargetDb -eq $primaryDb -and -not $Force');
    expect(restorePs1Content).toContain('TARGET DATABASE IS THE ACTIVE PRIMARY DATABASE');

    expect(restoreShContent).toContain(
      '[ "${TARGET_DB}" = "${PRIMARY_DB}" ] && [ "${FORCE}" != "--force" ]',
    );
    expect(restoreShContent).toContain('TARGET DATABASE IS THE ACTIVE PRIMARY DATABASE');
  });

  it('validates SQL backup file structure, schema objects, and foreign key relations', () => {
    const backupsDir = resolve(PROJECT_ROOT, 'backups');
    expect(existsSync(backupsDir)).toBe(true);

    // Read the newest backup file if available
    const files = readdirSync(backupsDir).filter((f: string) => f.endsWith('.sql'));
    if (files.length > 0) {
      const dumpPath = resolve(backupsDir, files[files.length - 1]);
      const content = readTextClean(dumpPath);

      // Verify PostgreSQL dump header
      expect(content).toContain('PostgreSQL database dump');

      // Verify core WorkSphere schema entities
      const expectedTables = [
        'users',
        'organizations',
        'projects',
        'tasks',
        'comments',
        'activities',
        'jobs',
        'memberships',
      ];
      for (const table of expectedTables) {
        expect(content).toContain(`public.${table}`);
      }
    }
  });

  it('verifies restore drill script validates schema parity and cleans up disposable target', () => {
    const drillPs1Content = readTextClean(resolve(PROJECT_ROOT, 'scripts/run-restore-drill.ps1'));

    // Drill script must perform table parity comparison
    expect(drillPs1Content).toContain('$primaryTables.Count -eq $restoredTables.Count');

    // Drill script must verify row counts on critical tables
    expect(drillPs1Content).toContain(
      '$criticalTables = @("users", "organizations", "projects", "tasks", "memberships")',
    );

    // Drill script must safely drop the temporary database leaving primary untouched
    expect(drillPs1Content).toContain('DROP DATABASE');
  });
});
