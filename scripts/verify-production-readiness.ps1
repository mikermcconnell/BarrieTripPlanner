$ErrorActionPreference = "Stop"

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

Write-Host "== App and API tests =="
Invoke-CheckedCommand npm run test:all

Write-Host "== Android production env preflight =="
Invoke-CheckedCommand npm run prebuild:android:production

Write-Host "== Expo Doctor =="
Invoke-CheckedCommand npx expo-doctor

Write-Host "== Root production audit =="
Invoke-CheckedCommand npm audit --omit=dev --audit-level=high

Write-Host "== API proxy production audit =="
Invoke-CheckedCommand npm --prefix api-proxy audit --omit=dev --audit-level=high

Write-Host "== Firebase anonymous auth and protected proxy access =="
$anonymousProxyCheck = @'
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');

const app = initializeApp({
  apiKey: 'AIzaSyB4u2cJOxaqHUH6LY_yFFpQd1Tn-ET8dbs',
  authDomain: 'barrie-transit-trip-plan-cc84e.firebaseapp.com',
  projectId: 'barrie-transit-trip-plan-cc84e',
  storageBucket: 'barrie-transit-trip-plan-cc84e.firebasestorage.app',
  messagingSenderId: '648843426695',
  appId: '1:648843426695:web:14d220f26fb7001a72f122',
});

(async () => {
  const auth = getAuth(app);
  const credential = await signInAnonymously(auth);
  const token = await credential.user.getIdToken();
  const response = await fetch('https://apiproxy-r7pziiwpua-uc.a.run.app/api/geocode?q=maple', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Expected authenticated proxy request to succeed, got ${response.status}`);
  }
})().catch((error) => {
  console.error(error.code || error.message);
  process.exit(1);
});
'@
$anonymousProxyCheck | node -
if ($LASTEXITCODE -ne 0) {
  throw "Firebase anonymous auth / protected proxy check failed with exit code $LASTEXITCODE"
}

Write-Host "== Build release AAB =="
Invoke-CheckedCommand npm run build:release

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
