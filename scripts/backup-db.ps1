# ==============================================================================
# WorkSphere Database Backup Script - PowerShell (A14-R06)
# Safely generates timestamped PostgreSQL database dumps via Docker Compose.
# Credentials are read from existing environment/.env without exposure.
# ==============================================================================

[CmdletBinding()]
param(
    [string]$TargetDir
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

Set-Location $projectRoot

if (-not $TargetDir) {
    $TargetDir = Join-Path $projectRoot "backups"
}

if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

# Resolve DB configuration safely without logging secrets
$dbName = $env:POSTGRES_DB
$dbUser = $env:POSTGRES_USER

if ((-not $dbName -or -not $dbUser) -and (Test-Path ".env")) {
    Get-Content ".env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -match "^POSTGRES_DB=(.*)$") {
            if (-not $dbName) { $dbName = $matches[1].Trim('"').Trim("'") }
        }
        if ($line -match "^POSTGRES_USER=(.*)$") {
            if (-not $dbUser) { $dbUser = $matches[1].Trim('"').Trim("'") }
        }
    }
}

if (-not $dbName) { $dbName = "worksphere" }
if (-not $dbUser) { $dbUser = "worksphere" }

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFileName = "worksphere_${dbName}_${timestamp}.sql"
$backupFilePath = Join-Path $TargetDir $backupFileName

# Verify file does not exist to prevent overwrites
if (Test-Path $backupFilePath) {
    Write-Error "Backup target file already exists: $backupFilePath"
    exit 1
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "WorkSphere PostgreSQL Backup (A14-R06)" -ForegroundColor Cyan
Write-Host "Timestamp : $timestamp"
Write-Host "Database  : $dbName"
Write-Host "Target    : $backupFilePath"
Write-Host "==================================================" -ForegroundColor Cyan

# Check if postgres container is running
$runningServices = docker compose ps --services --filter "status=running" 2>$null
if ($runningServices -notcontains "postgres") {
    Write-Warning "Docker container 'postgres' is not running in current compose environment."
    Write-Host "Please start the database with: docker compose up -d postgres" -ForegroundColor Yellow
    exit 1
}

Write-Host "Streaming PostgreSQL database dump from container 'postgres'..."

try {
    # Execute pg_dump inside container safely with UTF8 output
    $cmd = "docker compose exec -T postgres pg_dump -U $dbUser -d $dbName --clean --if-exists"
    Invoke-Expression "$cmd > `"$backupFilePath`""

    if ((Test-Path $backupFilePath) -and ((Get-Item $backupFilePath).Length -gt 0)) {
        $fileSize = (Get-Item $backupFilePath).Length
        $sizeFormatted = "{0:N2} KB" -f ($fileSize / 1KB)
        Write-Host "[SUCCESS] Database backup completed successfully." -ForegroundColor Green
        Write-Host "          File: $backupFilePath"
        Write-Host "          Size: $sizeFormatted"
    } else {
        Write-Error "Backup file was created but is empty. Removing invalid file."
        if (Test-Path $backupFilePath) { Remove-Item $backupFilePath -Force }
        exit 1
    }
} catch {
    Write-Error "Failed to execute database backup: $_"
    if (Test-Path $backupFilePath) { Remove-Item $backupFilePath -Force }
    exit 1
}
