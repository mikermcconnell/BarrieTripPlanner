# Auto Detour Detection — Project Summary

> Feature reference for detour detection behavior, data model, and rider-facing intent.
> For backend deployment, auth, and operational runbooks, use `docs/API-PROXY-OPERATIONS.md`.
> For repo-wide doc load order, use `AGENTS.md`.

---

## 1. Purpose

**Riders open the app, look at the main map, and immediately see when a bus route is on detour.** No checking Twitter, no calling transit, no wondering why the bus didn't show up at their stop. The map shows it.

This is the core rider-facing goal:
- A highlighted overlay on the map showing which part of the route is detoured
- A banner telling riders "Route 1 is currently on detour"
- Details showing which stops are skipped and where buses are actually going

The system detects detours automatically by watching real-time GPS positions — no manual input from transit staff required.

**How it works under the hood:**
1. A server-side worker processes GTFS-RT vehicle positions on each detection tick
2. Each vehicle's GPS is compared against its route's published shape
3. When consecutive off-route readings are observed, or the same short deviation repeats across trips/vehicles, a detour is confirmed
4. Detour geometry (skipped segment + inferred path) is published to Firestore
5. The app subscribes in real time and shows the detour on the main map

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
| `vehicleCount` | Number | Count of vehicles currently off-route |
| `state` | String | `"active"` or `"clear-pending"` (documents are deleted when cleared, not updated to `"cleared"`) |
| `isPersistent` | Boolean | Whether the published route snapshot is currently backed by a learned persistent detour record |
| `segments` | Array | Renderable detour sections for this route. Each segment can have its own entry/exit points and skipped/inferred geometry. |
| `skippedSegmentPolyline` | String \| null | Encoded polyline of the route segment being skipped |
| `inferredDetourPolyline` | String \| null | Encoded polyline of the inferred detour path |
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

Documents are created on detection, updated each publish cycle, and deleted when the final active segment clears.

#### `detourHistory` collection

One document per event. Auto-generated IDs: `{timestamp}-{routeId}-{eventType}-{random}`.

Three event types:
- **`DETOUR_DETECTED`** — `routeId`, `occurredAt`, `detectedAt`, `lastSeenAt`, `triggerVehicleId`, `vehicleCount`, `confidence`, `evidencePointCount`, `lastEvidenceAt`, `shapeId`, `entryPoint`, `exitPoint`, `skippedSegmentPolyline`, `inferredDetourPolyline`, `segmentCount`, `source`
- **`DETOUR_UPDATED`** — `routeId`, `occurredAt`, `detectedAt`, `lastSeenAt`, `triggerVehicleId`, `previousTriggerVehicleId`, `vehicleCount`, `previousVehicleCount`, `changedFields[]`, `source` (note: no `confidence`/`evidencePointCount` — those are tracked via `changedFields`)
- **`DETOUR_CLEARED`** — `routeId`, `occurredAt`, `detectedAt`, `clearedAt`, `durationMs`, `triggerVehicleId`, `previousVehicleCount`, `lastEvidenceAt`, `shapeId`, `entryPoint`, `exitPoint`, `skippedSegmentPolyline`, `inferredDetourPolyline`, `segmentCount`, `source`

All history events include `source: "detour-worker-v2"`.

---

## 3. Current State (as of 2026-03-15)

### What riders see today
The client now has the main rider-facing pieces in code:
- `DetourAlertStrip` on the map screen
- `DetourDetailsSheet` for affected stops and detour timing
- `DetourOverlay` and detour-focused map mode

The rider feature is still controlled by `EXPO_PUBLIC_ENABLE_AUTO_DETOURS`.

Note: Firestore is the source of truth for active detours. The client should render what the backend publishes rather than applying its own freshness pruning rules.
The client already renders multi-segment detours from `segments[]`; the recent backend work makes same-route independent detours publish as separate sections instead of one merged lifecycle.

### What's built (backend — complete)
- Detection worker supports a legacy 30s interval loop and a newer manual/scheduled single-tick mode
- Detection algorithm with consecutive readings, zone-aware clearing (separate on-route threshold within detour zone), hysteresis (buffer between detection and clearing thresholds to prevent flickering)
- **Recurring short-deviation detection** — repeated short off-route streaks on the same route segment can publish a detour even when no single bus stays off-route long enough to hit the normal consecutive-reading threshold. This is meant for short downtown jogs such as temporary market closures.
- **Service-hours-aware clearing** — outside service hours (1 AM - 5 AM EST), detection freezes. At end-of-service, all active detours are cleared and the worker starts fresh when service resumes.
- **Headway-aware stale clearing** — as a safety net, the publisher clears stale active detour documents only when route-family vehicles are still reporting and the latest detour evidence is older than a schedule-aware threshold. The threshold is roughly two scheduled headways plus a buffer, with a 45-minute minimum, so low-frequency Sunday routes are not cleared just because no bus has reached the affected segment yet.
- **Zero-vehicle stale clearing** — when a published detour has no vehicles currently off-route but route-family buses are still reporting, the publisher uses a shorter stale-evidence window so false positives do not linger on the map after buses return to normal routing.
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
- **Still in validation: affected-stop accuracy on route variants and opposite directions** — Geometry and rendering are now segment-aware, but the public-launch validation pass still needs to confirm the skipped-stop derivation is correct across route families such as 8A/8B and both directions of travel.

### What's missing to go public

**Deploy steps:**
1. **Turn on the rider feature flag** — Set `EXPO_PUBLIC_ENABLE_AUTO_DETOURS` to `true`.
2. **Pass rollout health checks** — Confirm `/api/detour-rollout-health` reports `launchReadiness.status` as `pilot_ready` or `pilot_ready_with_cautions`.

**Build work:**
3. Validate the current alert strip, map overlay, and details sheet together in production-like builds.
4. Confirm the affected-stop derivation is accurate across route variants and opposite directions.

**Security / operations:**
5. Keep route-specific `/api/detour-debug?routeId=...` disabled for non-admin production callers unless a trusted operator explicitly enables `DETOUR_DEBUG_ROUTE_DETAILS_ENABLED=true`.
6. Monitor short-lived detections, repeated clears, and publish failures in rollout health during the first live validation window.

**Should-haves:**
7. **Push notifications** — Alert riders who have favorited a route when a new detour is detected.
8. **Accessibility** — Screen reader announcements for detour events.

### Known Issues (Fixed)
- **Flapping detours** (Fixed 2026-02-27) — Single-vehicle GPS noise caused rapid detect/clear cycles. Fixed by raising `CONSECUTIVE_READINGS_REQUIRED` from 3→4 (2 minutes at 30s ticks). Made configurable via `DETOUR_CONSECUTIVE_READINGS` env var.
- **Zombie detours & premature clearing** (Fixed 2026-03-03, simplified 2026-03-13) — False-positive detours could linger overnight while real multi-vehicle detours cleared inconsistently when buses stopped reporting. The current model clears all detours at end-of-service and re-detects fresh detours the next service day.
- **Independent same-route detours merged into one lifecycle** (Fixed 2026-03-15) — Two detours on the same route could collapse into one route-wide lifecycle, then clear incorrectly when buses traveled normally between them. The detector now tracks segment-level lifecycles inside one route snapshot, so one segment can clear without deleting the others.

---

## 4. Definition of Success

The feature is "done" when a rider can open the app and know a detour is happening without any other source of information.

### Must Have (MVP)
- [ ] Rider opens the map and sees a visual overlay on any route that's currently detoured
- [ ] A banner on the map screen tells the rider which route is affected ("Route 1 is on detour")
- [ ] Tapping the banner/overlay shows which stops are skipped
- [ ] Detours are detected within 5 minutes of buses deviating (math: 4 readings × 30s = 2min minimum; 5min target provides margin for GPS jitter)
- [ ] For established detours (>10min old): clear within 5 minutes of all buses returning to route (interval mode: 6 readings × 30s = 3min + 1 tick; 1-minute scheduled mode: 4 readings + 1 tick)
- [ ] Minimum visibility: detours stay shown for at least 10 minutes after detection, even if buses return to route quickly (grace period prevents flicker)
- [ ] False positive rate < 10% over a 7-day window (measured via `/api/detour-logs` — count DETECTED events that clear within 5 minutes as false positives)

### Should Have
- [ ] Push notifications for favorited routes with active detours
- [ ] Detection works correctly for route variants (8A/8B)
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
| `DETOUR_WORKER_MODE` | `interval` | `interval`, `manual`, or `scheduled`. `manual`/`scheduled` use single-tick execution through `POST /api/detour-run-once`. |
| `DETOUR_ENABLE_ROUTE_FAMILY_HANDOFF` | `true` | Allows sibling route projection (for example 8A/8B). Set to `false` while debugging route-assignment errors. |
| `DETOUR_OFF_ROUTE_THRESHOLD_METERS` | `75` | Distance from shape to count as "off route" |
| `DETOUR_CONSECUTIVE_READINGS` | `4` | Off-route ticks before confirming (4 × 30s = 2min) |
| `DETOUR_RECURRING_SHORT_DEVIATION_ENABLED` | `true` | Enables aggregation of repeated short off-route streaks across trips/vehicles. Set to `false` to disable. |
| `DETOUR_RECURRING_SHORT_DEVIATION_WINDOW_MS` | `10800000` | Time window for grouping repeated short deviations (3h). |
| `DETOUR_RECURRING_SHORT_DEVIATION_MIN_OBSERVATIONS` | `3` | Short-deviation observations required before publishing. |
| `DETOUR_RECURRING_SHORT_DEVIATION_MIN_UNIQUE_SIGNATURES` | `2` | Minimum unique trips/vehicles required before publishing. |
| `DETOUR_RECURRING_SHORT_DEVIATION_MAX_GAP_METERS` | `350` | Maximum projected route-distance gap for short deviations to be grouped together. |
| `DETOUR_RECURRING_SHORT_DEVIATION_MAX_STREAK_READINGS` | `3` | Longest off-route streak eligible for short-deviation aggregation. Longer streaks use the normal detector path. |
| `DETOUR_EVIDENCE_WINDOW_MS` | `900000` | Time window for geometry evidence points (15min) |
| `DETOUR_SEGMENT_GAP_METERS` | `400` | Minimum projected gap before geometry evidence is split into separate published detour segments |
| `DETOUR_MIN_LINEAR_SEGMENT_LENGTH_METERS` | `100` | Minimum skipped-route span before route-aligned skipped-segment geometry is published |
| `DETOUR_NO_VEHICLE_TIMEOUT_MS` | `1800000` | Time before detour with no vehicles enters clear-pending (30min) |
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
| `DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE` | `6` in interval/manual mode; `4` in scheduled mode | On-route ticks before clearing per vehicle. The scheduled-mode default keeps a 1-minute scheduler inside the 5-minute clear target. |
| `DETOUR_STALE_AUTO_CLEAR_ENABLED` | `true` | Enables the publisher-side stale-detour safety clear. |
| `DETOUR_STALE_AUTO_CLEAR_MIN_MS` | `2700000` | Minimum stale evidence window before safety clearing (45min). |
| `DETOUR_STALE_AUTO_CLEAR_HEADWAY_MULTIPLIER` | `2` | Number of scheduled headways to wait before stale safety clearing. |
| `DETOUR_STALE_AUTO_CLEAR_BUFFER_MS` | `600000` | Extra buffer added to the headway-based stale window (10min). |
| `DETOUR_STALE_AUTO_CLEAR_MAX_MS` | `10800000` | Maximum stale safety window (3h). |
| `DETOUR_STALE_AUTO_CLEAR_DEFAULT_HEADWAY_MS` | `3600000` | Conservative fallback headway when nearby GTFS trips are unavailable but service still appears active. |
| `DETOUR_ZERO_VEHICLE_STALE_AUTO_CLEAR_MS` | `720000` | Short stale-evidence window for active detours with `vehicleCount: 0` while route-family vehicles are still reporting (12min). |
| `DETOUR_ZERO_VEHICLE_STALE_AUTO_CLEAR_MIN_AGE_MS` | `600000` | Minimum detour age before zero-vehicle stale clearing can remove a published detour (10min). |

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
| `MIN_EVIDENCE_FOR_GEOMETRY` | `3` | detourGeometry.js | Min evidence points to build geometry |
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
| **All vehicles for one active segment go offline** | That segment enters `clear-pending` after 30min without evidence (`DETOUR_NO_VEHICLE_TIMEOUT_MS`). The route stays published while any other segment on that route remains active. |
| **Firestore write fails** | Error logged, publish skipped for that tick. Detection state machine continues in-memory. Retries next tick. |
| **Firestore unreachable at startup** | Publisher hydration may fail, but the detector still begins fresh. Existing detours are re-detected as vehicles appear. |
| **Worker restarts** | In interval mode, detector rehydrates learned persistent detours and resumes in-memory monitoring. In manual/scheduled mode, runtime detector state is reloaded from Firestore before each tick. |
| **Service ends with active detours** | Volatile active detours clear immediately. Learned persistent detours are re-seeded on the next service day and only fully clear after repeated on-route traversal through the learned detour zone. |

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

To publish the Farmers Market test detour for routes 10 and 11:

```bash
curl -X POST http://localhost:3001/api/detour-simulate \
  -H "Content-Type: application/json" \
  -H "x-api-token: YOUR_TOKEN" \
  -d "{\"preset\":\"farmers-market\",\"durationMinutes\":15}"
```

Open the app and confirm the detour banner, map overlay, and details sheet render.

Clear it when done:

```bash
curl -X POST http://localhost:3001/api/detour-simulate/clear \
  -H "Content-Type: application/json" \
  -H "x-api-token: YOUR_TOKEN" \
  -d "{\"routeId\":\"1\"}"
```

For the Farmers Market test, clear both route documents:

```bash
curl -X POST http://localhost:3001/api/detour-simulate/clear \
  -H "Content-Type: application/json" \
  -H "x-api-token: YOUR_TOKEN" \
  -d "{\"routeId\":\"10\"}"

curl -X POST http://localhost:3001/api/detour-simulate/clear \
  -H "Content-Type: application/json" \
  -H "x-api-token: YOUR_TOKEN" \
  -d "{\"routeId\":\"11\"}"
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
- `detourGeometry.js` — Skipped segment + inferred path computation
- `detourPublisher.js` — Firestore publisher with write throttling
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
