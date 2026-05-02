# API Proxy Operations

Date: 2026-03-07
Status: Current
Owner: Codex

## Purpose

`api-proxy/` is an independently deployable backend service for:

- LocationIQ proxy routes
- walking directions proxying
- detour worker / detour publishing
- survey administration and survey digest endpoints
- optional local AI enrichments such as survey comment summaries

It should not rely on the app package or Expo runtime to build or deploy.

## Deployment Boundary

`api-proxy` is a standalone Node service:

- entrypoint: `api-proxy/index.js`
- runtime: Node 22
- install from `api-proxy/package.json`
- no `file:..` dependency on the root app package

## Auth Model

### Public

- `GET /api/health`

### Protected client routes

Protected `/api/*` routes require `REQUIRE_API_AUTH=true`.

Production expectation:

- `REQUIRE_API_AUTH=true`
- `REQUIRE_FIREBASE_AUTH=true`
- `ALLOW_SHARED_TOKEN_AUTH=false`
- `SCHEDULER_API_TOKEN` may be used only by trusted scheduler jobs on allowlisted job endpoints

Non-production fallback:

- shared token auth may be enabled with `ALLOW_SHARED_TOKEN_AUTH=true`
- configure `API_PROXY_TOKEN` or `API_PROXY_TOKENS`

### Admin-only routes

These are not public rider endpoints:

- survey admin routes use the same `/api` auth boundary as other protected routes
- in production, survey admin access requires Firebase Bearer auth plus either:
  - a Firebase custom claim of `admin=true` or `surveyAdmin=true`
  - or a UID listed in `SURVEY_ADMIN_UIDS`
- detour debug may use `DETOUR_DEBUG_API_KEY` only outside production

## Required Environment

### Core proxy

- `LOCATIONIQ_API_KEY`
- `ALLOWED_ORIGINS`
- `REQUIRE_API_AUTH=true`

### Production auth hardening

- `NODE_ENV=production`
- `REQUIRE_API_AUTH=true`
- `REQUIRE_FIREBASE_AUTH=true`
- `ALLOW_SHARED_TOKEN_AUTH=false`
- `SCHEDULER_API_TOKEN=<server-only long random token>` for scheduled job endpoints only
- `ALLOWED_ORIGINS=<comma-separated production web origins>`
- `FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`
- `SURVEY_ADMIN_UIDS=uid1,uid2` only if admin custom claims are not available
- Firebase Functions only: `API_PROXY_FUNCTION_INVOKER=private` for production platform auth hardening

Do not ship `API_PROXY_TOKEN`, `API_PROXY_TOKENS`, `EXPO_PUBLIC_API_PROXY_TOKEN`, or `EXPO_PUBLIC_LOCATIONIQ_API_KEY` in public production.

### Detour worker

- `DETOUR_WORKER_ENABLED=true`
- `DETOUR_WORKER_MODE=interval|manual|scheduled`
- `DETOUR_ENABLE_ROUTE_FAMILY_HANDOFF=true|false`
- `DETOUR_HISTORY_ENABLED=true`
- `DETOUR_HISTORY_RETENTION_DAYS=30`
- Optional stale-detour safety clearing:
  - `DETOUR_STALE_AUTO_CLEAR_ENABLED=true` enables a publisher-side guard that removes active detours whose latest evidence is stale while buses in the same route family are still reporting
  - `DETOUR_STALE_AUTO_CLEAR_MIN_MS=2700000` minimum stale window (45 minutes)
  - `DETOUR_STALE_AUTO_CLEAR_HEADWAY_MULTIPLIER=2` waits roughly two scheduled headways
  - `DETOUR_STALE_AUTO_CLEAR_BUFFER_MS=600000` adds a 10-minute buffer
  - `DETOUR_STALE_AUTO_CLEAR_MAX_MS=10800000` caps the stale window at 3 hours
  - `DETOUR_STALE_AUTO_CLEAR_DEFAULT_HEADWAY_MS=3600000` fallback when GTFS does not have enough nearby trips
  - `DETOUR_ZERO_VEHICLE_STALE_AUTO_CLEAR_MS=720000` clears zero-vehicle stale detours sooner when route-family buses are still reporting
  - `DETOUR_ZERO_VEHICLE_STALE_AUTO_CLEAR_MIN_AGE_MS=600000` preserves the minimum visibility window before zero-vehicle stale clearing
- Optional likely-path road matching:
  - `DETOUR_ROAD_MATCHING_ENABLED=false`
  - `DETOUR_ROAD_MATCHING_BASE_URL=...` for an OSRM-compatible match service
  - `DETOUR_ROAD_MATCHING_ROUTE_FALLBACK_ENABLED=true` to fall back from OSRM match to OSRM route when trace matching cannot produce usable road geometry
  - `DETOUR_ROAD_MATCHING_RADIUS_METERS=75` to control GPS snap tolerance for OSRM match
  - `DETOUR_ROAD_MATCHING_BLOCKED_*` rejects likely detour paths that visibly reuse the closed regular route segment
  - `DETOUR_ROAD_MATCHING_BACKTRACK_*` strips route-fallback out-and-back spurs caused by forced waypoints
  - `DETOUR_SIMULATION_OFFSET_CANDIDATES_METERS=275,600,1000,1500,1800` lets local dummy detours try wider synthetic GPS paths until the matcher finds a route that does not reuse the closed segment
- `BASELINE_AUTO_INIT=false` — required for validation/production so current live GTFS is not silently accepted as the pre-detour baseline
- `DETOUR_REQUIRE_SAFE_BASELINE=true` — blocks detector ticks when only live-fallback or auto-initialized baseline data is available
- Firebase Admin credentials

### Transit news worker

- `NEWS_WORKER_ENABLED=true`
- Firebase Admin credentials
- Polls MyRide's public news JSON endpoint every 6 hours:
  - `https://www.myridebarrie.ca/News/GetAllNews`
- Publishes normalized items to Firestore `transitNews` for the app profile news screen.

Recommended modes:

- `interval` — legacy always-on loop inside the service process
- `manual` — no background loop; trigger single ticks with `POST /api/detour-run-once`
- `scheduled` — same single-tick behavior, intended for Cloud Scheduler / scheduled functions

For non-production validation and cost control, prefer `manual` or `scheduled`.

`DETOUR_ENABLE_ROUTE_FAMILY_HANDOFF=false` is useful during detour debugging when you need to verify whether wrong route labels are coming from sibling-route projection rather than the underlying detector.

### Optional admin flows

- `DETOUR_DEBUG_API_KEY`
- `DETOUR_PROXY_KEY`
- `DETOUR_DEBUG_ROUTE_DETAILS_ENABLED=true` only when production route-level debug evidence is explicitly needed by trusted operators

### Optional local AI

Local AI is optional and should never block rider-critical flows.

- `LOCAL_AI_ENABLED=true`
- `LOCAL_AI_TRANSPORT=http`
- `LOCAL_AI_BASE_URL=...` (OpenAI-compatible local endpoint)
- `LOCAL_AI_MODEL=...`
- `LOCAL_AI_TIMEOUT_MS=5000`

## Health Checks

Primary endpoint:

- `GET /api/health`

The health response now includes:

- service identity
- auth mode flags
- shared-token availability
- feature/config booleans for LocationIQ, detour worker, history, detour debug posture, survey admin posture, local AI posture, and Firebase Admin credentials

Additional local AI endpoint:

- `GET /api/ai-status`

Operational detour endpoints:

- `GET /api/detour-status`
- `GET /api/detour-rollout-health`
- `GET /api/detour-logs?limit=100`
- `POST /api/detour-run-once`

Baseline endpoints:

- `GET /api/baseline-status`
- `POST /api/baseline/set` — replace the full baseline from current GTFS
- `POST /api/baseline/routes` with `{ "routeIds": ["12"] }` — replace only selected route baselines from current GTFS
- `POST /api/baseline/clear`

`GET /api/detour-rollout-health` includes a `launchReadiness` block with pass/warn/fail checks for recent ticks, consecutive failures, publish failure rate, flapping routes, and false-positive rate. The false-positive rate uses a 7-day window by default and counts cleared detours under 5 minutes against detected detours. It also reports suspicious short-lived detours under 15 minutes, grouped by confidence, so operators can review likely false positives that lasted longer than the strict 5-minute threshold.

`GET /api/detour-debug` without `routeId` is the safe summary endpoint. Route-specific debug (`?routeId=...`) can expose vehicle-level evidence and is blocked in production unless the caller has an admin Firebase claim or `DETOUR_DEBUG_ROUTE_DETAILS_ENABLED=true` is set intentionally.

## Scheduled / Triggered Jobs

There is no required internal scheduler in `api-proxy`.

Operational tasks are expected to be driven externally when possible:

- detour detection can run continuously only in `DETOUR_WORKER_MODE=interval`
- preferred low-cost detour operation is `DETOUR_WORKER_MODE=scheduled` with an external scheduler calling `POST /api/detour-run-once`
- `DETOUR_WORKER_MODE=manual` is preferred for ad hoc testing and debugging
- survey digest is triggered by `POST /api/survey/send-digest`
- any recurring digest or refresh flow should be run by platform cron/scheduler, not hidden process-local timers

### Detour runtime state

Single-tick detour execution persists detector runtime state to Firestore so the next invocation can resume:

- detector per-vehicle counters
- active route/segment lifecycle state
- evidence windows needed for geometry
- clear-pending timing state

If Firebase Admin credentials are missing, run-once ticks still execute, but runtime state persistence, detour publishing, and history logging are disabled.

## Deployment Checklist

1. `cd api-proxy && npm install`
2. set `LOCATIONIQ_API_KEY`
3. set Firebase Admin credentials if detour worker or Firebase auth is enabled
4. set `ALLOWED_ORIGINS`
5. enforce production auth:
   - `REQUIRE_FIREBASE_AUTH=true`
   - `ALLOW_SHARED_TOKEN_AUTH=false`
6. verify:
   - `GET /api/health`
   - `GET /api/detour-status`
   - `GET /api/detour-rollout-health`
   - `POST /api/detour-run-once` (for manual/scheduled mode)
7. for production detour rollout, confirm `detour-rollout-health.launchReadiness.status` is at least `pilot_ready_with_cautions` and review every failed warning before enabling the rider feature flag

### Recommended non-production testing posture

- `DETOUR_WORKER_ENABLED=true`
- `DETOUR_WORKER_MODE=manual`
- keep the scheduler paused by default
- trigger `POST /api/detour-run-once` during validation sessions
- only enable minute-based scheduling during planned live test windows

## Recommended Cheap Detour Deployment Shape

For this repo, the preferred low-cost detour setup is:

- deploy `api-proxy` to **Cloud Run**
- set `DETOUR_WORKER_ENABLED=true`
- set `DETOUR_WORKER_MODE=scheduled`
- keep Cloud Run **authenticated** (not public)
- create **one Cloud Scheduler HTTP job** that calls `POST /api/detour-run-once`
- send both:
  - Cloud Scheduler **OIDC auth** for Cloud Run IAM
  - `x-scheduler-token` header for the app's own scheduled-job auth middleware

Why both:

- Cloud Run IAM protects the service at the platform boundary
- `api-proxy` still enforces its own `/api/*` auth middleware
- scheduled jobs use `SCHEDULER_API_TOKEN`, while rider/client routes use Firebase Bearer auth
- using both avoids adding Cloud-Run-specific auth exceptions in app code

### Cloud Run service settings

Recommended for testing / low-cost validation:

- minimum instances: `0`
- maximum instances: `1`
- CPU allocation: request-based/default
- authentication: **required**
- timeout: enough for one detour tick plus GTFS fetch margin

### Suggested environment for Cloud Run

- `DETOUR_WORKER_ENABLED=true`
- `DETOUR_WORKER_MODE=scheduled`
- `DETOUR_HISTORY_ENABLED=true`
- `REQUIRE_API_AUTH=true`
- `ALLOW_SHARED_TOKEN_AUTH=true`
- `API_PROXY_TOKEN=<long-random-secret>`
- `REQUIRE_FIREBASE_AUTH=false` for testing
- valid Firebase Admin credentials

For public production, shared-token auth must be disabled and Firebase Bearer auth must be enabled. Use `SCHEDULER_API_TOKEN` only for server-to-server scheduler calls such as `POST /api/detour-run-once`.

### Example deploy flow

From `api-proxy/`, build and deploy a container to Cloud Run using your normal artifact flow, then configure:

- service name: e.g. `bttp-api-proxy`
- region: e.g. `northamerica-northeast1` or the region you already use
- auth required
- `min instances = 0`

### Example Cloud Scheduler pattern

Create a dedicated scheduler service account, grant it `roles/run.invoker` on the Cloud Run service, and create one HTTP job that:

- method: `POST`
- URL: `https://<your-cloud-run-service>/api/detour-run-once`
- auth: OIDC token
- audience: your Cloud Run service URL
- headers: `x-scheduler-token=<same SCHEDULER_API_TOKEN>`

### Example `gcloud` commands

Create a service account:

```bash
gcloud iam service-accounts create bttp-detour-scheduler \
  --display-name "BTTP Detour Scheduler"
```

Grant Cloud Run invoke permission:

```bash
gcloud run services add-iam-policy-binding bttp-api-proxy \
  --region=YOUR_REGION \
  --member=serviceAccount:bttp-detour-scheduler@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/run.invoker
```

Create the scheduler job in paused-safe testing form:

```bash
gcloud scheduler jobs create http bttp-detour-run-once \
  --location=YOUR_REGION \
  --schedule="*/1 * * * *" \
  --time-zone="America/Toronto" \
  --uri="https://YOUR_CLOUD_RUN_URL/api/detour-run-once" \
  --http-method=POST \
  --headers="x-scheduler-token=YOUR_LONG_RANDOM_TOKEN" \
  --oidc-service-account-email="bttp-detour-scheduler@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --oidc-token-audience="https://YOUR_CLOUD_RUN_URL" \
  --attempt-deadline=30s \
  --max-retry-attempts=0
```

Then pause/resume as needed:

```bash
gcloud scheduler jobs pause bttp-detour-run-once --location=YOUR_REGION
gcloud scheduler jobs resume bttp-detour-run-once --location=YOUR_REGION
```

### Testing recommendation

Do not leave the job running full-time yet.

Instead:

1. deploy Cloud Run in `scheduled` mode
2. verify `POST /api/detour-run-once` manually
3. create the scheduler job
4. keep it paused by default
5. resume only during planned detour validation windows

### Quick validation checklist

- `GET /api/health`
- `GET /api/detour-status`
- one manual `POST /api/detour-run-once`
- confirm Firestore writes:
  - `activeDetours`
  - `detourHistory`
  - `systemState/detourRuntime`
- resume scheduler briefly and confirm repeated ticks advance state

## Rollback Notes

If deployment fails:

- disable `DETOUR_WORKER_ENABLED`
- keep `/api/health` available for smoke checks
- verify Firebase Admin credentials before re-enabling protected worker features
