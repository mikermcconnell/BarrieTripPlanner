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

const proxyUrl = 'https://apiproxy-r7pziiwpua-uc.a.run.app';

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

  const authedFetchJson = async (path) => {
    const response = await fetch(`${proxyUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`${path} expected 2xx, got ${response.status}`);
    }
    return response.json();
  };

  const response = await fetch(`${proxyUrl}/api/geocode?q=maple`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Expected authenticated proxy request to succeed, got ${response.status}`);
  }

  const baseline = await authedFetchJson('/api/baseline-status');
  if (baseline.readyForDetours !== true) {
    throw new Error('Baseline is not ready for detours');
  }
  if (baseline.divergence && baseline.divergence.hasChanges === true) {
    throw new Error('Baseline diverges from live GTFS');
  }

  const rollout = await authedFetchJson('/api/detour-rollout-health');
  if (rollout.enabled !== true) {
    throw new Error('Auto-detour worker is not enabled');
  }
  const readiness = rollout.launchReadiness?.status;
  if (!['pilot_ready', 'pilot_ready_with_cautions'].includes(readiness)) {
    throw new Error(`Auto-detour rollout health is not ready: ${readiness || 'unknown'}`);
  }
  if (Array.isArray(rollout.launchReadiness?.failedCritical) && rollout.launchReadiness.failedCritical.length > 0) {
    throw new Error(`Auto-detour critical checks failed: ${rollout.launchReadiness.failedCritical.join(', ')}`);
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
if ($health.auth.schedulerTokenConfigured -ne $true) { throw "Live scheduler token is not configured" }
if ($health.features.detourWorkerEnabled -ne $true) { throw "Live auto-detour worker is not enabled" }
if ($health.features.detourWorkerMode -ne "scheduled") { throw "Live auto-detour worker is not in scheduled mode" }
if ($health.features.detourHistoryEnabled -ne $true) { throw "Live detour history is not enabled" }
if ($health.features.baselineAutoInitEnabled -ne $false) { throw "Live baseline auto-init is enabled" }
if ($health.features.detourRequireSafeBaseline -ne $true) { throw "Live safe baseline requirement is not enabled" }
if ($health.features.firebaseAdminConfigured -ne $true) { throw "Live Firebase Admin credentials are not configured" }

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
