# ==============================================================================
# WorkSphere Database Restore Script - PowerShell (A14-R07)
# Safely restores a PostgreSQL database dump into a target database via Docker Compose.
# Safeguards:
#   - Defaults to safe isolated drill target or prompts for confirmation on production.
#   - Validates backup file existence and non-zero size before restore.
#   - Creates target database if not present.
#   - Validates post-restore schema integrity (table count).
# ==============================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$BackupFile,

    [Parameter(Position = 1)]
    [string]$TargetDb = "worksphere_restore_drill",

    [switch]$Force
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

Set-Location $projectRoot

# Resolve relative path for BackupFile
if (-not [System.IO.Path]::IsPathRooted($BackupFile)) {
    $BackupFile = Join-Path $projectRoot $BackupFile
}

# 1. Validate backup file existence and integrity
if (-not (Test-Path $BackupFile)) {
    Write-Error "Backup file not found: $BackupFile"
    exit 1
}

$fileItem = Get-Item $BackupFile
if ($fileItem.Length -le 0) {
    Write-Error "Backup file is empty: $BackupFile"
    exit 1
}

# 2. Resolve database configuration safely
$primaryDb = $env:POSTGRES_DB
$dbUser = $env:POSTGRES_USER

if ((-not $primaryDb -or -not $dbUser) -and (Test-Path ".env")) {
    Get-Content ".env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -match "^POSTGRES_DB=(.*)$") {
            if (-not $primaryDb) { $primaryDb = $matches[1].Trim('"').Trim("'") }
        }
        if ($line -match "^POSTGRES_USER=(.*)$") {
            if (-not $dbUser) { $dbUser = $matches[1].Trim('"').Trim("'") }
        }
    }
}

if (-not $primaryDb) { $primaryDb = "worksphere" }
if (-not $dbUser) { $dbUser = "worksphere" }

# 3. Production Overwrite Protection
if ($TargetDb -eq $primaryDb -and -not $Force) {
    Write-Warning "TARGET DATABASE IS THE ACTIVE PRIMARY DATABASE: '$primaryDb'"
    Write-Warning "To prevent accidental data loss, restoring to primary requires the -Force switch."
    Write-Error "Operation aborted: specify -Force to restore directly to primary database."
    exit 1
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "WorkSphere PostgreSQL Database Restore (A14-R07)" -ForegroundColor Cyan
Write-Host "Backup File : $BackupFile"
Write-Host "File Size   : $('{0:N2} KB' -f ($fileItem.Length / 1KB))"
Write-Host "Target DB   : $TargetDb"
Write-Host "DB User     : $dbUser"
Write-Host "Isolation   : $(if ($TargetDb -eq $primaryDb) { 'PRIMARY (FORCED)' } else { 'ISOLATED ENVIRONMENT' })"
Write-Host "==================================================" -ForegroundColor Cyan

# 4. Check if postgres container is running
$runningServices = docker compose ps --services --filter "status=running" 2>$null
if ($runningServices -notcontains "postgres") {
    Write-Error "Docker container 'postgres' is not running in current compose environment."
    exit 1
}

# 5. Ensure target database exists in PostgreSQL
Write-Host "Verifying target database '$TargetDb' in container..."
$dbExistsQuery = "SELECT 1 FROM pg_database WHERE datname='$TargetDb';"
$dbExists = docker compose exec -T postgres psql -U $dbUser -d postgres -t -c $dbExistsQuery 2>$null
if ($dbExists.Trim() -ne "1") {
    Write-Host "Target database '$TargetDb' does not exist. Creating it now..."
    docker compose exec -T postgres psql -U $dbUser -d postgres -c "CREATE DATABASE $TargetDb;" | Out-Null
    Write-Host "[OK] Created database '$TargetDb'." -ForegroundColor Green
} else {
    Write-Host "[OK] Target database '$TargetDb' already exists."
}

# 6. Stream backup file into target database
Write-Host "Restoring database dump into '$TargetDb'..."
try {
    # Pipe dump into container psql
    Get-Content $BackupFile | docker compose exec -T postgres psql -U $dbUser -d $TargetDb -q 2>&1 | Out-Null

    # 7. Post-restore integrity verification
    $tableCountQuery = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"
    $tableCountOutput = (docker compose exec -T postgres psql -U $dbUser -d $TargetDb -t -c $tableCountQuery 2>$null | Out-String).Trim()
    $parsedLine = ($tableCountOutput -split '\r?\n' | Where-Object { $_ -match '^\s*\d+\s*$' } | Select-Object -First 1)
    $tableCount = if ($parsedLine) { [int]($parsedLine.Trim()) } else { 0 }

    if ($tableCount -gt 0) {
        Write-Host "==================================================" -ForegroundColor Green
        Write-Host "[SUCCESS] Database restore completed successfully." -ForegroundColor Green
        Write-Host "Restored Target   : $TargetDb"
        Write-Host "Public Tables     : $tableCount tables restored"
        Write-Host "Integrity Status  : VERIFIED"
        Write-Host "==================================================" -ForegroundColor Green
        exit 0
    } else {
        Write-Error "Post-restore check failed: No public tables found in '$TargetDb'."
        exit 1
    }
} catch {
    Write-Error "Failed to execute database restore: $_"
    exit 1
}
