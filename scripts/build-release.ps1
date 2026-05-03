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
    $buildStartedAt = Get-Date

    if (Test-Path $envDev) {
        Write-Host "`n=== Swapping .env -> .env.production ===" -ForegroundColor Cyan
        Copy-Item $envDev $envBackup -Force
        Copy-Item $envProd $envDev -Force
        $swapped = $true
    }

    Write-Host "`n=== Running Android production env preflight ===" -ForegroundColor Cyan
    & node scripts/preflight-android-production-env.js --profile production
    if ($LASTEXITCODE -ne 0) {
        throw "Android production env preflight failed"
    }

    # Also set env vars for Gradle/Sentry
    [Environment]::SetEnvironmentVariable("SENTRY_DISABLE_AUTO_UPLOAD", "true", "Process")

    # --- Build ---
    Set-Location (Join-Path $projectRoot "android")

    if ($Apk) {
        Write-Host "`n=== Building release APK ===" -ForegroundColor Cyan
        & ./gradlew assembleRelease
        $gradleExitCode = $LASTEXITCODE
        $output = "android\app\build\outputs\apk\release\app-release.apk"
    } else {
        Write-Host "`n=== Building release AAB ===" -ForegroundColor Cyan
        & ./gradlew bundleRelease
        $gradleExitCode = $LASTEXITCODE
        $output = "android\app\build\outputs\bundle\release\app-release.aab"
    }

    Set-Location $projectRoot

    if ($gradleExitCode -ne 0) {
        throw "Gradle release build failed with exit code $gradleExitCode"
    }

    $outputPath = Join-Path $projectRoot $output
    if (-not (Test-Path $outputPath)) {
        throw "Gradle reported success but expected output was not found: $output"
    }

    $outputItem = Get-Item $outputPath
    if ($outputItem.LastWriteTime -lt $buildStartedAt) {
        throw "Gradle reported success but output is stale: $output"
    }

    Write-Host "`n=== BUILD SUCCESSFUL ===" -ForegroundColor Green
    Write-Host "Output: $output" -ForegroundColor Green
} finally {
    # --- Always restore .env ---
    if ($swapped -and (Test-Path $envBackup)) {
        Write-Host "`n=== Restoring .env ===" -ForegroundColor Cyan
        Copy-Item $envBackup $envDev -Force
        Remove-Item $envBackup -Force
    }
}
