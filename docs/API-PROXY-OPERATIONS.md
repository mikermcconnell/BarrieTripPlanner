# API Proxy Operations

Date: 2026-03-07
Status: Current
Owner: Codex

## Purpose

`api-proxy/` is an independently deployable backend service for:

- LocationIQ proxy routes
- walking directions proxying
- detour worker / detour publishing
- official baseline-impact scanning for long-term GTFS-backed service changes
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
- `POST /api/official-impact-run-once` requires either:
  - the trusted scheduler token on `x-scheduler-token`
  - or a Firebase `admin=true` or `detourAdmin=true` claim
- `POST /api/official-impact-promote` requires a Firebase `admin=true` or `detourAdmin=true` claim
- in production, survey admin access requires Firebase Bearer auth plus either:
  - a Firebase custom claim of `admin=true` or `surveyAdmin=true`
  - or a UID listed in `SURVEY_ADMIN_UIDS`
- detour debug may use `DETOUR_DEBUG_API_KEY` only outside production

### Private app feedback

- `POST /api/app-feedback` accepts authenticated rider feedback and stores no rider email or UID.
- Submissions are limited to five per authenticated client every 15 minutes.
- `GET /api/app-feedback/access` reports whether the signed-in user can open the developer inbox.
- `GET /api/app-feedback`, `PATCH /api/app-feedback/:feedbackId`, and `DELETE /api/app-feedback/:feedbackId` require the dedicated developer authorization described below.
- Inbox reads support server-side status filtering and cursor pagination so older unresolved submissions remain accessible.
- The API enforces a Firestore-backed five-submission limit per authenticated client every 15 minutes; the in-memory limiter remains an additional short-term guard.
- Firestore client rules deny all direct access to `appFeedback`; reads and writes go through the API proxy.
- Resolved submissions can be permanently deleted from the developer inbox; remove feedback when it is no longer needed rather than retaining it indefinitely.
- Retried submissions reuse a client-generated submission ID, so an uncertain network response does not create a second inbox item or alert.
- Optional private email alerts use `RESEND_API_KEY`, `APP_FEEDBACK_ALERT_RECIPIENTS`, and optionally `APP_FEEDBACK_ALERT_FROM`. Alert failures are logged but do not turn a stored submission into a rider-facing error.
- The backend writes `expiresAt` using `APP_FEEDBACK_RETENTION_DAYS=365` and `APP_FEEDBACK_RATE_LIMIT_RETENTION_DAYS=30`. Enable Firestore TTL for both collection groups:
  ```bash
  gcloud firestore fields ttls update expiresAt --collection-group=appFeedback --enable-ttl
  gcloud firestore fields ttls update expiresAt --collection-group=appFeedbackRateLimits --enable-ttl
  ```

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
- `DETOUR_REVIEWER_UIDS=<Mike Firebase UID>` for the operator review tool; production requires this allowlist plus an `admin=true` or `detourAdmin=true` claim
- `APP_FEEDBACK_ADMIN_UIDS=<Mike Firebase UID>` for the private app-feedback inbox; access also requires an `admin=true` or `appFeedbackAdmin=true` claim. Detour-review access does not grant feedback access.
- `APP_FEEDBACK_ALERT_RECIPIENTS=<comma-separated private addresses>` and `RESEND_API_KEY` to alert the developer when new feedback is stored
- `APP_FEEDBACK_RETENTION_DAYS=365` and `APP_FEEDBACK_RATE_LIMIT_RETENTION_DAYS=30` for Firestore expiry timestamps
- Firebase Functions only: `API_PROXY_FUNCTION_INVOKER=private` for production platform auth hardening

Do not ship `API_PROXY_TOKEN`, `API_PROXY_TOKENS`, `EXPO_PUBLIC_API_PROXY_TOKEN`, or `EXPO_PUBLIC_LOCATIONIQ_API_KEY` in public production.

Public rider clients should obtain Firebase ID tokens before calling protected proxy routes. For riders who are not signed in, enable Firebase Anonymous Authentication so the app can mint a low-privilege anonymous Firebase token without exposing a shared proxy secret.

### Rider account deletion

`DELETE /api/account` permanently deletes the signed-in rider's Firestore profile and nested rider data, then deletes the Firebase Auth user.

- This route always requires a valid, non-revoked Firebase Bearer token, even when general proxy auth is relaxed locally.
- The target UID comes only from the verified token. The route does not accept a UID in the URL or request body.
- The token's `auth_time` must be no more than five minutes old. Riders with an older session must sign out, sign back in, and retry.
- Firestore recursive deletion completes before Firebase Auth deletion. If data cleanup fails, the Auth user is retained so the rider can retry.
- Do not log bearer tokens, email addresses, names, or deleted profile contents.

### Detour worker

- `DETOUR_WORKER_ENABLED=true`
- `DETOUR_DATA_ENVIRONMENT=production|development|simulation`
  - enabled workers must classify their data environment explicitly
  - Cloud/production workers must use `production`; local workers must use isolated active, history, and runtime names
- `DETOUR_WORKER_MODE=interval|manual|scheduled`
- `DETOUR_DETECTOR_VERSION=v1|v2`
  - default and only supported production source is V2: `activeDetourEventsV2`, `detourEventHistoryV2`, and `systemState/detourRuntimeV2`
  - production startup rejects V1 or alternate collection/runtime names
  - V1 collections are archive-only; use `DETOUR_DETECTOR_VERSION=v1` only for isolated tests or migration audits and never as a production writer
  - optional explicit overrides: `DETOUR_ACTIVE_COLLECTION`, `DETOUR_HISTORY_COLLECTION`, `DETOUR_RUNTIME_STATE_COLLECTION`, `DETOUR_RUNTIME_STATE_DOC`
- `DETOUR_WRITER_ID=<optional stable writer name>`
  - active and history records also include the data environment, writer ID, Firebase project, worker mode, detector version, and collection names; Cloud Run revision is the fallback writer ID
- `DETOUR_ENABLE_ROUTE_FAMILY_HANDOFF=true|false`
  - route-family handoff treats a confirmed closure segment as one physical detour event and can project it onto sibling route variants/directions when the source segment has confirmed boundaries
  - point-only short deviations are not projected because there is no reliable closed segment to map to the sibling route
- `DETOUR_MIN_UNIQUE_VEHICLES=2`
  - values below 2 are ignored; rider-facing detours require two unique same-route confirming identities. Trip IDs are preferred over vehicle IDs, and weak one-point vehicle-only identities do not count.
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
  - Default clear proof uses a clear window around the affected segment: at least 1,000m where possible, clipped to the route shape ends. The same bus must cover about 75% of that window on the baseline route (`DETOUR_CLEAR_WINDOW_MIN_METERS`, `DETOUR_CLEAR_WINDOW_MIN_COVERAGE_RATIO`). This prevents a bus from clearing its own detour just because it rejoins the route after the off-route section.
  - Collective clear fallback: if no single bus gives a clean traversal, two or more unique same-route trips/vehicles can collectively clear a geometry-backed detour only when their on-route sample intervals cover the same clear window and no newer off-route evidence has returned.
  - Clear-count gotcha: do not treat clearing as "4 pings anywhere on route". The configured consecutive-on-route value is a sampling guard/diagnostic; active geometry-backed detours clear only after same-bus normal-route traversal or the collective two-trip/vehicle fallback through the clear window. A single GPS point cannot prove traversal. In practice this means at least two useful on-route GPS samples far enough apart to show route progress, often more on long segments, followed by a later tick to finalize `clear-pending`.
  - The publisher delete path is also proof-gated per event. A V2 event is deleted for normal-route clearing only when its snapshot has both the clear reason and structured `clearProof` with evidence type, method, observation time, sample/source counts, shape/window context, and segment proof where applicable.
  - A V2 clear attempt without auditable proof is reset to operational `state: "active"`, marked `clearanceBlockedReason: "missing-clear-proof"`, retained in Firestore, and hidden from riders. Hidden means unresolved, not cleared.
  - Clearing one event-window document never clears another event on the same route. Route-level clearance language is valid only when no other active same-route events remain.
  - Zero-current detours are not cleared automatically. They stay active until another bus adds off-route detour evidence or proves normal routing with GPS traversal through the affected segment.
  - Backend retention is separate from public alert eligibility. Active records still require GPS clear proof or operator action before deletion. Auto-detour rider alerts require fresh dense evidence with meaningful bounded geometry (`DETOUR_ALERT_MAX_GPS_EVIDENCE_AGE_MS=5400000`, `DETOUR_ALERT_MIN_EVIDENCE_POINTS=6`, `DETOUR_ALERT_MIN_SEGMENT_SPAN_METERS=75`). Official notices may enrich an already-qualified auto-detour but never create or preserve one.
  - If an active snapshot has no usable closure geometry or clear window, the automated detector must not infer a clear from elapsed time, same-route reporting, or two generic same-route normal pings. Keep the record for operations review and hide it from riders only for safety reasons such as insufficient/invalid geometry or an expired rider-evidence window while the exact route is reporting; automatic clearing still requires GPS evidence that can be tied to the affected segment, or an explicit operator/admin clear.
  - End-of-service freezes detection and drops current vehicle associations, but it does not clear active detours by itself.
  - Short-detour candidate evidence is captured from the first off-route GPS point, but remains backend-only until the same corridor has the required three off-route pings and a second unique same-route confirming identity corroborates the same segment within the schedule-aware confirmation window. V2 uses about one scheduled headway plus a 10-minute buffer, capped at 90 minutes, so non-consecutive trips cannot combine into a detour.
  - V2 retains the last on-route sample before a trip leaves the baseline and the first on-route sample after it rejoins. A closure endpoint moves from the off-route projection fallback only when at least two independent same-route trip identities agree within the boundary-consensus spread. The selected alternate path is one time-ordered same-trip trace, not route-progress-sorted points woven across trips.
  - V2 resolves a known vehicle trip through the current GTFS trip mapping and compares it with that trip's shape in the trusted baseline. It falls back to nearest-route-shape projection only when the trip is unknown, the mapped route does not match, or the mapped shape is unavailable in the trusted route baseline. Route debug projection diagnostics identify `gtfs-trip-mapping`, `vehicle-trip-shape`, or `nearest-route-shape` as the projection source.
  - The default candidate gate remains three off-route readings and two independent identities. A two-reading candidate can confirm only from two complete same-shape trip transitions: each identity needs a strong off-route reading bracketed by a valid departure and rejoin, both transitions must move in the same direction, their entry/rejoin clusters must stay within `DETOUR_V2_COMPLETE_TRANSITION_MAX_BOUNDARY_SPREAD_METERS` (default 350m), and their shared closed interval must be at least 100m.
  - Equivalent scheduled shapes on the same route may share complete-transition confirmation only after source evidence safely reprojects onto the target shape, remains strongly off-route, has nearby observed off-route points (`DETOUR_V2_EQUIVALENT_SHAPE_OFF_ROUTE_POINT_MAX_DISTANCE_METERS`, default 250m), and passes the same direction/boundary/shared-span proof. Rider-visible events and distant same-route corridors are not coalesced. The confirmation window is monotonic within a service day so changing scheduled headways cannot shrink an in-progress candidate window.
  - Shared physical events may use a stronger two-trip boundary result from another independently detected route only when the closed polylines strongly overlap and both source endpoints project within 75m of the target route shape. This reconciles route geometry, not lifecycle or clear proof.
  - Shared-event metadata is assigned per publish/event-window document. Multiple distant active closures on one route must not inherit one another's shared event ID merely because their segment indexes are the same.
  - Runtime state stores the latest per-vehicle projection diagnostic (`lastRouteProjection`) with distance from route, thresholds, shape ID, classification, and sample time. Use this to explain missed detections before changing thresholds.
- `DETOUR_V2_TRANSITION_SAMPLE_MAX_GAP_MS=600000` limits the time allowed between the last on-route sample, off-route run, and first rejoin sample used as transition evidence.
- `DETOUR_V2_MIN_BOUNDARY_TRANSITION_SIGNATURES=2` is the minimum independent trip consensus per closure endpoint.
- `DETOUR_V2_BOUNDARY_CONSENSUS_MAX_SPREAD_METERS=250` bounds how far agreeing endpoint observations may spread along the route shape.
- Optional likely-path road matching:
  - `DETOUR_ROAD_MATCHING_ENABLED=false`
  - `DETOUR_ROAD_MATCHING_BASE_URL=...` for an OSRM-compatible match service
  - road matching is gated by GPS confidence: the segment must have entry and exit boundary anchors plus either a same-vehicle trace or two distinct buses corroborating the same corridor before a rider-facing likely path is generated.
  - `DETOUR_PATH_BOUNDARY_MAX_GAP_METERS=150` requires the final inferred/likely path to pass near both service boundaries (or an explicit service rejoin). Larger gaps suppress the alternate path with `detour-boundary-gap`.
  - `DETOUR_ROAD_MATCHING_ROUTE_FALLBACK_ENABLED=true` to fall back from OSRM match to OSRM route when trace matching cannot produce usable road geometry
  - `DETOUR_ROAD_MATCHING_RADIUS_METERS=75` to control GPS snap tolerance for OSRM match
  - `DETOUR_MIN_SAME_VEHICLE_PATH_POINTS=2` sets the default minimum off-route points from that same vehicle before the likely path can be shown
  - `DETOUR_ROAD_MATCHING_BLOCKED_*` rejects likely detour paths that visibly reuse the closed regular route segment. New road-matched paths normally publish as one continuous rider line. If broad GPS approach/rejoin portions would make an otherwise safe middle path fail the final overlap check, the backend may publish boundary-refined `display*` geometry instead; detector entry/exit and clear-window truth remain unchanged. Other blocked-overlap suppressions publish `detourPathSuppressedReason=road-match-closed-overlap`.
  - `DETOUR_ROAD_MATCHING_DISPLAY_MIN_SEPARATED_RUN_METERS=75` controls how much continuously separated middle path is required before rider display boundaries may be refined.
  - `DETOUR_ROAD_MATCHING_DISPLAY_PROGRESS_PADDING_METERS=150` limits refined entry/rejoin projection to the detector's padded event window on loops and self-crossing shapes. Full-route overlap safety checks still run.
  - `DETOUR_ROAD_MATCHING_BACKTRACK_*` strips route-fallback out-and-back spurs caused by forced waypoints
  - `DETOUR_V2_CONFIRMED_REFRESH_THRESHOLD_METERS=25`, `DETOUR_V2_CONFIRMED_REFRESH_PATH_PROXIMITY_METERS=60`, and `DETOUR_V2_CONFIRMED_REFRESH_MIN_TRAVERSAL_METERS=75` allow a same-trip on-route/marginal/on-route pass to refresh an already-confirmed short detour. This does not lower initial confirmation or change geometry.
  - `DETOUR_V2_CONFIRMED_REFRESH_DIRECTION_MODE=diagnostic` records whether those refreshes match the event's stored increasing/decreasing direction. After one healthy service cycle, set it to `enforce` to reject mismatches and unknown direction without erasing normal-route clear proof. `GET /api/detour-debug?routeId=8` exposes route-level counts.
  - `DETOUR_V2_CONFIRMED_REFRESH_DIRECTION_PROJECTION_MAX_METERS=75` bounds the legacy direction fallback when an older event does not yet have stored direction metadata.
  - `DETOUR_SIMULATION_OFFSET_CANDIDATES_METERS=275,600,1000,1500,1800` lets local dummy detours try wider synthetic GPS paths until the matcher finds a route that does not reuse the closed segment
- `BASELINE_AUTO_INIT=false` — required for validation/production so an empty baseline is not silently created from live GTFS
- `BASELINE_AUTO_UPDATE_ENABLED=true` — route geometry changes in GTFS are auto-accepted as the new baseline after a stability recheck
- `BASELINE_AUTO_UPDATE_STABILITY_MS=1800000` — default 30-minute guard before a changed route baseline is replaced
- `DETOUR_REQUIRE_SAFE_BASELINE=true` — blocks detector ticks when only live-fallback or auto-initialized baseline data is available
- Firebase Admin credentials

### Detour email monitor

The GitHub Actions workflow `.github/workflows/detour-email-monitor.yml` runs `npm --prefix api-proxy run detour:email-monitor` every 5 minutes.

It reads Firestore detour history, sends first-time detour emails through Resend, then records sent events in `detourEmailNotifications` so later runs do not resend the same event.

Required GitHub secrets:

- `DETOUR_ALERT_RECIPIENTS` — comma-separated recipients; use Michael's email for operations alerts
- `RESEND_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`

Optional environment:

- `DETOUR_ALERT_FROM` — defaults to `BTTP Detour Alerts <onboarding@resend.dev>` until a custom sender domain is verified
- `DETOUR_ALERT_APP_URL`
- `DETOUR_ALERT_LOOKBACK_MIN=30`
- `DETOUR_ALERT_MAX_EVENTS=50`
- `DETOUR_ALERT_INCLUDE_CLEARED=false`
- `DETOUR_ALERT_EVENT_TYPES=DETOUR_DETECTED` to override the default event type list
- `DETOUR_ALERT_NOTIFICATION_COLLECTION=detourEmailNotifications`

Detour emails are text-only. The monitor enriches stop codes with GTFS stop names when available. It matches active records by exact event identity whenever IDs exist; route-only enrichment is limited to old detection records and is never used for clear events. Clear emails require a specific event ID, a supported clear reason, and auditable GPS proof or an explicit supersede/operator reason. They say “segment cleared” while another same-route event remains and “route detour cleared” only when none remain.

### Local worker isolation

The Android launcher does not start a detour writer unless `DETOUR_DEV_WORKER_ENABLED=true`. When enabled it forces V2 development mode and defaults to `devActiveDetourEventsV2`, `devDetourEventHistoryV2`, and `devSystemState/devDetourRuntimeV2`. The client collection must match the isolated dev active collection. Non-production workers targeting any production detour collection or runtime document fail startup.

Do not delete legacy history during this transition. Treat `activeDetours`, `detourHistory`, `activeDetoursV2`, and `detourHistoryV2` as archive/audit inputs only; production monitoring and rider clients use the event-scoped V2 collections.

### Official baseline-impact scanner

- `OFFICIAL_BASELINE_IMPACT_WORKER_ENABLED=true|false`
- `OFFICIAL_BASELINE_IMPACT_PUBLISH_CANDIDATES=true|false`

This scanner handles long-term detours or service changes that are already baked into static GTFS, such as a route losing a major stop or terminal. It:

- stores the latest compact GTFS snapshot in `gtfsBaselineSnapshots/latest`
- compares previous/current route stop sequences
- flags major stop removals, terminal changes, and multi-stop removals
- only creates candidates when the change matches an official MyRide news item
- writes review-only records to `officialServiceImpactCandidates` when candidate publishing is enabled
- promotes reviewed records to public `officialServiceImpacts` only through `POST /api/official-impact-promote`

First run behavior: if no prior snapshot exists, `POST /api/official-impact-run-once` seeds the snapshot and returns `needs_initial_snapshot`.

Guardrails:

- this does not create `activeDetours`
- this does not mutate the GPS-detector trusted baseline
- candidate records are operational review data, not public rider notices
- promoted `officialServiceImpacts` records are public rider notices
- unmatched GTFS diffs must not be shown to riders

### Transit news worker

- `NEWS_WORKER_ENABLED=true`
- `NEWS_WORKER_MODE=interval|manual|scheduled`
- Firebase Admin credentials
- Polls MyRide's public news JSON endpoint every 6 hours in `interval` mode:
  - `https://www.myridebarrie.ca/News/GetAllNews`
- In `manual` or `scheduled` mode, run one sync with `POST /api/news-run-once`.
- Publishes normalized items to Firestore `transitNews` and parsed rider-facing impacts to `transitNewsImpacts`.
- Deterministically classifies dated official holiday operating notices as `holiday_service` impacts. These records include the service date, holiday name, stated schedule level, official copy, and source URL; vague holiday mentions fail closed.
- Sends Expo push notifications only to opted-in route subscribers (or all opted-in users for explicitly system-wide news).
- Sends one advance holiday-service reminder when a parsed holiday impact enters the 48-hour window. Holiday reminders use the **Service Alerts** preference, are leased and deduplicated in `holidayServicePushNotifications`, and do not resend successfully accepted device tokens after a partial failure.
- Each scheduled detour tick also sends background-capable push alerts for newly rider-visible detours to opted-in route subscribers.
- Detour sends are leased and deduplicated in `detourPushNotifications`; failed leases can be retried by a later tick.
- A detour clear sends **Route X has returned to regular routing** only when the publisher accepted auditable `normal-route-gps` clear proof. The restoration goes only to current devices recorded as having received that exact detour alert, respects a later Service Alerts opt-out, and retries partial delivery without resending to successful devices. Operator clears, timeouts, hidden alerts, baseline replacements, and superseded event documents do not generate restoration pushes.
- Expo ticket errors are counted and `DeviceNotRegistered` tokens are removed only when they still match the affected user.
- Push tokens are stored per device under `users/{uid}/pushTokens/{deviceId}` so signing in on another device does not disable the first device.
- Expo ticket IDs are persisted in `pushNotificationReceipts`; later scheduled ticks check delivery receipts and invalidate devices rejected after initial acceptance.
- Receipt and detour-notification records older than 30 days are pruned in bounded batches.

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

Global learned geometry does not publish a detour by itself. A route still needs the normal confirmation rule first: three matching off-route pings and two unique same-route confirming identities. After that, the route can reuse trusted global geometry for display or restart recovery.

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
- `GET /api/official-impact-status`
- `POST /api/official-impact-run-once`
- `POST /api/official-impact-promote` with `{ "candidateIds": ["baseline-detour-12b-1652"] }`

Baseline endpoints:

- `GET /api/baseline-status`
- `POST /api/baseline/set` — replace the full baseline from current GTFS
- `POST /api/baseline/routes` with `{ "routeIds": ["12"] }` — replace only selected route baselines from current GTFS
- `POST /api/baseline/clear`

Only detour admins should run manual baseline mutation endpoints. During worker ticks, meaningful GTFS route geometry changes on routes without active detours are handled automatically: the changed route is hidden from riders while pending, force-rechecked after the stability window, then that route's baseline is replaced from live GTFS. A route with an active detour is protected from automatic adoption and clearing. Its record retains its previous visibility and publishes `baselineReviewRequired: true` until an operator determines whether the GTFS change is a permanent redesign or the construction detour itself. Use the route-scoped baseline endpoint only after that review.

`GET /api/detour-rollout-health` includes a `launchReadiness` block with pass/warn/fail checks for recent ticks, consecutive failures, publish failure rate, flapping routes, and operator-labelled detection precision. By default, readiness stays at `pilot_ready_with_cautions` until at least 20 unique, rider-visible real-world cases have an audited `true-positive` or `false-positive` operator review and precision is at least 90%. Hidden, uncertain, simulated, and short clear/re-detect flap duplicates do not count. Configure the sample floor with `DETOUR_MIN_LABELLED_DETECTIONS`.

### Operator detour reviews

The app exposes a hidden mobile/web **Detour Review** screen only after `GET /api/detour-reviews/access` confirms the signed-in user is authorized. Production authorization requires Firebase Bearer auth, an `admin` or `detourAdmin` custom claim, and a UID in `DETOUR_REVIEWER_UIDS`.

- `GET /api/detour-reviews/cases` lists prioritized review cases; rider-visible cases are the default.
- `GET /api/detour-reviews/cases/:caseId` returns the evidence timeline, map geometry, stop evidence, and matching notices.
- `PUT /api/detour-reviews/cases/:caseId/review` saves a revision-checked audited review.
- `GET /api/detour-reviews/cases/:caseId/export` exports a reviewed case for deterministic corpus follow-up.

Reviews live in `detourOperatorReviews`; every edit is copied to a `revisions` subcollection. Clients cannot access either collection directly. Final true/false labels require an evidence source and operator note. Only final rider-visible reviews contribute to rollout precision.

The response retains `falsePositiveRate` for backward compatibility, but marks it `measurement: "short-lived-clear-proxy"` and `readinessEligible: false`. It counts cleared detours under five minutes only as a review signal. The ten-minute clear grace means this proxy cannot establish real false-positive accuracy. `suspiciousShortLivedDetours` similarly identifies cases for human review rather than labelling them automatically.

Flapping is counted by physical/event identity when one is available, not by route alone. Technical cleanup events such as `superseded-by-equivalent-event`, other `superseded-by-*` migrations, and `baseline-auto-updated` are excluded so migrations and separate same-route closures do not look like rider-visible flapping.
Launch readiness also checks whether the stored baseline diverges from current live GTFS. A route without an active detour that is waiting for the auto-baseline stability recheck is hidden until it is either accepted as the new baseline or stops diverging. An active route instead reports `baselineReviewRequired` and keeps its previous detour visibility until operator review. Stale/headway warnings are monitoring evidence only and should be reviewed before public rollout; they should not clear active detours without normal-route GPS proof.

`GET /api/detour-status` and `GET /api/detour-rollout-health` also include operational sampling diagnostics:

- `samplingHealth` — recent tick count, fresh vs zero-fresh ticks, duplicate vehicle samples skipped, tick interval, and per-source counts such as `scheduler-primary` and `offset-30s`.
- `roadMatching` — process-local OSRM/road-matching counters, including requests, match/route attempts, successes, failures, rejections, and recent road-matching events.
- `detectorDecisionJournal` — recent route/event publish decisions, including rider visibility, suppression reason, evidence age, clear state, geometry/path counts, and geometry gate details such as `span-too-short`, `missing-entry-or-exit`, `missing-skipped-segment`, `unsafe-inferred-path-gap`, and `stale-mixed-evidence`. This is intentionally compact and logs only when the decision signature changes.
- `labelledDetectionQuality` — reviewed true/false-positive counts, precision, minimum sample, target, and whether labelled evidence is sufficient for readiness.

Worker tick logs are structured JSON with `event: "detour_worker_tick"` and include `source`, `vehiclesProcessed`, `vehiclesFetched`, duplicate sample count, detour count, and duration. Use the `source` field to distinguish primary scheduler ticks from `offset-30s` Cloud Task ticks.
Detector decision logs are structured JSON with `event: "detour_detector_decision"`. Use them to answer why a detected event is rider-visible, hidden, clear-pending, or geometry-suppressed without reading Firestore documents by hand. V2 detector state also exposes candidate evidence counts and per-route projection summaries so an operator can see off-route, on-route-clear, deadband, no-projection, and newest-sample counts from the latest tick.

`GET /api/detour-debug` without `routeId` is the safe summary endpoint. Route-specific debug (`?routeId=...`) can expose vehicle-level evidence and is blocked in production unless the caller has an admin Firebase claim or `DETOUR_DEBUG_ROUTE_DETAILS_ENABLED=true` is set intentionally.

## Scheduled / Triggered Jobs

There is no required internal scheduler in `api-proxy`.

Operational tasks are expected to be driven externally when possible:

- detour detection can run continuously only in `DETOUR_WORKER_MODE=interval`
- preferred low-cost detour operation is `DETOUR_WORKER_MODE=scheduled` with an external scheduler calling `POST /api/detour-run-once`
- `DETOUR_WORKER_MODE=manual` is preferred for ad hoc testing and debugging
- preferred low-cost news operation is `NEWS_WORKER_MODE=scheduled` with an external scheduler calling `POST /api/news-run-once` every 6 hours
- official baseline-impact scanning should run after GTFS/news refreshes by calling `POST /api/official-impact-run-once`
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

V2 runtime persistence stores only the canonical event-keyed fields (`eventCandidates`, `activeEvents`, and `clearTracksByEvent`) inside a gzip-compressed JSON blob. The loader remains backward-compatible with older flat documents. The compressed payload has an explicit 900 KiB safety ceiling below Firestore's 1 MiB document limit. Writing duplicate aliases or unbounded flat state can prevent normal-route clear evidence from surviving scheduled reloads; treat any `detourRuntimeStateStore` size error as a lifecycle incident, not a harmless persistence warning.

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
     - confirm `vehicleFeed.freshness.status` is `fresh` before judging detour detection output; stale, missing-timestamp (`unknown`), or future-dated (`future`) feeds can legitimately produce `0` usable vehicles
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
- `DETOUR_DETECTOR_VERSION=v2`
- `DETOUR_BURST_SAMPLING_ENABLED=false`
- `DETOUR_OFFSET_SAMPLING_ENABLED=true` for 30-second offset sampling through Cloud Tasks
- `DETOUR_OFFSET_SAMPLE_DELAY_SECONDS=30`
- `DETOUR_DISTRIBUTED_LOCK_ENABLED=true`
- `DETOUR_OFFSET_TASK_QUEUE=bttp-detour-offset-samples`
- `DETOUR_OFFSET_TASK_LOCATION=us-central1`
- `DETOUR_OFFSET_TASK_TARGET_URL=https://YOUR_CLOUD_RUN_URL/api/detour-run-once`
- `DETOUR_VEHICLE_TRACE_WINDOW_MS=1200000`
- `DETOUR_VEHICLE_MAX_FUTURE_SKEW_SECONDS=120`
- `DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS=2700000`
- `DETOUR_CANDIDATE_CONFIRMATION_HEADWAY_MULTIPLIER=1.25`
- `DETOUR_CANDIDATE_CONFIRMATION_BUFFER_MS=600000`
- `DETOUR_CANDIDATE_CONFIRMATION_MAX_MS=5400000`
- `DETOUR_RIDER_VISIBILITY_MAX_EVIDENCE_AGE_MS=5400000` as the minimum active-service fallback age, not wall-clock age
- `DETOUR_RIDER_VISIBILITY_HEADWAY_BUFFER_MS=600000`
- `DETOUR_RIDER_VISIBILITY_PASSAGE_MAX_GAP_MS=2700000`
- `DETOUR_RIDER_VISIBILITY_PASSAGE_MARGIN_METERS=75`
- `DETOUR_HISTORY_ENABLED=true`
- `NEWS_WORKER_ENABLED=true`
- `NEWS_WORKER_MODE=scheduled`
- `OFFICIAL_BASELINE_IMPACT_WORKER_ENABLED=true`
- `OFFICIAL_BASELINE_IMPACT_PUBLISH_CANDIDATES=false` until operations review is ready
- `REQUIRE_API_AUTH=true`
- `ALLOW_SHARED_TOKEN_AUTH=true`
- `API_PROXY_TOKEN=<long-random-secret>`
- `REQUIRE_FIREBASE_AUTH=false` for testing
- valid Firebase Admin credentials

For public production, shared-token auth must be disabled and Firebase Bearer auth must be enabled. Use `SCHEDULER_API_TOKEN` only for server-to-server scheduler calls such as `POST /api/detour-run-once`, `POST /api/news-run-once`, and `POST /api/official-impact-run-once`.

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
  - production active detour collection: `activeDetourEventsV2`
  - production history collection: `detourEventHistoryV2`
  - production runtime doc: `systemState/detourRuntimeV2`
  - local validation uses the separately configured dev collection and runtime names
- resume scheduler briefly and confirm repeated ticks advance state

## Rollback Notes

If deployment fails:

- disable `DETOUR_WORKER_ENABLED`
- keep `/api/health` available for smoke checks
- verify Firebase Admin credentials before re-enabling protected worker features
