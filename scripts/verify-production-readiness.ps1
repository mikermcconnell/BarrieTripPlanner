param(
  [switch]$SkipSourceControlCheck
)

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

if (-not $SkipSourceControlCheck) {
  Write-Host "== Release source control state =="
  $status = git status --porcelain
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect Git status" }
  if ($status) {
    throw "Release source is not clean. Commit and review all intended changes before creating the production artifact."
  }
  $aheadBehind = git rev-list --left-right --count '@{upstream}...HEAD'
  if ($LASTEXITCODE -ne 0) { throw "Could not compare HEAD with its upstream branch" }
  $counts = $aheadBehind -split '\s+'
  if ([int]$counts[0] -ne 0 -or [int]$counts[1] -ne 0) {
    throw "Release branch is not synchronized with its upstream branch."
  }
  $branch = git branch --show-current
  if ($branch -ne "master") {
    throw "Production releases must be built from master, not $branch."
  }
  $upstream = git rev-parse --abbrev-ref '@{upstream}'
  if ($upstream -ne "origin/master") {
    throw "Production master must track origin/master, not $upstream."
  }
}

Write-Host "== Release identity =="
Invoke-CheckedCommand node scripts/verify-release-identity.js

Write-Host "== App and API tests =="
Invoke-CheckedCommand npm run test:all

Write-Host "== Android production env preflight =="
Invoke-CheckedCommand npm run prebuild:android:eas

Write-Host "== Expo Doctor =="
Invoke-CheckedCommand npx expo-doctor

Write-Host "== Root production audit =="
Invoke-CheckedCommand node scripts/verify-production-audit.js

Write-Host "== API proxy production audit =="
Invoke-CheckedCommand node scripts/verify-production-audit.js --prefix api-proxy

Write-Host "== Firebase anonymous auth and protected proxy access =="
$anonymousProxyCheck = @'
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');

const proxyUrl = 'https://apiproxy-r7pziiwpua-uc.a.run.app';
const eas = require('./eas.json');
const releaseDetoursEnabled = String(
  eas.build?.production?.env?.EXPO_PUBLIC_ENABLE_AUTO_DETOURS || ''
).toLowerCase() === 'true';

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

  if (releaseDetoursEnabled) {
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
  } else {
    console.log('Public auto-detours are disabled for this production release.');
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

Write-Host "== Production configuration and legal pages =="
$configCheck = @'
const fs = require('fs');
const app = require('./app.base.json').expo;
const eas = require('./eas.json');

const requiredBlockedPermissions = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];
for (const permission of requiredBlockedPermissions) {
  if (!app.android?.blockedPermissions?.includes(permission)) {
    throw new Error(`Missing blocked Android permission: ${permission}`);
  }
}
const productionEnv = eas.build?.production?.env || {};
if (String(productionEnv.EXPO_PUBLIC_ENABLE_AUTO_DETOURS) === 'true'
    && String(productionEnv.EXPO_PUBLIC_AUTO_DETOURS_APPROVED) !== 'true') {
  throw new Error('Public auto-detours are enabled without explicit production approval');
}
for (const file of [
  'legal-public/privacy-policy.html',
  'legal-public/account-deletion.html',
  'legal-public/terms-of-service.html',
]) {
  if (!fs.existsSync(file)) throw new Error(`Missing legal page: ${file}`);
}
const firebase = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
if (firebase.hosting?.public !== 'legal-public') {
  throw new Error('Firebase Hosting must deploy only the dedicated legal-public directory');
}
'@
$configCheck | node -
if ($LASTEXITCODE -ne 0) {
  throw "Production configuration check failed with exit code $LASTEXITCODE"
}

Write-Host "== Public legal URLs =="
$legalUrls = @(
  "https://barrie-transit-trip-plan-cc84e.web.app/privacy-policy.html",
  "https://barrie-transit-trip-plan-cc84e.web.app/terms-of-service.html",
  "https://barrie-transit-trip-plan-cc84e.web.app/account-deletion.html"
)
foreach ($legalUrl in $legalUrls) {
  try {
    $response = Invoke-WebRequest -Uri $legalUrl -TimeoutSec 20 -UseBasicParsing
    if ($response.StatusCode -ne 200) { throw "Expected HTTP 200, got $($response.StatusCode)" }
  } catch {
    throw "Required public legal page is unavailable: $legalUrl"
  }
}

Write-Host "== Firestore feedback retention policy =="
Invoke-CheckedCommand node scripts/verify-firestore-ttl.js

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
