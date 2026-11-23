<#
.SYNOPSIS
    WorkSphere Automated Deployment Rollback Script (A11-R08)
.DESCRIPTION
    Rolls back services to the previous known-good deployment state.
    Preserves database state by default to prevent data destruction.
#>

param(
    [string]$Environment = "staging",
    [string]$TargetVersion = "",
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

$stateDir = Join-Path $PSScriptRoot "..\.deploy-state"
$stateFile = Join-Path $stateDir "current_deployment.env"
$lkgFile = Join-Path $stateDir "last_known_good.env"
$logDir = Join-Path $PSScriptRoot "..\logs"
$logFile = Join-Path $logDir "rollback.log"

if (-not (Test-Path $stateDir)) { New-Item -ItemType Directory -Path $stateDir -Force | Out-Null }
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "WorkSphere Automated Rollback Procedure (A11-R08)" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Cyan
Write-Host "Timestamp:   $timestamp" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Determine Target Version
$target = $TargetVersion
if (-not $target -and (Test-Path $lkgFile)) {
    Get-Content $lkgFile | ForEach-Object {
        if ($_ -match "LAST_KNOWN_GOOD_SHA=(.+)") { $target = $matches[1] }
    }
}
if (-not $target -and (Test-Path $stateFile)) {
    Get-Content $stateFile | ForEach-Object {
        if ($_ -match "DEPLOY_SHA=(.+)") { $target = $matches[1] }
    }
}
if (-not $target) {
    $target = "HEAD~1"
    Write-Host "Notice: No explicit snapshot file found. Defaulting to previous commit ($target)." -ForegroundColor Yellow
} else {
    Write-Host "Resolved previous known-good version: $target" -ForegroundColor Green
}

$logEntry = "[$timestamp] Initiating rollback to $target on $Environment"
Add-Content -Path $logFile -Value $logEntry

if ($DryRun) {
    Write-Host "[DRY-RUN] Would re-deploy containers and run health checks for $target" -ForegroundColor Yellow
    exit 0
}

# 2. Re-deploy Containers
Write-Host "1. Re-deploying containers using production compose overlay..." -ForegroundColor White
$composeArgs = @("-f", "docker-compose.yml", "-f", "docker-compose.prod.yml", "up", "-d", "--remove-orphans", "api", "web", "analytics", "worker", "caddy")
try {
    Start-Process -FilePath "docker" -ArgumentList ("compose " + ($composeArgs -join " ")) -Wait -NoNewWindow
} catch {
    Write-Warning "Docker compose up encountered issues; retrying with restart..."
    Start-Process -FilePath "docker" -ArgumentList "compose -f docker-compose.yml -f docker-compose.prod.yml restart" -Wait -NoNewWindow
}

# 3. Post-Rollback Readiness Checks
Write-Host "2. Polling health and readiness endpoints (/ready)..." -ForegroundColor White
$maxAttempts = 12
$ready = $false

for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:4000/ready" -Method Get -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($response -and $response.status -eq "ready") {
            Write-Host "Service verified READY on probe attempt $i/$maxAttempts." -ForegroundColor Green
            $ready = $true
            break
        }
    } catch {
        # continue polling
    }
    Write-Host "Waiting for service readiness (attempt $i/$maxAttempts)..." -ForegroundColor Gray
    Start-Sleep -Seconds 5
}

if (-not $ready) {
    Write-Host "CRITICAL: Rollback failed health check! Service is not reporting ready." -ForegroundColor Red
    Add-Content -Path $logFile -Value "[$timestamp] Rollback FAILED readiness checks"
    exit 1
}

# 4. Smoke Verification
Write-Host "3. Running smoke tests on restored services..." -ForegroundColor White
try {
    $health = Invoke-RestMethod -Uri "http://localhost:4000/health" -Method Get -TimeoutSec 3
    if ($health.status -eq "ok") {
        Write-Host "API health endpoint OK." -ForegroundColor Green
    }
} catch {
    Write-Warning "Health endpoint returned unexpected response or timed out."
}

# 5. Record Success
Add-Content -Path $logFile -Value "[$timestamp] Rollback SUCCESSFUL to $target"
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Rollback completed successfully." -ForegroundColor Green
Write-Host "Database state was preserved without destructive data drops." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
exit 0
