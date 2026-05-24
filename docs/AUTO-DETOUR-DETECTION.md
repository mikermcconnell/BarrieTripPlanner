# Auto Detour Detection — Project Summary

> Feature reference for detour detection behavior, data model, and rider-facing intent.
> For backend deployment, auth, and operational runbooks, use `docs/API-PROXY-OPERATIONS.md`.
> For repo-wide doc load order, use `AGENTS.md`.

---

## Documentation map

- `docs/AUTO-DETOUR-DETECTION.md` is the source of truth for detour behavior, geometry, Firestore fields, clearing policy, and rider-facing UX.
- `docs/API-PROXY-OPERATIONS.md` is the source of truth for backend deployment, auth, worker modes, admin endpoints, and rollout-health operations.
- `docs/AUTO-DETOUR-QA-CHECKLIST.md` is the live validation checklist.
- `docs/AUTO-DETOUR-VALIDATION-MATRIX.md` is the scenario matrix and change-control workflow for turning live issues into repeatable regression coverage.
- `docs/plans/` contains dated working plans and does not override the current source-of-truth docs.

---

## 1. Purpose

**Riders open the app, look at the main map, and immediately see when a bus route is on detour.** No checking Twitter, no calling transit, no wondering why the bus didn't show up at their stop. The map shows it.

This is the core rider-facing goal:
- A highlighted overlay on the map showing which part of the route is detoured
- A banner telling riders "Route 1 is currently on detour"
- Details showing which stops are skipped and where buses are actually going

The system detects detours automatically by watching real-time GPS positions — no manual input from transit staff required.

**How it works under the hood:**
1. A server-side worker processes GTFS-RT vehicle positions on each detection tick. The low-cost production baseline is one externally scheduled tick per minute, with burst sampling disabled.
2. Each vehicle's GPS is compared against its route's published shape
3. When two buses on the same route produce confirmed off-route evidence, or the same short deviation repeats for two unique same-route trips/vehicles, a detour is confirmed. On 30- to 60-minute headways, the detector can remember the first bus as candidate evidence and confirm when the next unique bus reaches the same location.
4. When that confirmed detour has a real closed segment, the backend can project the same physical detour event onto sibling route variants/directions that share the closure
5. Detour geometry is published to Firestore. Rider-facing detour paths are shown after either a same-bus GPS trace confirms the bus left the regular route, travelled off-route, and returned, or two distinct buses corroborate the same detour corridor.
6. The app subscribes in real time and shows the detour on the main map

---

## 2. Architecture

```
GTFS-RT Feed (vehicle positions)
        │
        ▼
┌─────────────────────┐
│  detourWorker.js     │  Runs either as a 30s interval loop or a single externally triggered tick
│  (api-proxy/Railway) │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  detourDetector.js   │  Route-level wrapper with segment-level state machines:
│  (core algorithm)    │  (accumulating) → active → clear-pending → cleared
│                      │  Per-vehicle thresholds + recurring short-deviation aggregation
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  detourGeometry.js   │  Computes skipped segments + inferred detour paths
│  + detourPublisher   │  Writes to Firestore with throttling (2min per route)
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Firestore           │  activeDetours collection (real-time pub/sub)
│                      │  detourHistory collection (event log, 30-day retention)
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Client app          │  useDetourOverlays hook → DetourOverlay component
│  (React Native/Web)  │  Firestore listener via detourService.js
└─────────────────────┘
```

### Detector memory model

The detector uses three backend memory layers. The client app does not feed map-icon movement back into detection; app location updates are display-only. GTFS-RT vehicle positions remain the detector evidence source.

1. **Vehicle trace memory** — keeps the last 15-20 minutes of per-vehicle GPS evidence for path confidence and same-bus before/off-route/after proof.
2. **Candidate detour memory** — keeps compact 2-3 hour, headway-aware summaries of unconfirmed off-route candidates. This lets one bus create candidate evidence and a second unique bus confirm it 30-60 minutes later.
3. **Active detour memory** — keeps confirmed detours in runtime state and Firestore `activeDetours` until normal-route GPS proof clears them. On restart, runtime state is loaded first; if it is empty, active Firestore snapshots are hydrated so the first post-restart tick does not delete a still-active detour.

### Firestore Document Schema

#### `activeDetours` collection

One document per active route, keyed by route ID (e.g., `"8A"`, `"1"`).
If a route has multiple independent detour sections at the same time, they are published inside one route document via `segments[]`.

| Field | Type | Description |
|---|---|---|
| `routeId` | String | Route identifier (also the document ID) |
| `detectedAt` | Timestamp | When the detour was first detected |
| `lastSeenAt` | Timestamp | When off-route evidence was last observed (throttled, updates every 5min) |
| `updatedAt` | Timestamp | When the Firestore document was last written |
| `triggerVehicleId` | String \| null | Vehicle that triggered initial detection |
| `vehicleCount` | Number | Unique vehicles that have contributed evidence to this detour. This is the backward-compatible field used by rider visibility rules. |
| `uniqueVehicleCount` | Number | Same evidence count as `vehicleCount`, published explicitly for newer clients and operations review. |
| `currentVehicleCount` | Number | Vehicles currently observed off-route on this detour right now. Can be `0` while the detour remains active waiting for another bus or a normal-route clear. |
| `state` | String | `"active"` or `"clear-pending"` (documents are deleted when cleared, not updated to `"cleared"`) |
| `clearReason` | String \| null | Why a detour is moving toward clear, for example `"normal-route-observed"`. |
| `isPersistent` | Boolean | Whether the published route snapshot is currently backed by a learned persistent detour record |
| `handoffSourceRouteId` | String \| null | Source route when this document is a projected sibling-route view of the same physical detour |
| `segments` | Array | Renderable detour sections for this route. Each segment can have its own entry/exit points and skipped/inferred geometry. |
| `skippedSegmentPolyline` | String \| null | Encoded polyline of the route segment being skipped |
| `inferredDetourPolyline` | String \| null | Encoded polyline of the inferred detour path |
| `canShowDetourPath` | Boolean | Whether the inferred path is trusted enough for rider-facing rendering and road matching. Requires entry and exit boundary anchors plus either a same-vehicle trace or two distinct buses on the same detour corridor. |
| `likelyDetourPolyline` | String \| null | Optional road-matched path shown to riders as the likely detour path |
| `likelyDetourRoadNames` | String[] | Optional road names from map matching |
| `roadMatchConfidence` | String \| null | `"low"`, `"medium"`, or `"high"` from the road matcher |
| `detourPathLabel` | String | Rider-facing label, currently `"Likely detour path"` |
| `entryPoint` | `{ lat, lon }` \| null | Where vehicles leave the published route |
| `exitPoint` | `{ lat, lon }` \| null | Where vehicles rejoin the published route |
| `confidence` | String \| null | `"low"`, `"medium"`, or `"high"` |
| `evidencePointCount` | Number \| null | GPS evidence points collected |
| `lastEvidenceAt` | Timestamp \| null | When the most recent evidence point was recorded |

`segments[]` is the source of truth for multi-section detours. The top-level geometry fields (`entryPoint`, `exitPoint`, `skippedSegmentPolyline`, `inferredDetourPolyline`, `likelyDetourPolyline`) are still published for backward compatibility and mirror the route's primary segment.

Self-loop segments are not valid closures when they enter and exit at the same stop and only that stop is affected. The backend filters these before publishing and before preserving a previously trusted likely path.

Documents are created on detection, updated each publish cycle, and deleted when the final active segment clears.

#### `persistentDetoursAuto` collection

One document per learned long-running route detour. These records let the backend survive deploys/restarts without forgetting the active closure.

Key fields:
- `fingerprint` — stable route/shape/entry/exit signature for the learned closure
- `geometry` — latest renderable detour geometry
- `detourZone` — route progress window used for GPS-based clearing
- `evidence` — learned GPS points, confidence points, and entry/exit boundary candidates retained beyond the short live evidence window
- `lastEvidenceAt` — last actual GPS evidence time; this does not advance just because the record was refreshed

#### `detourHistory` collection

One document per event. Auto-generated IDs: `{timestamp}-{routeId}-{eventType}-{random}`.

Main event types:
- **`DETOUR_DETECTED`** — `routeId`, `occurredAt`, `detectedAt`, `lastSeenAt`, `triggerVehicleId`, `vehicleCount`, `uniqueVehicleCount`, `currentVehicleCount`, `confidence`, `evidencePointCount`, `lastEvidenceAt`, `shapeId`, `entryPoint`, `exitPoint`, `skippedSegmentPolyline`, `inferredDetourPolyline`, `segmentCount`, `source`
- **`DETOUR_UPDATED`** — `routeId`, `occurredAt`, `detectedAt`, `lastSeenAt`, `triggerVehicleId`, `previousTriggerVehicleId`, `vehicleCount`, `previousVehicleCount`, `uniqueVehicleCount`, `currentVehicleCount`, `clearReason`, `changedFields[]`, `source`
- **`DETOUR_CLEARED`** — `routeId`, `occurredAt`, `detectedAt`, `clearedAt`, `durationMs`, `triggerVehicleId`, `previousVehicleCount`, `uniqueVehicleCount`, `currentVehicleCount`, `clearReason`, `lastEvidenceAt`, `shapeId`, `entryPoint`, `exitPoint`, `skippedSegmentPolyline`, `inferredDetourPolyline`, `segmentCount`, `source`
- **`DETOUR_AUTO_CLEARED_STALE`** — legacy/stale-safety event shape with stale metadata such as `staleAgeMs`, `staleThresholdMs`, `scheduledHeadwayMs`, `scheduleSource`, and `serviceDate`. Current active detours should clear from normal-route GPS evidence, not elapsed time.

All history events include `source: "detour-worker-v2"`.

---

## 3. Current State (as of 2026-05-24)

### What riders see today
The client now has the main rider-facing pieces in code:
- `DetourAlertStrip` on the map screen
- `DetourDetailsSheet` for affected stops and detour timing
- `DetourOverlay` and detour-focused map mode

The rider feature is still controlled by `EXPO_PUBLIC_ENABLE_AUTO_DETOURS`.

Note: Firestore is the source of truth for active detours. The client should render what the backend publishes rather than applying its own freshness pruning rules. The client must not use app icon movement as detector evidence; only backend GTFS-RT vehicle samples should create, confirm, or clear detours.
The client already renders multi-segment detours from `segments[]`; the recent backend work makes same-route independent detours publish as separate sections instead of one merged lifecycle.

### What's built (backend — complete)
- Detection worker supports a legacy 30s interval loop and a low-cost manual/scheduled single-tick mode
- Detection algorithm with consecutive readings, zone-aware clearing (separate on-route threshold within detour zone), hysteresis (buffer between detection and clearing thresholds to prevent flickering)
- **Recurring short-deviation detection** — repeated short off-route streaks on the same route segment can publish a detour even when no single bus stays off-route long enough to hit the normal consecutive-reading threshold. This now requires two unique same-route trips/vehicles, which is meant for short downtown jogs such as temporary market closures.
- **Route-family geometry reconciliation/projection** — sibling routes can share a confirmed physical closure segment once one branch has enough evidence and reliable entry/exit boundaries. One bus on each branch still does not create alerts for both branches, and point-only short deviations remain route-specific.
- **Service-hours-aware retention** — outside service hours (1 AM - 5 AM EST), detection freezes. End-of-service no longer clears active detours; current vehicles are dropped and detours stay visible until an in-service bus adds detour evidence or proves normal routing.
- **GPS-evidence clearing** — active detours are retained until the same bus is observed traversing the regular baseline route through the affected detour segment. By default, that bus must cover at least 100m and 60% of the affected segment. No-bus/currently-zero-vehicle states are not enough to clear. Once that traversal proof exists, short detour segments can move to clearing without waiting for the fixed on-route tick threshold.
- **Headway-aware stale monitoring** — schedule/headway context can flag old evidence for operator review, but it does not clear an active detour by itself. This prevents low-frequency routes from disappearing before another bus reaches the affected segment.
- **Headway-aware candidate confirmation** — unconfirmed off-route evidence can be retained long enough for the next unique bus on 30- to 60-minute service to corroborate the same detour candidate.
- **Path-confidence gate** — detour alerts can remain active while the map hides the likely detour path until the backend sees trusted evidence: either same-bus before/off-route/after evidence or two distinct buses with entry/exit anchors on the same corridor.
- **Same-stop self-loop rejection** — geometry segments are rejected when the inferred closure enters and exits at the same stop and only that stop is affected. This prevents route-fallback turnarounds or short spurs from being published as detours when no real closed route segment was found.
- **Segment-level detour lifecycle under one route document** — same-route detours separated by normal on-route travel are now tracked as separate internal segments with independent clear-pending and clearing behavior.
- Firestore publishing (active detours + geometry) with write throttling
- Detour history event logging (30-day retention)
- Debug endpoints: `/api/detour-status`, `/api/detour-debug`, `/api/detour-logs`
- Targeted backend regression coverage across detector, geometry, publisher, and integration suites

### What's built (frontend — partially complete)
- `DetourOverlay` component (native + web) — draws skipped segment + inferred path on the map
- `useDetourOverlays` hook — transforms Firestore data for map rendering
- `detourService.js` — Firestore real-time listener for activeDetours
- Wired into TransitContext and HomeScreen (both platforms)

### Most recent findings
- **Fixed 2026-03-15: same-route detours were merging into one giant lifecycle** — The detector used to keep one active lifecycle per route, so two separate detours on the same route could collapse into one record and then clear when the bus served normal stops between them. The detector now keeps segment-level state internally and publishes both sections in one route document.
- **Fixed 2026-03-20: noisy multi-vehicle detour geometry could render overlapping reroute branches** — The geometry builder used to simplify one timestamp-ordered list of all evidence points, which could weave together multiple buses and draw a messy inferred path. The backend now scores per-vehicle trajectories and publishes one representative reroute line so riders see a cleaner detour overlay.
- **Fixed 2026-05-04: very short recurring detours could be missed** — The detector used to require one vehicle to stay off route for the full consecutive-reading window. It now also aggregates repeated short deviations across vehicles/trips within the same route segment.
- **Fixed 2026-05-12: sparse evidence could create a misleading likely path** — Geometry now requires both entry and exit boundary anchors for skipped-route geometry. The path can publish once one bus provides a full trace or two distinct buses corroborate the same corridor.
- **Updated 2026-05-20: physical detour events can project to sibling route variants** — A confirmed closure segment on one branch can now publish projected geometry for a sibling branch, so paired variants such as 12A/12B do not require separate hand patches when they share the same closure. Point-only short deviations still stay route-specific.
- **Updated 2026-05-20: long-running detours retain learned GPS evidence** — Persistent detours now store learned evidence points and boundary candidates separately from the short live window, so trusted paths can survive deploys/restarts. `lastEvidenceAt` only moves when new GPS evidence exists.
- **Updated 2026-05-24: low-frequency confirmation uses backend memory instead of burst pulses** — Scheduled production runs should collect one GTFS-RT snapshot per minute. The detector keeps short vehicle traces, longer headway-aware candidate summaries, and active Firestore snapshots so 30- to 60-minute routes can confirm and retain detours without multiple pulses inside a request.
- **Fixed 2026-05-24: same-stop turnaround geometry could publish as a false detour** — The geometry and publisher trust gates now drop segments where `entryStopId === exitStopId` and the only affected/skipped stop is that same stop. Previously, those segments could preserve a likely path that went out, turned around, and returned without identifying a closed road segment.
- **Still in validation: affected-stop accuracy on route variants and opposite directions** — Geometry and rendering are segment-aware and sibling projection is now supported, but the public-launch validation pass still needs to confirm the skipped-stop derivation is correct across route families such as 8A/8B, 12A/12B, and both directions of travel.

### What's missing to go public

**Deploy steps:**
1. **Turn on the rider feature flag** — Set `EXPO_PUBLIC_ENABLE_AUTO_DETOURS` to `true`.
2. **Pass rollout health checks** — Confirm `/api/detour-rollout-health` reports `launchReadiness.status` as `pilot_ready` or `pilot_ready_with_cautions`. Treat baseline divergence as a launch blocker and review recent stale auto-clears before enabling the rider UI.

**Build work:**
3. Validate the current alert strip, map overlay, and details sheet together in production-like builds.
4. Confirm the affected-stop derivation is accurate across route variants and opposite directions.

**Security / operations:**
5. Keep route-specific `/api/detour-debug?routeId=...` disabled for non-admin production callers unless a trusted operator explicitly enables `DETOUR_DEBUG_ROUTE_DETAILS_ENABLED=true`.
6. Keep baseline mutation endpoints restricted to detour admins. Use scheduler auth or a detour-admin token for `POST /api/detour-run-once`.
7. Monitor short-lived detections, repeated clears, stale auto-clears, and publish failures in rollout health during the first live validation window.

**Should-haves:**
7. **Push notifications** — Alert riders who have favorited a route when a new detour is detected.
8. **Accessibility** — Screen reader announcements for detour events.

### Known Issues (Fixed)
- **Flapping detours** (Fixed 2026-02-27) — Single-vehicle GPS noise caused rapid detect/clear cycles. Fixed by raising `CONSECUTIVE_READINGS_REQUIRED` from 3→4 (2 minutes at 30s ticks). Made configurable via `DETOUR_CONSECUTIVE_READINGS` env var.
- **Zombie detours & premature clearing** (Fixed 2026-03-03, revised 2026-05-12) — False-positive detours could linger overnight while real multi-vehicle detours cleared inconsistently when buses stopped reporting. The current model avoids time-based clearing: active detours are retained through service gaps and clear only after same-bus normal-route GPS traversal through the affected segment.
- **Independent same-route detours merged into one lifecycle** (Fixed 2026-03-15) — Two detours on the same route could collapse into one route-wide lifecycle, then clear incorrectly when buses traveled normally between them. The detector now tracks segment-level lifecycles inside one route snapshot, so one segment can clear without deleting the others.

---

## 4. Definition of Success

The feature is "done" when a rider can open the app and know a detour is happening without any other source of information.

### Must Have (MVP)
- [ ] Rider opens the map and sees a visual overlay on any route that's currently detoured
- [ ] A banner on the map screen tells the rider which route is affected ("Route 1 is on detour")
- [ ] Tapping the banner/overlay shows which stops are skipped
- [ ] Detours publish only after two buses on the same route provide detour evidence, or as a projected sibling-route view of an already-confirmed physical closure segment
- [ ] Candidate evidence is recorded within 5 minutes of a bus deviating. Rider-facing publication still requires a second unique same-route bus/trip, so low-frequency routes may confirm 30-60 minutes later.
- [ ] For established detours (>10min old): clear within 5 minutes after normal-route GPS traversal proof is observed. Service gaps or bus absence alone do not start clearing.
- [ ] Minimum visibility: detours stay shown for at least 10 minutes after detection, even if buses return to route quickly (grace period prevents flicker)
- [ ] False positive rate < 10% over a 7-day window (measured via `/api/detour-logs` — count DETECTED events that clear within 5 minutes as false positives)

### Should Have
- [ ] Push notifications for favorited routes with active detours
- [ ] Detection works correctly for route variants (8A/8B, 12A/12B)
- [ ] Long-running detours retain learned alternate-path evidence across worker restarts
- [ ] Screen reader announces new detours

### Nice to Have
- [ ] ETA impact estimation (how much longer the detour adds)
- [ ] Detour history visible to users (past detours on a route)
- [ ] Staff dashboard for monitoring detection accuracy

---

## 5. Configuration Reference

All env vars for the detour system, set in Railway (production) or `.env` (local).

### Detection Tuning
| Variable | Default | Description |
|---|---|---|
| `DETOUR_WORKER_ENABLED` | `false` | Master switch for the detection worker |
| `DETOUR_WORKER_MODE` | `interval` | `interval`, `manual`, or `scheduled`. Low-cost production should use `scheduled` with one external scheduler call per minute. |
| `DETOUR_BURST_SAMPLING_ENABLED` | `false` | Keep `false` for the low-cost baseline. When `true`, one `/api/detour-run-once` call runs several detector samples before returning; use only for diagnostics. |
| `DETOUR_BURST_DURATION_MS` | `65000` | Diagnostic burst window. Not used when burst sampling is disabled. |
| `DETOUR_BURST_SAMPLE_INTERVAL_MS` | `30000` | Diagnostic delay between internal samples. Duplicate GTFS vehicle snapshots are skipped so repeated feed data does not count as new evidence. |
| `DETOUR_BURST_MAX_SAMPLES` | `3` | Diagnostic maximum internal samples per burst call. Values above 10 are capped for safety. |
| `DETOUR_VEHICLE_TRACE_WINDOW_MS` | `1200000` | Recent per-vehicle trace memory window for path confidence and same-bus proof (20min). |
| `DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS` | `10800000` | Maximum base window for matching low-frequency candidate evidence (3h). |
| `DETOUR_CANDIDATE_CONFIRMATION_HEADWAY_MULTIPLIER` | `2` | Multiplies the current scheduled headway when calculating candidate confirmation memory. |
| `DETOUR_CANDIDATE_CONFIRMATION_BUFFER_MS` | `600000` | Extra buffer added to the headway-based candidate window (10min). |
| `DETOUR_CANDIDATE_CONFIRMATION_MAX_MS` | `10800000` | Hard cap for candidate confirmation memory (3h). |
| `DETOUR_ENABLE_ROUTE_FAMILY_HANDOFF` | `true` | Allows confirmed physical closure segments to reconcile or project geometry onto sibling route variants/directions. Point-only short deviations are not projected. Set to `false` while debugging route-assignment or geometry issues. |
| `DETOUR_ROUTE_FAMILY_TARGET_ROUTE_OVERLAP_METERS` | `75` | Suppresses sibling-route projection when the observed detour path already follows that sibling route's regular shape. This prevents cases like a 12B bus using regular 12A routing from being labeled as a 12A detour. |
| `DETOUR_MIN_UNIQUE_VEHICLES` | `2` | Minimum unique same-route vehicles required before a detour is published. Values below 2 are ignored. |
| `DETOUR_OFF_ROUTE_THRESHOLD_METERS` | `75` | Distance from shape to count as "off route" |
| `DETOUR_CONSECUTIVE_READINGS` | `4` | Off-route ticks before confirming (4 × 30s = 2min) |
| `DETOUR_RECURRING_SHORT_DEVIATION_ENABLED` | `true` | Enables aggregation of repeated short off-route streaks across trips/vehicles. Set to `false` to disable. |
| `DETOUR_RECURRING_SHORT_DEVIATION_WINDOW_MS` | `10800000` | Time window for grouping repeated short deviations (3h). |
| `DETOUR_RECURRING_SHORT_DEVIATION_MIN_OBSERVATIONS` | `2` | Short-deviation observations required before publishing. |
| `DETOUR_RECURRING_SHORT_DEVIATION_MIN_UNIQUE_SIGNATURES` | `2` | Minimum unique trips/vehicles required before publishing. |
| `DETOUR_RECURRING_SHORT_DEVIATION_MAX_GAP_METERS` | `350` | Maximum projected route-distance gap for short deviations to be grouped together. |
| `DETOUR_RECURRING_SHORT_DEVIATION_MAX_STREAK_READINGS` | `3` | Longest off-route streak eligible for short-deviation aggregation. Longer streaks use the normal detector path. |
| `DETOUR_EVIDENCE_WINDOW_MS` | `900000` | Time window for geometry evidence points (15min) |
| `DETOUR_SEGMENT_GAP_METERS` | `400` | Minimum projected gap before geometry evidence is split into separate published detour segments |
| `DETOUR_MIN_LINEAR_SEGMENT_LENGTH_METERS` | `100` | Minimum skipped-route span before route-aligned skipped-segment geometry is published |
| `DETOUR_MIN_SAME_VEHICLE_PATH_POINTS` | `2` | Minimum off-route points from the same bus, between matching entry/exit anchors, before the likely detour path can be road-matched and shown to riders |
| `DETOUR_CANDIDATE_EVIDENCE_TTL_MS` | `10800000` | Legacy/advisory evidence-retention value. Active detector-owned detours are no longer cleared solely because this time has elapsed. |
| `DETOUR_PERSIST_CONSECUTIVE_MATCHES` | `10` | Matching active-detour snapshots required before a long-running detour becomes persistent |
| `DETOUR_PERSIST_MIN_AGE_MS` | `18000000` | Minimum detour age before persistence learning is allowed (5 hours) |

### Service Hours
| Variable | Default | Description |
|---|---|---|
| `DETOUR_SERVICE_START_HOUR` | `5` | Local hour when detection activates (24h format) |
| `DETOUR_SERVICE_END_HOUR` | `1` | Local hour when detection freezes |
| `DETOUR_SERVICE_TIMEZONE` | `America/Toronto` | IANA timezone for service hour evaluation |

### Clearing Tuning
| Variable | Default | Description |
|---|---|---|
| `DETOUR_ON_ROUTE_CLEAR_THRESHOLD_METERS` | `40` | Tighter threshold for "back on route" (hysteresis: 40m to clear vs 75m to detect) |
| `DETOUR_CLEAR_GRACE_MS` | `600000` | Minimum detour age before vehicles can be cleared from the off-route set (10min). Prevents flicker on short-lived detours. |
| `DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE` | `6` in interval/manual mode; `4` in scheduled mode | Legacy/redundant guard for on-route clearing. Current clearing requires traversal proof through the affected segment; short segments can clear before this fixed tick count when that proof is already met. |
| `DETOUR_CLEAR_MIN_TRAVERSAL_METERS` | `100` | Minimum same-bus regular-route travel distance required before a vehicle can clear an affected segment. |
| `DETOUR_CLEAR_MIN_TRAVERSAL_RATIO` | `0.6` | Minimum share of the affected segment that the same bus must cover on the regular route before clearing. |
| `DETOUR_STALE_AUTO_CLEAR_ENABLED` | `true` | Legacy flag for stale-clear decisions. Current policy treats stale/headway data as monitoring context; active detours require normal-route GPS evidence to clear. |
| `DETOUR_STALE_AUTO_CLEAR_MIN_MS` | `2700000` | Minimum stale evidence window used for stale monitoring/advisory context (45min). |
| `DETOUR_STALE_AUTO_CLEAR_HEADWAY_MULTIPLIER` | `2` | Number of scheduled headways used when calculating stale monitoring thresholds. |
| `DETOUR_STALE_AUTO_CLEAR_BUFFER_MS` | `600000` | Extra buffer added to the headway-based stale monitoring window (10min). |
| `DETOUR_STALE_AUTO_CLEAR_MAX_MS` | `10800000` | Maximum stale monitoring window (3h). |
| `DETOUR_STALE_AUTO_CLEAR_DEFAULT_HEADWAY_MS` | `3600000` | Conservative fallback headway when nearby GTFS trips are unavailable but service still appears active. |
| — | — | There is intentionally no time-based clear for active detector-owned detours. They are retained so later buses can add evidence or prove normal routing. |

### Publishing & History
| Variable | Default | Description |
|---|---|---|
| `DETOUR_GEOMETRY_WRITE_THROTTLE_MS` | `120000` | Min ms between Firestore geometry writes per route (2min) |
| `DETOUR_ROAD_MATCHING_ENABLED` | `false` | Enables optional OSRM-compatible map matching for the rider-facing likely detour path |
| `DETOUR_ROAD_MATCHING_BASE_URL` | unset | OSRM-compatible service base URL, e.g. `https://router.project-osrm.org` for local validation |
| `DETOUR_ROAD_MATCHING_TIMEOUT_MS` | `4000` | Timeout for road matching requests |
| `DETOUR_ROAD_MATCHING_MAX_POINTS` | `100` | Maximum points sent to the road matcher per segment |
| `DETOUR_ROAD_MATCHING_BLOCKED_PROXIMITY_METERS` | `35` | Distance used to decide whether likely detour points are still on the closed regular route |
| `DETOUR_ROAD_MATCHING_BLOCKED_OVERLAP_RATIO` | `0.05` | Max interior overlap allowed before a likely detour path is rejected as still using the closed route |
| `DETOUR_ROAD_MATCHING_BLOCKED_ENDPOINT_RATIO` | `0.12` | Entry/exit portion ignored because detours must rejoin the regular route |
| `DETOUR_ROAD_MATCHING_BLOCKED_MIN_POINTS` | `3` | Minimum overlapping points needed before rejecting a likely detour path |
| `DETOUR_ROAD_MATCHING_BACKTRACK_PROXIMITY_METERS` | `12` | How close the return leg must be to the outbound leg before a route-fallback spur is stripped |
| `DETOUR_ROAD_MATCHING_BACKTRACK_MIN_SEGMENT_METERS` | `20` | Minimum out-and-back segment size to strip as an avoidable detour spur |
| `DETOUR_ROAD_MATCHING_BACKTRACK_MIN_TURN_DEGREES` | `150` | Minimum turn angle used to identify route-fallback U-turn spurs |
| `DETOUR_SIMULATION_OFFSET_CANDIDATES_METERS` | `275,600,1000,1500,1800` | Local dummy detour offsets to try until simulated GPS can be road-matched without reusing the closed segment |
| `DETOUR_HISTORY_ENABLED` | `true` | Enable detour event history in Firestore |
| `DETOUR_HISTORY_RETENTION_DAYS` | `30` | Days to retain history (<=0 disables pruning) |
| `DETOUR_FALSE_POSITIVE_WINDOW_MS` | `604800000` | Rollout-health window for false-positive rate checks (7 days) |

### Client Feature Flags
| Variable | Default | Description |
|---|---|---|
| `EXPO_PUBLIC_ENABLE_AUTO_DETOURS` | `false` | Enable the rider-facing auto detour feature |
| `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI` | `false` | Legacy fallback for older builds; prefer `EXPO_PUBLIC_ENABLE_AUTO_DETOURS` |

### Hardcoded Constants (not env-configurable)
| Constant | Value | File | Description |
|---|---|---|---|
| `TICK_INTERVAL` | `30000` | detourWorker.js | Detection poll interval (30s) |
| `STALE_VEHICLE_TIMEOUT_MS` | `300000` | detourDetector.js | Remove vehicle from state after 5min of no data |
| `MIN_EVIDENCE_FOR_GEOMETRY` | `2` | detourGeometry.js | Min evidence points to build geometry when two buses corroborate a corridor. |
| `MIN_SAME_VEHICLE_PATH_POINTS` | `2` | detourGeometry.js | Same-bus off-route points required before a likely path is trusted without multi-bus corroboration. |
| `HIGH_CONFIDENCE_VEHICLES` | `2` | detourGeometry.js | Unique vehicles needed for "high" confidence |
| `HIGH_CONFIDENCE_POINTS` | `10` | detourGeometry.js | Evidence points needed for "high" confidence |
| `MEDIUM_CONFIDENCE_VEHICLES` | `2` | detourGeometry.js | Unique vehicles needed before a detour can become rider-visible as "likely" |
| `DP_TOLERANCE_METERS` | `25` | detourGeometry.js | Douglas-Peucker simplification tolerance |

---

## 6. Failure Modes & Resilience

| Scenario | Behavior |
|---|---|
| **GTFS-RT feed unavailable** | Fetch retries once (2s delay), then fails tick. `consecutiveFailureCount` increments. Detours persist in-memory. Worker retries next tick (30s), no backoff. |
| **Vehicle disappears from feed** | Removed from state after 5min (`STALE_VEHICLE_TIMEOUT_MS`). Does NOT clear the detour — absence of data is not evidence of return. |
| **All vehicles for one active segment go offline** | The segment stays active with `currentVehicleCount: 0` so the next bus can add evidence. It clears only after same-bus normal-route GPS traversal through the affected segment. |
| **Firestore write fails** | Error logged, publish skipped for that tick. Detection state machine continues in-memory. Retries next tick. |
| **Firestore unreachable at startup** | Runtime-state hydration may fail. If active-detour snapshot fallback also cannot load, the first empty publish is guarded so an empty fresh runtime does not immediately delete existing active detours. Existing detours can still be re-detected as vehicles appear. |
| **Worker restarts** | In interval mode, detector rehydrates learned persistent detours, including learned GPS evidence, and resumes in-memory monitoring. In manual/scheduled mode, runtime detector state is reloaded from Firestore before each tick; if runtime state is empty, active Firestore snapshots are hydrated as a cold-start fallback. |
| **Service ends with active detours** | Detection freezes, current vehicle associations are dropped, and active detours remain published with `currentVehicleCount: 0`. They clear only after in-service GPS shows the same bus traversing the regular route through the affected segment. |

---

## 7. Debug Endpoints

### `GET /api/detour-status`
Overview of the detection system. Returns:
- `enabled`, `running`, `tickCount`, `lastSuccessfulTick`
- `consecutiveFailureCount`, `errors.fetchFailures`, `errors.publishFailures`
- `activeDetours` — map of route IDs → `{ vehicleCount, detectedAt, state }` for the currently published route snapshots
- `baseline` — `{ loaded, loadedAt, source, routeCount, shapeCount }`
- `recentEvents` — last 20 events (human-readable strings)
- `evidenceSummary` — per-route aggregated evidence summary `{ pointCount, oldestMs, newestMs }`

### `POST /api/detour-run-once`
Runs exactly one detection tick. Intended for:
- manual validation during development
- external scheduler triggers in low-cost deployments
- testing the full detector → publisher pipeline without keeping a process always on

### `GET /api/detour-debug?routeId=8`
Raw evidence points for a specific route. Returns lat/lon/timestamp/vehicleId for each point (max 200), plus per-segment evidence summary when the route currently has multiple internal segments. Without `routeId`, returns summary counts only (safe for production).

For a specific route, the response now also includes:
- `snapshot` — last published detour snapshot for that route, even if the route currently has no live evidence points
- `stateSegments` — detector segment state including `shapeIdHint`, progress window, and persisted geometry
- geometry `debug` fields such as selected shape, route-family handoff status, and segment anchor source (`boundary-candidate` vs `projected-evidence-fallback`)

### `GET /api/detour-logs?limit=50&routeId=&eventType=&start=&end=`
Queries `detourHistory` collection with optional filters. Returns event log entries (DETECTED, UPDATED, CLEARED) in reverse chronological order.

---

## 8. Rollout Plan

**Stage 1: Internal Testing** (current)
- Prefer `DETOUR_WORKER_MODE=manual` for ad hoc validation and cost control
- Use `POST /api/detour-run-once` for manual ticks
- Only enable minute-based scheduling during planned live validation windows
- Rider UI remains behind `EXPO_PUBLIC_ENABLE_AUTO_DETOURS`
- Monitor false positives and flapping via `/api/detour-status`

**Stage 2: Soft Launch**
- Validate `DetourAlertStrip`, `DetourDetailsSheet`, and map overlays in production-like builds
- Enable `EXPO_PUBLIC_ENABLE_AUTO_DETOURS` for all users
- Monitor user-facing accuracy for 2 weeks

**Stage 3: Full Launch**
- Enable push notifications for favorited routes
- Remove feature flag guards (always-on)
- Add analytics tracking for detection accuracy

---

## 9. Local Development

To run the detour detection system locally:

1. Set env vars in `api-proxy/.env`:
   ```
   DETOUR_WORKER_ENABLED=true
   DETOUR_WORKER_MODE=manual
   ```
   (Plus your Firebase credentials — see existing `api-proxy/.env` for required keys)

2. Start the proxy server:
   ```
   cd api-proxy && node index.js
   ```

3. Verify it's running:
   ```
   curl http://localhost:3001/api/detour-status
   ```
   In manual mode, `running` stays `false` until you trigger a tick.

4. Trigger one detection tick:
   ```
   curl -X POST http://localhost:3001/api/detour-run-once -H "x-api-token: YOUR_TOKEN"
   ```

5. To see detour overlays in the client, also set in your root `.env`:
   ```
   EXPO_PUBLIC_ENABLE_AUTO_DETOURS=true
   ```

If you still want the legacy local interval loop, set `DETOUR_WORKER_MODE=interval`.

### Simulating a visible detour when no real detour is active

For local/dev UI checks, enable the dev-only simulator:

```env
DETOUR_SIMULATION_ENABLED=true
EXPO_PUBLIC_ENABLE_AUTO_DETOURS=true
# Optional, but recommended for checking that the purple likely-detour path
# follows roads instead of the simulator's synthetic offset line.
DETOUR_ROAD_MATCHING_ENABLED=true
DETOUR_ROAD_MATCHING_BASE_URL=https://router.project-osrm.org
```

Then publish a fake active detour to Firestore:

```bash
curl -X POST http://localhost:3001/api/detour-simulate \
  -H "Content-Type: application/json" \
  -H "x-api-token: YOUR_TOKEN" \
  -d "{\"routeId\":\"1\"}"
```

To publish the Farmers Market test detour for route 11:

```bash
curl -X POST http://localhost:3001/api/detour-simulate \
  -H "Content-Type: application/json" \
  -H "x-api-token: YOUR_TOKEN" \
  -d "{\"preset\":\"farmers-market\",\"durationMinutes\":15}"
```

This simulates the Mulcaster Street closure between Collier Street and Worsley Street.
The visible detour path leaves the normal route at Collier Street and Owen Street, then uses Owen Street and McDonald Street, ending at McDonald Street and Mulcaster Street.

To publish the Saunders/Welham test detour for routes 12A and 12B:

```bash
curl -X POST http://localhost:3001/api/detour-simulate \
  -H "Content-Type: application/json" \
  -H "x-api-token: YOUR_TOKEN" \
  -d "{\"preset\":\"saunders-welham\",\"durationMinutes\":20}"
```

This simulates the Saunders Road and Welham Road intersection closure.
The visible detour path uses Welham Road, Mapleview Drive East, and Bayview Drive.

Open the app and confirm the detour banner, map overlay, and details sheet render.

Clear it when done:

```bash
curl -X POST http://localhost:3001/api/detour-simulate/clear \
  -H "Content-Type: application/json" \
  -H "x-api-token: YOUR_TOKEN" \
  -d "{\"routeId\":\"1\"}"
```

For the Farmers Market test, clear the route 11 document:

```bash
curl -X POST http://localhost:3001/api/detour-simulate/clear \
  -H "Content-Type: application/json" \
  -H "x-api-token: YOUR_TOKEN" \
  -d "{\"routeId\":\"11\"}"
```

For the Saunders/Welham test, clear both route documents:

```bash
curl -X POST http://localhost:3001/api/detour-simulate/clear \
  -H "Content-Type: application/json" \
  -H "x-api-token: YOUR_TOKEN" \
  -d "{\"routeId\":\"12A\"}"

curl -X POST http://localhost:3001/api/detour-simulate/clear \
  -H "Content-Type: application/json" \
  -H "x-api-token: YOUR_TOKEN" \
  -d "{\"routeId\":\"12B\"}"
```

Safety notes:
- This endpoint is disabled unless `DETOUR_SIMULATION_ENABLED=true`.
- It is blocked in production.
- It requires Firebase Admin credentials because it writes to `activeDetours`.

---

## 10. Key Files

### Server (api-proxy/)
- `detourWorker.js` — Worker orchestrator, supports interval and single-tick execution
- `detourDetector.js` — Core detection algorithm, route-level aggregation, segment-level lifecycle, vehicle tracking
- `detour/candidateMemory.js` — Headway-aware candidate evidence memory for low-frequency confirmation
- `detourGeometry.js` — Skipped segment + inferred path computation
- `detourPublisher.js` — Firestore publisher with write throttling
- `activeDetourSnapshotStore.js` — Loads published `activeDetours` snapshots for cold-start hydration/deletion safety
- `persistentDetourStore.js` — Firestore persistence for learned long-running detours
- `detourRuntimeStateStore.js` — Firestore persistence for detector runtime state between manual/scheduled ticks
- `baselineManager.js` — Persists baseline route shapes to Firestore; detects shape changes between GTFS updates

### Client (src/)
- `services/firebase/detourService.js` — Firestore listener for activeDetours
- `hooks/useDetourOverlays.js` — Transforms detour data for map rendering
- `components/DetourOverlay.js` / `.web.js` — Map overlay components
- `context/TransitContext.js` — Integrates detour state into app context

### Tests
- `api-proxy/__tests__/detourDetector.test.js` — detection logic, hysteresis, multi-vehicle behavior, same-route multi-segment lifecycle
- `api-proxy/__tests__/detourGeometry.test.js` — shape analysis, simplification, confidence, segment splitting
- `api-proxy/__tests__/detourPublisher.test.js` — snapshots, throttling, history events
- `api-proxy/__tests__/detourIntegration.test.js` — full pipeline, state transitions, one-route-two-segment publishing
- `src/__tests__/detourOverlays.test.js` — overlay derivation, state filtering
- `src/__tests__/detourIntegration.test.js` — Firestore → context → rendering
