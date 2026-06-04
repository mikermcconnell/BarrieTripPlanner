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
- baseline mutation routes require a Firebase `admin=true` or `detourAdmin=true` claim:
  - `POST /api/baseline/set`
  - `POST /api/baseline/routes`
  - `POST /api/baseline/clear`
- `POST /api/detour-run-once` requires either:
  - the trusted scheduler token on `x-scheduler-token`
  - or a Firebase `admin=true` or `detourAdmin=true` claim
- `POST /api/news-run-once` requires either:
  - the trusted scheduler token on `x-scheduler-token`
  - or a Firebase `admin=true`, `detourAdmin=true`, or `surveyAdmin=true` claim
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

Public rider clients should obtain Firebase ID tokens before calling protected proxy routes. For riders who are not signed in, enable Firebase Anonymous Authentication so the app can mint a low-privilege anonymous Firebase token without exposing a shared proxy secret.

### Detour worker

- `DETOUR_WORKER_ENABLED=true`
- `DETOUR_WORKER_MODE=interval|manual|scheduled`
- `DETOUR_DETECTOR_VERSION=v1|v2`
  - default `v1` uses `activeDetours`, `detourHistory`, and `systemState/detourRuntime`
  - `v2` uses isolated event storage: `activeDetourEventsV2`, `detourEventHistoryV2`, and `systemState/detourRuntimeV2`
  - optional explicit overrides: `DETOUR_ACTIVE_COLLECTION`, `DETOUR_HISTORY_COLLECTION`, `DETOUR_RUNTIME_STATE_COLLECTION`, `DETOUR_RUNTIME_STATE_DOC`
- `DETOUR_ENABLE_ROUTE_FAMILY_HANDOFF=true|false`
  - route-family handoff treats a confirmed closure segment as one physical detour event and can project it onto sibling route variants/directions when the source segment has confirmed boundaries
  - point-only short deviations are not projected because there is no reliable closed segment to map to the sibling route
- `DETOUR_MIN_UNIQUE_VEHICLES=2`
  - values below 2 are ignored; rider-facing detours require two unique vehicles on the same route
- `DETOUR_HISTORY_ENABLED=true`
- `DETOUR_HISTORY_RETENTION_DAYS=30`
- Recommended low-cost production shape:
  - `DETOUR_WORKER_MODE=scheduled`
  - Cloud Scheduler calls `POST /api/detour-run-once` every 60 seconds during service hours.
  - `DETOUR_BURST_SAMPLING_ENABLED=false`
  - Optional 30-second offset sampling uses Cloud Tasks rather than sleeping inside a Cloud Run request:
    - `DETOUR_OFFSET_SAMPLING_ENABLED=true`
    - `DETOUR_OFFSET_SAMPLE_DELAY_SECONDS=30`
    - `DETOUR_DISTRIBUTED_LOCK_ENABLED=true`
    - `DETOUR_OFFSET_TASK_QUEUE=bttp-detour-offset-samples`
    - `DETOUR_OFFSET_TASK_LOCATION=us-central1`
    - `DETOUR_OFFSET_TASK_TARGET_URL=https://YOUR_CLOUD_RUN_URL/api/detour-run-once`
  - The primary scheduler tick enqueues a delayed Cloud Task that calls the same endpoint with `source=offset-30s`.
  - Each run collects one GTFS-RT snapshot.
  - Continuity comes from backend memory, not multiple pulses inside one request.
  - Duplicate GTFS vehicle snapshots are skipped so repeated feed data does not count as fresh detector evidence.
- Detour clearing policy:
  - Active detector-owned detours clear from same-bus normal-route GPS traversal through the affected area, not from elapsed time, bus absence, route-family activity, or official notice timing.
  - Default clear proof uses a clear window around the affected segment: at least 1,000m where possible, clipped to the route shape ends. The same bus must cover about 95% of that window on the baseline route (`DETOUR_CLEAR_WINDOW_MIN_METERS`, `DETOUR_CLEAR_WINDOW_MIN_COVERAGE_RATIO`). This prevents a bus from clearing its own detour just because it rejoins the route after the off-route section.
  - Collective clear fallback: if no single bus gives a clean traversal, two or more unique same-route trips/vehicles can collectively clear a geometry-backed detour only when their on-route sample intervals cover the same clear window and no newer off-route evidence has returned.
  - Clear-count gotcha: do not treat clearing as "4 pings anywhere on route". The configured consecutive-on-route value is a sampling guard/diagnostic; active geometry-backed detours clear only after same-bus normal-route traversal or the collective two-trip/vehicle fallback through the clear window. A single GPS point cannot prove traversal. In practice this means at least two useful on-route GPS samples far enough apart to show route progress, often more on long segments, followed by a later tick to finalize `clear-pending`.
  - The publisher delete path is also proof-gated: if a route disappears from the current detector output, the Firestore `activeDetours` document is retained unless the previous published snapshot has `clearReason: "normal-route-observed"`.
  - Zero-current detours are not cleared automatically. They stay active until another bus adds off-route detour evidence or proves normal routing with GPS traversal through the affected segment.
  - If an active snapshot has no usable closure geometry or clear window, the automated detector must not infer a clear from elapsed time, same-route reporting, or two generic same-route normal pings. Keep the record for operations review and hide it from riders only for safety reasons such as insufficient or invalid geometry; automatic clearing still requires GPS evidence that can be tied to the affected segment, or an explicit operator/admin clear.
  - End-of-service freezes detection and drops current vehicle associations, but it does not clear active detours by itself.
  - Short-detour candidate evidence is captured from the first off-route GPS point, but remains backend-only until the same corridor has the required three off-route pings and a second unique same-route trip/vehicle corroborates the same segment.
  - Runtime state stores the latest per-vehicle projection diagnostic (`lastRouteProjection`) with distance from route, thresholds, shape ID, classification, and sample time. Use this to explain missed detections before changing thresholds.
- Optional likely-path road matching:
  - `DETOUR_ROAD_MATCHING_ENABLED=false`
  - `DETOUR_ROAD_MATCHING_BASE_URL=...` for an OSRM-compatible match service
  - road matching is gated by GPS confidence: the segment must have entry and exit boundary anchors plus either a same-vehicle trace or two distinct buses corroborating the same corridor before a rider-facing likely path is generated.
  - `DETOUR_ROAD_MATCHING_ROUTE_FALLBACK_ENABLED=true` to fall back from OSRM match to OSRM route when trace matching cannot produce usable road geometry
  - `DETOUR_ROAD_MATCHING_RADIUS_METERS=75` to control GPS snap tolerance for OSRM match
  - `DETOUR_MIN_SAME_VEHICLE_PATH_POINTS=2` sets the default minimum off-route points from that same vehicle before the likely path can be shown
  - `DETOUR_ROAD_MATCHING_BLOCKED_*` rejects likely detour paths that visibly reuse the closed regular route segment
  - `DETOUR_ROAD_MATCHING_BACKTRACK_*` strips route-fallback out-and-back spurs caused by forced waypoints
  - `DETOUR_SIMULATION_OFFSET_CANDIDATES_METERS=275,600,1000,1500,1800` lets local dummy detours try wider synthetic GPS paths until the matcher finds a route that does not reuse the closed segment
- `BASELINE_AUTO_INIT=false` — required for validation/production so current live GTFS is not silently accepted as the pre-detour baseline
- `DETOUR_REQUIRE_SAFE_BASELINE=true` — blocks detector ticks when only live-fallback or auto-initialized baseline data is available
- Firebase Admin credentials

### Transit news worker

- `NEWS_WORKER_ENABLED=true`
- `NEWS_WORKER_MODE=interval|manual|scheduled`
- Firebase Admin credentials
- Polls MyRide's public news JSON endpoint every 6 hours in `interval` mode:
  - `https://www.myridebarrie.ca/News/GetAllNews`
- In `manual` or `scheduled` mode, run one sync with `POST /api/news-run-once`.
- Publishes normalized items to Firestore `transitNews` and parsed rider-facing impacts to `transitNewsImpacts`.

Recommended modes:

- `interval` — legacy always-on loop inside the service process
- `manual` — no background loop; trigger single ticks with `POST /api/detour-run-once` or `POST /api/news-run-once`
- `scheduled` — same single-tick behavior, intended for Cloud Scheduler / scheduled functions

For non-production validation and cost control, prefer `manual` or `scheduled`.

`DETOUR_ENABLE_ROUTE_FAMILY_HANDOFF=false` is useful during detour debugging when you need to verify whether wrong geometry is coming from sibling-route projection rather than the underlying detector.

Long-running detours also retain learned GPS evidence separately from the short live evidence window. This lets trusted alternate paths and boundary candidates survive worker restarts and scheduled/manual run-once hydration.

Persistence is split into:

- `persistentDetoursAuto` — route-specific persistent records and clear state.
- `persistentDetourGeometriesAuto` — global learned physical geometry keyed by `sharedGeometryFingerprint`.

Global learned geometry does not publish a detour by itself. A route still needs the normal confirmation rule first: three matching off-route pings and two unique same-route trip/vehicle signatures. After that, the route can reuse trusted global geometry for display or restart recovery.

For operations, prefer the explicit timestamp fields:

- `latestGpsEvidenceAt` — newest actual off-route GPS evidence.
- `geometryLastEvidenceAt` — newest GPS evidence used to build the displayed geometry.
- `recordUpdatedAt` / Firestore `updatedAt` — persistence or document write time.

Do not treat ordinary persistence refreshes as fresh GPS evidence.

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
- `GET /api/news-status`
- `POST /api/news-run-once`

Baseline endpoints:

- `GET /api/baseline-status`
- `POST /api/baseline/set` — replace the full baseline from current GTFS
- `POST /api/baseline/routes` with `{ "routeIds": ["12"] }` — replace only selected route baselines from current GTFS
- `POST /api/baseline/clear`

Only detour admins should run baseline mutation endpoints. Do not refresh the baseline during a known active detour unless you intentionally want that detour treated as normal service.

`GET /api/detour-rollout-health` includes a `launchReadiness` block with pass/warn/fail checks for recent ticks, consecutive failures, publish failure rate, flapping routes, and false-positive rate. The false-positive rate uses a 7-day window by default and counts cleared detours under 5 minutes against detected detours. It also reports suspicious short-lived detours under 15 minutes, grouped by confidence, so operators can review likely false positives that lasted longer than the strict 5-minute threshold.
Launch readiness also checks whether the stored baseline diverges from current live GTFS. Baseline divergence is a critical blocker because it can create false detours or wrong affected-stop output. Stale/headway warnings are monitoring evidence only and should be reviewed before public rollout; they should not clear active detours without normal-route GPS proof.

`GET /api/detour-debug` without `routeId` is the safe summary endpoint. Route-specific debug (`?routeId=...`) can expose vehicle-level evidence and is blocked in production unless the caller has an admin Firebase claim or `DETOUR_DEBUG_ROUTE_DETAILS_ENABLED=true` is set intentionally.

## Scheduled / Triggered Jobs

There is no required internal scheduler in `api-proxy`.

Operational tasks are expected to be driven externally when possible:

- detour detection can run continuously only in `DETOUR_WORKER_MODE=interval`
- preferred low-cost detour operation is `DETOUR_WORKER_MODE=scheduled` with an external scheduler calling `POST /api/detour-run-once`
- `DETOUR_WORKER_MODE=manual` is preferred for ad hoc testing and debugging
- preferred low-cost news operation is `NEWS_WORKER_MODE=scheduled` with an external scheduler calling `POST /api/news-run-once` every 6 hours
- survey digest is triggered by `POST /api/survey/send-digest`
- any recurring digest or refresh flow should be run by platform cron/scheduler, not hidden process-local timers

Operational simplification rule:

- Treat `scheduled` and `manual` as the supported normal modes.
- Treat `interval` and burst sampling as legacy/diagnostic paths only.
- Do not add new production behavior that depends on a long-running in-process loop.


### Platform map endpoint

`GET /api/platform-maps/:hubId` returns a cached single-page PNG rendered from Barrie's public platform map PDF.

Supported hub IDs:

- `allandale-terminal`
- `downtown-hub`
- `park-place-terminal`
- `barrie-south-go`
- `georgian-college`

The endpoint is public because it serves fixed public City of Barrie content and must be loadable by app image components. It does not accept arbitrary source URLs or page numbers.

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
     - confirm `vehicleFeed.freshness.status` is not `stale` before judging detour detection output; a stale feed can legitimately produce `0` usable vehicles
   - `GET /api/detour-rollout-health`
   - `POST /api/detour-run-once` with scheduler auth or a detour-admin Firebase token (for manual/scheduled mode)
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
- maximum instances: low bounded value, e.g. `3`
- CPU allocation: request-based/default
- authentication: **required**
- timeout: enough for one detour tick plus GTFS fetch margin

If deploying through Firebase Functions Gen 2, keep `memory: "512MiB"`, `timeoutSeconds: 120`, `minInstances: 0`, `maxInstances: 3`, and `cpu: "gcf_gen1"` for the low-cost tier. Firebase Gen 2 otherwise defaults low-memory functions to 1 full CPU, which is more than this mostly I/O-bound proxy and scheduled detour worker need during validation. Do not cap this shared proxy at one instance: fractional-CPU functions can reject concurrent requests while a scheduled detour tick or app/API traffic is running.

### Suggested environment for Cloud Run

- `DETOUR_WORKER_ENABLED=true`
- `DETOUR_WORKER_MODE=scheduled`
- `DETOUR_BURST_SAMPLING_ENABLED=false`
- `DETOUR_OFFSET_SAMPLING_ENABLED=true` for 30-second offset sampling through Cloud Tasks
- `DETOUR_OFFSET_SAMPLE_DELAY_SECONDS=30`
- `DETOUR_DISTRIBUTED_LOCK_ENABLED=true`
- `DETOUR_OFFSET_TASK_QUEUE=bttp-detour-offset-samples`
- `DETOUR_OFFSET_TASK_LOCATION=us-central1`
- `DETOUR_OFFSET_TASK_TARGET_URL=https://YOUR_CLOUD_RUN_URL/api/detour-run-once`
- `DETOUR_VEHICLE_TRACE_WINDOW_MS=1200000`
- `DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS=10800000`
- `DETOUR_CANDIDATE_CONFIRMATION_HEADWAY_MULTIPLIER=2`
- `DETOUR_CANDIDATE_CONFIRMATION_BUFFER_MS=600000`
- `DETOUR_CANDIDATE_CONFIRMATION_MAX_MS=10800000`
- `DETOUR_HISTORY_ENABLED=true`
- `NEWS_WORKER_ENABLED=true`
- `NEWS_WORKER_MODE=scheduled`
- `REQUIRE_API_AUTH=true`
- `ALLOW_SHARED_TOKEN_AUTH=true`
- `API_PROXY_TOKEN=<long-random-secret>`
- `REQUIRE_FIREBASE_AUTH=false` for testing
- valid Firebase Admin credentials

For public production, shared-token auth must be disabled and Firebase Bearer auth must be enabled. Use `SCHEDULER_API_TOKEN` only for server-to-server scheduler calls such as `POST /api/detour-run-once` and `POST /api/news-run-once`.

### Example deploy flow

From `api-proxy/`, build and deploy a container to Cloud Run using your normal artifact flow, then configure:

- service name: e.g. `bttp-api-proxy`
- region: e.g. `northamerica-northeast1` or the region you already use
- auth required
- `min instances = 0`


### Optional 30-second offset sampling

Cloud Scheduler is minute-granularity, so true half-minute sampling is handled by Cloud Tasks:

1. Scheduler runs the primary `POST /api/detour-run-once` once per minute.
2. The API run enqueues one Cloud Task scheduled 30 seconds later.
3. The task calls `POST /api/detour-run-once?source=offset-30s` with the scheduler token header.
4. A Firestore-backed distributed lock prevents overlapping Cloud Run instances from processing at the same time.

Required setup:

```bash
gcloud tasks queues create bttp-detour-offset-samples --location=YOUR_REGION
```

The Cloud Run service account needs permission to enqueue tasks, for example `roles/cloudtasks.enqueuer` on the project or queue. Keep `DETOUR_BURST_SAMPLING_ENABLED=false`; burst sampling is only for short pilots because it holds a request open while waiting.

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
  --schedule="* 0,5-23 * * *" \
  --time-zone="America/Toronto" \
  --uri="https://YOUR_CLOUD_RUN_URL/api/detour-run-once" \
  --http-method=POST \
  --headers="x-scheduler-token=YOUR_LONG_RANDOM_TOKEN" \
  --oidc-service-account-email="bttp-detour-scheduler@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --oidc-token-audience="https://YOUR_CLOUD_RUN_URL" \
  --attempt-deadline=60s \
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
- `npm run check:detour-scheduler`
  - confirms the Cloud Scheduler `x-scheduler-token` still matches Cloud Run `SCHEDULER_API_TOKEN`
  - confirms recent scheduler calls are `2xx`, with no recent `401`
  - confirms active detour documents are still being refreshed
- confirm Firestore writes:
  - configured active detour collection, usually `activeDetours` or V2 event `activeDetourEventsV2`
  - configured history collection, usually `detourHistory` or V2 event `detourEventHistoryV2`
  - configured runtime doc, usually `systemState/detourRuntime` or lab `systemState/detourRuntimeV2`
- resume scheduler briefly and confirm repeated ticks advance state

## Rollback Notes

If deployment fails:

- disable `DETOUR_WORKER_ENABLED`
- keep `/api/health` available for smoke checks
- verify Firebase Admin credentials before re-enabling protected worker features
