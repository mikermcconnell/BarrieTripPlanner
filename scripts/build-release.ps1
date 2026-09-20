# Build a signed Android release with EAS credentials.
# Usage: powershell -File scripts/build-release.ps1 [-Apk]

param(
    [switch]$Apk,
    [switch]$InternalTesting
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectRoot

if ($Apk -and $InternalTesting) { throw 'Google Play internal testing requires an AAB, not an APK.' }
$profile = if ($InternalTesting) { "internal-testing" } elseif ($Apk) { "production-apk" } else { "production" }
$artifact = if ($Apk) { "internal APK" } else { "Google Play AAB" }

Write-Host "`n=== Running full production readiness gate ===" -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'verify-production-readiness.ps1') -InternalTesting:$InternalTesting
if ($LASTEXITCODE -ne 0) {
    throw "Production readiness verification failed"
}

Write-Host "`n=== Verifying the remote EAS production environment ===" -ForegroundColor Cyan
& npm run prebuild:android:eas
if ($LASTEXITCODE -ne 0) {
    throw "Android production environment preflight failed"
}

Write-Host "`n=== Building signed $artifact with EAS profile $profile ===" -ForegroundColor Cyan
& node scripts/run-eas-cli.js build --platform android --profile $profile --clear-cache
if ($LASTEXITCODE -ne 0) {
    throw "EAS Android build failed with exit code $LASTEXITCODE"
}

Write-Host "`n=== EAS BUILD SUBMITTED/SUCCEEDED ===" -ForegroundColor Green
Write-Host "The artifact uses the EAS-managed upload key. Do not upload a local Gradle release artifact to Google Play." -ForegroundColor Green
