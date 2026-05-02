# BTTP Production Readiness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move BTTP from pilot/release-candidate status to public-production ready by fixing backend auth, dependency health, Expo package alignment, release hygiene, detour rollout risk, and final smoke verification.

**Architecture:** Keep the mobile/web app public-safe by shipping no public proxy secrets and requiring Firebase Bearer auth for client API routes. Keep scheduled backend jobs working with a separate server-only scheduler token that is never bundled into the app. Use automated checks plus a short manual smoke pass as the final release gate.

**Tech Stack:** Expo SDK 54, React Native 0.81, Firebase, Express API proxy on Cloud Run/Firebase Functions, Jest, npm audit, EAS Android builds.

---

## Read First

- `AGENTS.md`
- `README.md`
- `docs/API-PROXY-OPERATIONS.md`
- `docs/TESTING.md`

## Finding-to-Task Map

- Backend auth not hardened: Tasks 1-3
- Google sign-in unexpected error: Task 3A
- Critical/high npm audit findings: Task 4
- Expo Doctor package mismatch: Task 5
- Dirty working tree/release hygiene: Task 6
- Detour rollout caution/flapping: Task 7
- Manual smoke testing and versionCode: Task 8
- Final release gate: Task 9

## File Structure

- Modify: `api-proxy/config/env.js`
  - Owns backend runtime auth configuration and validation.
- Modify: `api-proxy/middleware/auth.js`
  - Owns per-request API authentication.
- Modify: `api-proxy/routes/healthRoutes.js`
  - Reports safe booleans for backend auth posture.
- Modify: `api-proxy/__tests__/index.routes.test.js`
  - Covers production auth fail-fast behavior.
- Modify: `api-proxy/__tests__/auth.middleware.test.js`
  - Covers Firebase client auth and scheduler-only token auth.
- Modify: `docs/API-PROXY-OPERATIONS.md`
  - Documents production auth and scheduler token deployment model.
- Modify: `package.json`, `package-lock.json`
  - Align Expo SDK package versions and root dependency overrides.
- Modify: `api-proxy/package.json`, `api-proxy/package-lock.json`
  - Remediate backend dependency audit findings.
- Modify: `src/services/firebase/authService.js`
  - Handles native Google sign-in cancellation and configuration errors clearly.
- Modify: `src/__tests__/authService.test.js`
  - Covers Google sign-in setup failures.
- Modify: `scripts/preflight-android-production-env.js`
  - Blocks production Android builds when `google-services.json` lacks an Android OAuth client.
- Modify: `eas.json`
  - Disable rider-facing auto-detours in public production until the rollout warning clears.
- Modify: `app.base.json`
  - Bump Android `versionCode` before the next Play Console submission.
- Create: `docs/PRODUCTION-SMOKE-CHECKLIST.md`
  - Records the final manual smoke test.
- Create: `scripts/verify-production-readiness.ps1`
  - Runs the final local and live readiness checks in one command.

---

## Task 1: Backend Auth Fail-Fast Rules

**Files:**
- Modify: `api-proxy/config/env.js`
- Test: `api-proxy/__tests__/index.routes.test.js`

- [ ] **Step 1: Add failing tests for insecure production auth**

Add these tests in `api-proxy/__tests__/index.routes.test.js` near the existing production auth test:

```js
  test('fails fast when production disables API auth entirely', () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      LOCATIONIQ_API_KEY: 'test-locationiq-key',
      REQUIRE_API_AUTH: 'false',
      REQUIRE_FIREBASE_AUTH: 'false',
      ALLOW_SHARED_TOKEN_AUTH: 'false',
      DETOUR_WORKER_ENABLED: 'false',
      NEWS_WORKER_ENABLED: 'false',
    };

    expect(() => require('../index')).toThrow(/Production proxy must require API auth/);
  });

  test('fails fast when production allows general shared token auth', () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      LOCATIONIQ_API_KEY: 'test-locationiq-key',
      REQUIRE_API_AUTH: 'true',
      REQUIRE_FIREBASE_AUTH: 'true',
      ALLOW_SHARED_TOKEN_AUTH: 'true',
      API_PROXY_TOKEN: 'test-proxy-token',
      FIREBASE_SERVICE_ACCOUNT_JSON: '{"type":"service_account"}',
      DETOUR_WORKER_ENABLED: 'false',
      NEWS_WORKER_ENABLED: 'false',
    };

    expect(() => require('../index')).toThrow(/Production proxy must disable general shared token auth/);
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```powershell
npm run test:api -- --runTestsByPath __tests__/index.routes.test.js
```

Expected: the two new tests fail because `REQUIRE_API_AUTH=false` and `ALLOW_SHARED_TOKEN_AUTH=true` are not rejected strongly enough in production.

- [ ] **Step 3: Harden `validateProxyConfig`**

In `api-proxy/config/env.js`, replace the production auth checks in `validateProxyConfig` with this sequence:

```js
  if (config.isProd && !config.requireApiAuth) {
    throw new Error(
      'Production proxy must require API auth. Set REQUIRE_API_AUTH=true.'
    );
  }

  if (config.isProd && !config.requireFirebaseAuth) {
    throw new Error(
      'Production proxy must use Firebase Bearer auth. Set REQUIRE_FIREBASE_AUTH=true.'
    );
  }

  if (config.isProd && config.allowSharedTokenAuth) {
    throw new Error(
      'Production proxy must disable general shared token auth. Set ALLOW_SHARED_TOKEN_AUTH=false.'
    );
  }
```

Keep the existing non-production validation below this block.

- [ ] **Step 4: Verify backend tests**

Run:

```powershell
npm run test:api
```

Expected: all API proxy tests pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add api-proxy/config/env.js api-proxy/__tests__/index.routes.test.js
git commit -m "fix(api): fail fast on insecure production auth"
```

---

## Task 2: Scheduler-Only Server Token

**Files:**
- Modify: `api-proxy/config/env.js`
- Modify: `api-proxy/middleware/auth.js`
- Modify: `api-proxy/routes/healthRoutes.js`
- Test: `api-proxy/__tests__/auth.middleware.test.js`
- Test: `api-proxy/__tests__/index.routes.test.js`

- [ ] **Step 1: Add failing middleware tests**

Add these tests to `api-proxy/__tests__/auth.middleware.test.js`:

```js
  test('accepts scheduler token only for detour run-once', async () => {
    const middleware = createAuthenticateApiRequest({
      requireApiAuth: true,
      isProd: true,
      detourDebugApiKey: '',
      allowSharedTokenAuth: false,
      apiTokens: new Set(),
      requireFirebaseAuth: true,
      schedulerApiToken: 'scheduler-secret',
    });
    const req = {
      path: '/detour-run-once',
      get: jest.fn((header) => (header === 'x-scheduler-token' ? 'scheduler-secret' : '')),
    };
    const next = jest.fn();

    await middleware(req, createMockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.clientId).toBe('scheduler:detour-run-once');
  });

  test('rejects scheduler token on public client routes', async () => {
    const middleware = createAuthenticateApiRequest({
      requireApiAuth: true,
      isProd: true,
      detourDebugApiKey: '',
      allowSharedTokenAuth: false,
      apiTokens: new Set(),
      requireFirebaseAuth: true,
      schedulerApiToken: 'scheduler-secret',
    });
    const req = {
      path: '/geocode',
      get: jest.fn((header) => (header === 'x-scheduler-token' ? 'scheduler-secret' : '')),
    };
    const res = createMockRes();

    await middleware(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error).toBe('Unauthorized');
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```powershell
npm run test:api -- --runTestsByPath __tests__/auth.middleware.test.js
```

Expected: the scheduler token test fails because the middleware does not know `schedulerApiToken`.

- [ ] **Step 3: Add scheduler token config**

In `api-proxy/config/env.js`, add this field inside the object returned by `buildProxyConfig`:

```js
    schedulerApiToken: (env.SCHEDULER_API_TOKEN || '').trim(),
```

- [ ] **Step 4: Add scheduler token auth path**

In `api-proxy/middleware/auth.js`, add this constant near the top:

```js
const SCHEDULER_TOKEN_PATHS = new Set([
  '/detour-run-once',
  '/survey/send-digest',
]);
```

Update `createAuthenticateApiRequest` parameters to include:

```js
  schedulerApiToken,
```

Add this block after the non-production debug key block and before general shared token auth:

```js
    const schedulerToken = req.get('x-scheduler-token');
    if (
      schedulerApiToken &&
      schedulerToken &&
      schedulerToken === schedulerApiToken &&
      SCHEDULER_TOKEN_PATHS.has(req.path)
    ) {
      req.clientId = `scheduler:${req.path.replace(/^\//, '')}`;
      return next();
    }
```

- [ ] **Step 5: Pass the config into the middleware**

Find the middleware construction in `api-proxy/createApp.js` and include:

```js
    schedulerApiToken: config.schedulerApiToken,
```

- [ ] **Step 6: Report scheduler token posture safely**

In `api-proxy/routes/healthRoutes.js`, add a boolean only:

```js
      schedulerTokenConfigured: Boolean(config.schedulerApiToken),
```

Do not return the token value.

- [ ] **Step 7: Verify backend tests**

Run:

```powershell
npm run test:api
```

Expected: all API proxy tests pass.

- [ ] **Step 8: Commit**

Run:

```powershell
git add api-proxy/config/env.js api-proxy/middleware/auth.js api-proxy/createApp.js api-proxy/routes/healthRoutes.js api-proxy/__tests__/auth.middleware.test.js
git commit -m "fix(api): add scheduler-only job authentication"
```

---

## Task 3: Production API Proxy Deployment Hardening

**Files:**
- Modify: `docs/API-PROXY-OPERATIONS.md`

- [ ] **Step 1: Update production environment documentation**

In `docs/API-PROXY-OPERATIONS.md`, update the production environment section to state:

```md
Production Cloud Run / Functions environment must include:

- `NODE_ENV=production`
- `REQUIRE_API_AUTH=true`
- `REQUIRE_FIREBASE_AUTH=true`
- `ALLOW_SHARED_TOKEN_AUTH=false`
- `SCHEDULER_API_TOKEN=<server-only long random token>` for scheduled job endpoints only
- `ALLOWED_ORIGINS=<comma-separated production web origins>`
- `FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`

Do not ship `API_PROXY_TOKEN`, `API_PROXY_TOKENS`, `EXPO_PUBLIC_API_PROXY_TOKEN`, or `EXPO_PUBLIC_LOCATIONIQ_API_KEY` in public production.
```

- [ ] **Step 2: Deploy API proxy with hardened env**

Set the deployed API proxy environment to:

```text
NODE_ENV=production
REQUIRE_API_AUTH=true
REQUIRE_FIREBASE_AUTH=true
ALLOW_SHARED_TOKEN_AUTH=false
SCHEDULER_API_TOKEN=<stored only in Cloud Run/Cloud Scheduler secrets>
```

Use the existing deployed proxy URL:

```text
https://apiproxy-r7pziiwpua-uc.a.run.app
```

- [ ] **Step 3: Update Cloud Scheduler headers**

Change scheduled job calls from:

```text
x-api-token: <old shared token>
```

to:

```text
x-scheduler-token: <same value as SCHEDULER_API_TOKEN>
```

Keep Cloud Run OIDC/IAM invocation enabled.

- [ ] **Step 4: Verify live health posture**

Run:

```powershell
Invoke-RestMethod -Uri "https://apiproxy-r7pziiwpua-uc.a.run.app/api/health" | ConvertTo-Json -Depth 6
```

Expected values:

```json
{
  "auth": {
    "requireApiAuth": true,
    "requireFirebaseAuth": true,
    "allowSharedTokenAuth": false
  }
}
```

- [ ] **Step 5: Verify unauthenticated protected route is blocked**

Run:

```powershell
try {
  Invoke-RestMethod -Uri "https://apiproxy-r7pziiwpua-uc.a.run.app/api/geocode?q=maple" -TimeoutSec 20
} catch {
  [int]$_.Exception.Response.StatusCode
}
```

Expected: `401`.

- [ ] **Step 6: Commit docs**

Run:

```powershell
git add docs/API-PROXY-OPERATIONS.md
git commit -m "docs(api): document hardened production auth"
```

---

## Task 3A: Google Sign-In Production Blocker

**Files:**
- Modify: `src/services/firebase/authService.js`
- Modify: `src/__tests__/authService.test.js`
- Modify: `scripts/preflight-android-production-env.js`

- [x] **Step 1: Reproduce the weak error handling in tests**

Added tests proving native Google cancellation is handled quietly and native `DEVELOPER_ERROR` returns an actionable setup message instead of the generic unexpected-error fallback.

- [x] **Step 2: Fix native Google sign-in error handling**

Updated `authService.signInWithGoogle()` to:

- treat `{ type: 'cancelled' }` as a quiet user cancellation
- remove the invalid `androidClientId` native configuration option
- map `DEVELOPER_ERROR` to a setup message that tells the operator to add the Android app signing SHA-1 to Firebase/Google Cloud and rebuild
- map Google Play Services failures to a user-friendly device message

- [x] **Step 3: Add production preflight guard**

Updated `scripts/preflight-android-production-env.js` to fail production Android checks when `google-services.json` does not include an Android OAuth client for `com.barrietransit.planner`.

- [x] **Step 4: Verify focused tests**

Run:

```powershell
npm run test:app -- --runTestsByPath src/__tests__/authService.test.js
```

Result: passed.

- [ ] **Step 5: External config still required**

Current local `google-services.json` does not include the required Android OAuth client. To fully fix Google sign-in:

1. Add the Android app signing SHA-1 certificate fingerprint for `com.barrietransit.planner` in Firebase/Google Cloud.
2. Download the updated `google-services.json`.
3. Replace the local file and EAS `GOOGLE_SERVICES_JSON` file secret.
4. Rebuild the Android app.
5. Run the production smoke checklist Google sign-in item.

---

## Task 4: Remediate Critical and High Dependency Findings

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `api-proxy/package.json`
- Modify: `api-proxy/package-lock.json`

- [ ] **Step 1: Capture the current audit baseline**

Run:

```powershell
npm audit --omit=dev
npm --prefix api-proxy audit --omit=dev
```

Expected: current findings include critical/high issues in `protobufjs`, `undici`, `fast-xml-parser`, `node-forge`, and related transitive packages.

- [ ] **Step 2: Align Expo packages first**

Run Task 5 before applying broad overrides, because Expo alignment may resolve several root findings.

- [ ] **Step 3: Add root overrides only for remaining critical/high transitive packages**

If critical/high root findings remain after Task 5, update root `package.json` `overrides` to the minimum patched versions needed:

```json
  "overrides": {
    "fast-xml-parser": "^5.7.0",
    "minimatch": "^10.2.3",
    "protobufjs": "^7.5.5",
    "node-forge": "^1.4.0",
    "undici": "^6.24.0"
  }
```

If `npm audit --omit=dev` still reports high/critical findings for `@xmldom/xmldom`, `brace-expansion`, `picomatch`, `tar`, `yaml`, or `protocol-buffers-schema`, add only the specific package and patched version reported by the audit output.

- [ ] **Step 4: Install root dependency changes**

Run:

```powershell
npm install
```

Expected: `package-lock.json` changes and install completes.

- [ ] **Step 5: Add API proxy overrides only for remaining critical/high transitive packages**

If API proxy critical/high findings remain, add this `overrides` block to `api-proxy/package.json`:

```json
  "overrides": {
    "fast-xml-parser": "^5.7.0",
    "protobufjs": "^7.5.5",
    "node-forge": "^1.4.0",
    "undici": "^7.24.0",
    "path-to-regexp": "^0.1.13"
  }
```

- [ ] **Step 6: Install API proxy dependency changes**

Run:

```powershell
npm --prefix api-proxy install
```

Expected: `api-proxy/package-lock.json` changes and install completes.

- [ ] **Step 7: Verify audits have no critical or high production findings**

Run:

```powershell
npm audit --omit=dev --audit-level=high
npm --prefix api-proxy audit --omit=dev --audit-level=high
```

Expected: both commands exit `0`.

- [ ] **Step 8: Verify tests**

Run:

```powershell
npm run test:all
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

Run:

```powershell
git add package.json package-lock.json api-proxy/package.json api-proxy/package-lock.json
git commit -m "fix(deps): remediate production audit findings"
```

---

## Task 5: Expo SDK Package Alignment

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install SDK-aligned package versions**

Run:

```powershell
npx expo install expo@~54.0.34 expo-asset@~12.0.13 expo-dev-client@~6.0.21 expo-file-system@~19.0.22 expo-notifications@~0.32.17 expo-updates@~29.0.17 react-native-svg@15.12.1
```

Expected: `package.json` and `package-lock.json` update.

- [ ] **Step 2: Verify Expo Doctor**

Run:

```powershell
npx expo-doctor
```

Expected: all checks pass.

- [ ] **Step 3: Verify app tests**

Run:

```powershell
npm run test:app
```

Expected: all app tests pass.

- [ ] **Step 4: Commit**

Run:

```powershell
git add package.json package-lock.json
git commit -m "chore(expo): align SDK package versions"
```

---

## Task 6: Clean Release Branch State

**Files:**
- Review all modified and untracked files from `git status --short`

- [ ] **Step 1: Review current working tree**

Run:

```powershell
git status --short
git diff --stat
```

Expected: every source, test, config, doc, and asset change is understood before release.

- [ ] **Step 2: Exclude local-only artifacts from commit scope**

Do not commit these local/generated artifacts unless there is a specific release reason:

```text
.emulator-current.png
outputs/
.tmp-*
.logs-*
android/app/build/
```

- [ ] **Step 3: Confirm ignored files are covered**

Run:

```powershell
git check-ignore .emulator-current.png outputs/ android/app/build/ 2>$null
```

Expected: generated artifacts are ignored. If a generated artifact is not ignored, add a precise pattern to `.gitignore`.

- [ ] **Step 4: Commit remaining reviewed app changes in logical groups**

Use small commits. Example grouping:

```powershell
git add src/components src/screens src/hooks src/services src/utils src/features src/context src/navigation src/config src/__tests__
git commit -m "feat(app): stabilize rider trip and navigation flows"

git add api-proxy api-proxy/__tests__
git commit -m "feat(api): stabilize detour and news operations"

git add assets app.base.json app.config.js eas.json jest.config.js package.json package-lock.json scripts docs
git commit -m "chore(release): prepare production Android build"
```

- [ ] **Step 5: Verify clean release branch**

Run:

```powershell
git status --short
```

Expected: no uncommitted source/config/test/doc changes. Local-only ignored files may remain hidden.

---

## Task 7: Detour Rollout Risk Control

**Files:**
- Modify: `eas.json`
- Modify: `docs/API-PROXY-OPERATIONS.md`
- Review if continuing pilot: `api-proxy/detour/staleClear.js`
- Review if continuing pilot: `api-proxy/detour/geometry/routeFamilyReconciliation.js`
- Test if continuing pilot: `api-proxy/__tests__/staleClear.test.js`
- Test if continuing pilot: `api-proxy/__tests__/detourGeometry.test.js`

- [ ] **Step 1: Disable rider-facing auto-detours for public production release**

In `eas.json`, change only the production profile value:

```json
"EXPO_PUBLIC_ENABLE_AUTO_DETOURS": "false"
```

Keep `development` and `preview` unchanged if detour pilot testing should continue.

- [ ] **Step 2: Verify production preflight no longer warns for public release**

Run:

```powershell
npm run prebuild:android:production
```

Expected: preflight passes without the auto-detour warning.

- [ ] **Step 3: Keep backend worker running for pilot observation**

Do not disable the backend worker if pilot data is still useful. The public app flag can be off while backend logs continue collecting evidence.

- [ ] **Step 4: Check live rollout health**

Run:

```powershell
Invoke-RestMethod -Uri "https://apiproxy-r7pziiwpua-uc.a.run.app/api/detour-rollout-health" | ConvertTo-Json -Depth 6
```

Expected for public release: no rider-facing auto-detours in production app. Expected for future detour launch: `launchReadiness.failedWarnings` is empty or explicitly accepted.

- [ ] **Step 5: If detours must ship publicly, fix flapping before re-enabling**

Inspect recent route 7A/7B/8A/8B events:

```powershell
Invoke-RestMethod -Uri "https://apiproxy-r7pziiwpua-uc.a.run.app/api/detour-logs?routeId=8A&limit=100" -Headers @{ Authorization = "Bearer <Firebase ID token from an admin test user>" } | ConvertTo-Json -Depth 6
```

Use the evidence to tune only the smallest relevant logic:

- `api-proxy/detour/staleClear.js` if detours are clearing too quickly
- `api-proxy/detour/geometry/routeFamilyReconciliation.js` if sibling-route handoff is causing repeated clear/re-detect cycles

After any tuning, add a focused regression test in the matching test file and run:

```powershell
npm run test:api
```

- [ ] **Step 6: Commit public detour posture**

Run:

```powershell
git add eas.json docs/API-PROXY-OPERATIONS.md
git commit -m "chore(release): keep auto-detours in pilot for public build"
```

---

## Task 8: Manual Smoke Checklist and Android VersionCode

**Files:**
- Create: `docs/PRODUCTION-SMOKE-CHECKLIST.md`
- Modify: `app.base.json`

- [ ] **Step 1: Create smoke checklist document**

Create `docs/PRODUCTION-SMOKE-CHECKLIST.md`:

```md
# Production Smoke Checklist

Date:
Build:
Tester:

## Android release build

- [ ] App launches from a fresh install
- [ ] Main map renders
- [ ] Current location permission prompt is understandable
- [ ] Stop search returns believable Barrie stops
- [ ] Route search returns believable Barrie routes
- [ ] Stop arrivals render or show a clear unavailable state
- [ ] Trip planning returns at least one plausible trip
- [ ] Trip details open from a planned trip
- [ ] Navigation starts from a planned trip
- [ ] Favorites add/remove works for a signed-in user
- [ ] Alerts screen loads with empty and populated states handled
- [ ] News screen loads
- [ ] Profile/settings/auth screens do not expose secrets or debug data

## Web build

- [ ] `npm run web:dev` loads the app
- [ ] Web map renders
- [ ] Stop search works through the proxy
- [ ] Trip planning works through the proxy

## Backend

- [ ] `/api/health` returns `status: ok`
- [ ] Protected API route without auth returns `401`
- [ ] Authenticated geocoding request succeeds
- [ ] Detour rollout health reviewed

## Result

- [ ] Pass
- [ ] Fail

Notes:
```

- [ ] **Step 2: Check Play Console versionCode**

Compare `app.base.json` Android `versionCode` with the highest version already uploaded to Play Console.

If the latest Play Console version is `15`, change `app.base.json` to:

```json
"versionCode": 16
```

If the latest Play Console version is higher, set `versionCode` to one greater than that highest value.

- [ ] **Step 3: Run production preflight**

Run:

```powershell
npm run prebuild:android:production
```

Expected: preflight passes.

- [ ] **Step 4: Commit**

Run:

```powershell
git add docs/PRODUCTION-SMOKE-CHECKLIST.md app.base.json
git commit -m "chore(release): add smoke checklist and bump android version"
```

---

## Task 9: Final Production Readiness Verification Script

**Files:**
- Create: `scripts/verify-production-readiness.ps1`

- [ ] **Step 1: Create the verification script**

Create `scripts/verify-production-readiness.ps1`:

```powershell
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
```

- [ ] **Step 2: Run the script**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-production-readiness.ps1
```

Expected: script completes and prints `Production readiness verification passed.`

- [ ] **Step 3: Run manual smoke checklist**

Fill out `docs/PRODUCTION-SMOKE-CHECKLIST.md` for the exact release build.

Expected: every required checklist item passes or has a documented release-blocking issue.

- [ ] **Step 4: Commit**

Run:

```powershell
git add scripts/verify-production-readiness.ps1 docs/PRODUCTION-SMOKE-CHECKLIST.md
git commit -m "chore(release): add production readiness verification"
```

---

## Release Gate

Do not submit to public production until all are true:

- `git status --short` shows no uncommitted source/config/test/doc changes.
- `npm run test:all` passes.
- `npm run prebuild:android:production` passes.
- `npx expo-doctor` passes.
- `npm audit --omit=dev --audit-level=high` passes.
- `npm --prefix api-proxy audit --omit=dev --audit-level=high` passes.
- `npm run build:release` produces a fresh AAB.
- Live `/api/health` reports:
  - `requireApiAuth: true`
  - `requireFirebaseAuth: true`
  - `allowSharedTokenAuth: false`
- Unauthenticated protected API routes return `401`.
- Public production build does not enable rider-facing auto-detours unless detour rollout health warnings are resolved or explicitly accepted.
- `app.base.json` Android `versionCode` is higher than the highest uploaded Play Console version.
- Manual smoke checklist passes on Android release build and web dev flow.
