# Build a signed release AAB for Google Play Console upload.
# Usage: powershell -File scripts/build-release.ps1
#   or from the project root: .\scripts\build-release.ps1

param(
    [switch]$Apk  # Pass -Apk to build an APK instead of AAB
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectRoot

$envDev = Join-Path $projectRoot ".env"
$envProd = Join-Path $projectRoot ".env.production"
$envBackup = Join-Path $projectRoot ".env.dev-backup"

if (-not (Test-Path $envProd)) {
    Write-Error ".env.production not found at $envProd"
    exit 1
}

# --- Swap .env with .env.production for the build ---
$swapped = $false
try {
    if (Test-Path $envDev) {
        Write-Host "`n=== Swapping .env -> .env.production ===" -ForegroundColor Cyan
        Copy-Item $envDev $envBackup -Force
        Copy-Item $envProd $envDev -Force
        $swapped = $true
    }

    # Also set env vars for Gradle/Sentry
    [Environment]::SetEnvironmentVariable("SENTRY_DISABLE_AUTO_UPLOAD", "true", "Process")

    # --- Build ---
    Set-Location (Join-Path $projectRoot "android")

    if ($Apk) {
        Write-Host "`n=== Building release APK ===" -ForegroundColor Cyan
        & ./gradlew assembleRelease
        $output = "android\app\build\outputs\apk\release\app-release.apk"
    } else {
        Write-Host "`n=== Building release AAB ===" -ForegroundColor Cyan
        & ./gradlew bundleRelease
        $output = "android\app\build\outputs\bundle\release\app-release.aab"
    }

    Set-Location $projectRoot

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n=== BUILD SUCCESSFUL ===" -ForegroundColor Green
        Write-Host "Output: $output" -ForegroundColor Green
    } else {
        Write-Host "`n=== BUILD FAILED ===" -ForegroundColor Red
        exit 1
    }
} finally {
    # --- Always restore .env ---
    if ($swapped -and (Test-Path $envBackup)) {
        Write-Host "`n=== Restoring .env ===" -ForegroundColor Cyan
        Copy-Item $envBackup $envDev -Force
        Remove-Item $envBackup -Force
    }
}
