# ==============================================================================
# WorkSphere Database Restore Drill Orchestrator - PowerShell (A14-R07)
# Executes a safe, reproducible, end-to-end backup and restore drill against
# an isolated disposable database environment without altering live data.
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$KeepDrillDb
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

$startTime = [System.Diagnostics.Stopwatch]::StartNew()
$drillTimestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$drillDbName = "worksphere_drill_${drillTimestamp}"
$backupsDir = Join-Path $projectRoot "backups"

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host " WorkSphere Automated Database Restore Drill (A14-R07)" -ForegroundColor Cyan
Write-Host " Started At : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host " Drill DB   : $drillDbName (ISOLATED DISPOSABLE TARGET)"
Write-Host "======================================================================`n" -ForegroundColor Cyan

# -----------------------------------------------------------------------------
# STEP 1: Verify PostgreSQL Container Status
# -----------------------------------------------------------------------------
Write-Host "[STEP 1/6] Verifying Docker PostgreSQL service availability..." -ForegroundColor Yellow
$running = docker compose ps --services --filter "status=running" 2>$null
if ($running -notcontains "postgres") {
    Write-Error "PostgreSQL container is not running. Please start it with 'docker compose up -d postgres'."
    exit 1
}
Write-Host "  -> PostgreSQL service is healthy and active.`n" -ForegroundColor Green

# -----------------------------------------------------------------------------
# STEP 2: Generate Safe Timestamped Backup (A14-R06)
# -----------------------------------------------------------------------------
Write-Host "[STEP 2/6] Generating fresh timestamped PostgreSQL backup..." -ForegroundColor Yellow
$backupScript = Join-Path $scriptDir "backup-db.ps1"
& "$backupScript" | Out-Null

# Identify the latest backup file created
$latestBackup = Get-ChildItem -Path $backupsDir -Filter "worksphere_*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latestBackup -or $latestBackup.Length -le 0) {
    Write-Error "Failed to generate valid backup file in $backupsDir."
    exit 1
}

Write-Host "  -> Verified Backup: $($latestBackup.Name)" -ForegroundColor Green
Write-Host "  -> Size: $('{0:N2} KB' -f ($latestBackup.Length / 1KB))`n" -ForegroundColor Green

# -----------------------------------------------------------------------------
# STEP 3: Execute Database Restore into Isolated Environment (A14-R07)
# -----------------------------------------------------------------------------
Write-Host "[STEP 3/6] Restoring backup dump into isolated database '$drillDbName'..." -ForegroundColor Yellow
$restoreScript = Join-Path $scriptDir "restore-db.ps1"
& "$restoreScript" -BackupFile $latestBackup.FullName -TargetDb $drillDbName | Out-Null
Write-Host "  -> Restore executed cleanly into isolated environment.`n" -ForegroundColor Green

# -----------------------------------------------------------------------------
# STEP 4: Validate Schema and Table Count Integrity
# -----------------------------------------------------------------------------
Write-Host "[STEP 4/6] Verifying restored schema and table structure..." -ForegroundColor Yellow
$dbUser = $env:POSTGRES_USER; if (-not $dbUser) { $dbUser = "worksphere" }
$primaryDb = $env:POSTGRES_DB; if (-not $primaryDb) { $primaryDb = "worksphere" }

$tablesQuery = "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
$primaryTables = docker compose exec -T postgres psql -U $dbUser -d $primaryDb -t -c $tablesQuery 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
$restoredTables = docker compose exec -T postgres psql -U $dbUser -d $drillDbName -t -c $tablesQuery 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }

Write-Host "  -> Primary Database Tables : $($primaryTables.Count)"
Write-Host "  -> Restored Database Tables: $($restoredTables.Count)"

$tablesMatch = ($primaryTables.Count -gt 0) -and ($primaryTables.Count -eq $restoredTables.Count)
if (-not $tablesMatch) {
    Write-Error "Table count mismatch between primary ($($primaryTables.Count)) and restored ($($restoredTables.Count))."
    exit 1
}
Write-Host "  -> [VERIFIED] All $($primaryTables.Count) tables successfully restored and verified.`n" -ForegroundColor Green

# -----------------------------------------------------------------------------
# STEP 5: Validate Data Integrity and Record Row Counts
# -----------------------------------------------------------------------------
Write-Host "[STEP 5/6] Verifying restored record row counts across core tables..." -ForegroundColor Yellow
$criticalTables = @("users", "organizations", "projects", "tasks", "memberships")
$dataVerified = $true

foreach ($tbl in $criticalTables) {
    if ($primaryTables -contains $tbl) {
        $countQuery = "SELECT COUNT(*) FROM `"$tbl`";"
        $primRaw = (docker compose exec -T postgres psql -U $dbUser -d $primaryDb -t -c $countQuery 2>$null | Out-String).Trim()
        $restRaw = (docker compose exec -T postgres psql -U $dbUser -d $drillDbName -t -c $countQuery 2>$null | Out-String).Trim()
        $primMatch = ($primRaw -split '\r?\n' | Where-Object { $_ -match '^\s*\d+\s*$' } | Select-Object -First 1)
        $restMatch = ($restRaw -split '\r?\n' | Where-Object { $_ -match '^\s*\d+\s*$' } | Select-Object -First 1)
        $primCount = if ($primMatch) { [int]($primMatch.Trim()) } else { 0 }
        $restCount = if ($restMatch) { [int]($restMatch.Trim()) } else { 0 }

        Write-Host "     - Table '$tbl': Primary = $primCount rows | Restored = $restCount rows"
        if ($primCount -ne $restCount) {
            Write-Error "Data row count mismatch in table '$tbl': Primary=$primCount, Restored=$restCount"
            $dataVerified = $false
        }
    }
}

if (-not $dataVerified) {
    Write-Error "Data integrity verification failed."
    exit 1
}
Write-Host "  -> [VERIFIED] Row counts across core tables match 100%.`n" -ForegroundColor Green

# -----------------------------------------------------------------------------
# STEP 6: Cleanup Isolated Disposable Drill Database
# -----------------------------------------------------------------------------
if (-not $KeepDrillDb) {
    Write-Host "[STEP 6/6] Cleaning up isolated disposable drill database '$drillDbName'..." -ForegroundColor Yellow
    docker compose exec -T postgres psql -U $dbUser -d postgres -c "DROP DATABASE `"$drillDbName`";" | Out-Null
    Write-Host "  -> [OK] Dropped temporary drill database '$drillDbName'. Primary DB remains untouched.`n" -ForegroundColor Green
} else {
    Write-Host "[STEP 6/6] Retaining isolated database '$drillDbName' as requested.`n" -ForegroundColor Yellow
}

$startTime.Stop()
$elapsedSec = [math]::Round($startTime.Elapsed.TotalSeconds, 2)

Write-Host "======================================================================" -ForegroundColor Green
Write-Host " DATABASE RESTORE DRILL REPORT (A14-R07) - PASSED" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
Write-Host " Drill Result       : SUCCESS"
Write-Host " Elapsed Time       : $elapsedSec seconds"
Write-Host " Backup Verified    : $($latestBackup.Name) ($('{0:N2} KB' -f ($latestBackup.Length / 1KB)))"
Write-Host " Isolated Target    : $drillDbName"
Write-Host " Schema Integrity   : $($restoredTables.Count) of $($primaryTables.Count) tables verified"
Write-Host " Data Integrity     : 100% row count parity across core tables"
Write-Host " Production Safety  : Primary DB '$primaryDb' isolated & untouched"
Write-Host "======================================================================`n" -ForegroundColor Green
exit 0
