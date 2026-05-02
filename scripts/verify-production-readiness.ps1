$ErrorActionPreference = "Stop"

Write-Host "== App and API tests =="
npm run test:all

Write-Host "== Android production env preflight =="
npm run prebuild:android:production

Write-Host "== Expo Doctor =="
npx expo-doctor

Write-Host "== Root production audit =="
npm audit --omit=dev --audit-level=high

Write-Host "== API proxy production audit =="
npm --prefix api-proxy audit --omit=dev --audit-level=high

Write-Host "== Build release AAB =="
npm run build:release

$proxyUrl = "https://apiproxy-r7pziiwpua-uc.a.run.app"

Write-Host "== Live API health =="
$health = Invoke-RestMethod -Uri "$proxyUrl/api/health" -TimeoutSec 20
if ($health.status -ne "ok") { throw "API health is not ok" }
if ($health.auth.requireApiAuth -ne $true) { throw "Live API auth is not required" }
if ($health.auth.requireFirebaseAuth -ne $true) { throw "Live Firebase auth is not required" }
if ($health.auth.allowSharedTokenAuth -ne $false) { throw "Live shared token auth is still enabled" }

Write-Host "== Protected route rejects unauthenticated request =="
try {
  Invoke-RestMethod -Uri "$proxyUrl/api/geocode?q=maple" -TimeoutSec 20 | Out-Null
  throw "Unauthenticated protected route unexpectedly succeeded"
} catch {
  if (-not $_.Exception.Response) { throw }
  $statusCode = [int]$_.Exception.Response.StatusCode
  if ($statusCode -ne 401) { throw "Expected 401, got $statusCode" }
}

Write-Host "Production readiness verification passed."
