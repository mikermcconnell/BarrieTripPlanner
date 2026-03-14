# Auto Detour Detection — Project Summary

> Single source of truth for the auto detour detection feature.
> Last updated: 2026-02-27

---

## 1. Purpose

**Riders open the app, look at the main map, and immediately see when a bus route is on detour.** No checking Twitter, no calling transit, no wondering why the bus didn't show up at their stop. The map shows it.

This is the core rider-facing goal:
- A highlighted overlay on the map showing which part of the route is detoured
- A banner telling riders "Route 1 is currently on detour"
- Details showing which stops are skipped and where buses are actually going

The system detects detours automatically by watching real-time GPS positions — no manual input from transit staff required.

**How it works under the hood:**
1. A server-side worker polls GTFS-RT vehicle positions every 30 seconds
2. Each vehicle's GPS is compared against its route's published shape
3. When consecutive off-route readings are observed, a detour is confirmed
4. Detour geometry (skipped segment + inferred path) is published to Firestore
5. The app subscribes in real time and shows the detour on the main map

---

## 2. Architecture

```
GTFS-RT Feed (vehicle positions)
        │
        ▼
┌─────────────────────┐
│  detourWorker.js     │  30s tick interval (hardcoded), starts fresh each worker run
│  (api-proxy/Railway) │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  detourDetector.js   │  State machine: (accumulating) → active → clear-pending → cleared
│  (core algorithm)    │  Per-vehicle tracking with consecutive reading thresholds
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

One document per active detour, keyed by route ID (e.g., `"8A"`, `"1"`).

| Field | Type | Description |
|---|---|---|
| `routeId` | String | Route identifier (also the document ID) |
| `detectedAt` | Timestamp | When the detour was first detected |
| `lastSeenAt` | Timestamp | When off-route evidence was last observed (throttled, updates every 5min) |
| `updatedAt` | Timestamp | When the Firestore document was last written |
| `triggerVehicleId` | String \| null | Vehicle that triggered initial detection |
| `vehicleCount` | Number | Count of vehicles currently off-route |
| `state` | String | `"active"` or `"clear-pending"` (documents are deleted when cleared, not updated to `"cleared"`) |
| `skippedSegmentPolyline` | String \| null | Encoded polyline of the route segment being skipped |
| `inferredDetourPolyline` | String \| null | Encoded polyline of the inferred detour path |
| `entryPoint` | `{ lat, lon }` \| null | Where vehicles leave the published route |
| `exitPoint` | `{ lat, lon }` \| null | Where vehicles rejoin the published route |
| `confidence` | String \| null | `"low"`, `"medium"`, or `"high"` |
| `evidencePointCount` | Number \| null | GPS evidence points collected |
| `lastEvidenceAt` | Timestamp \| null | When the most recent evidence point was recorded |

Documents are created on detection, updated each publish cycle, and deleted on clearing.

#### `detourHistory` collection

One document per event. Auto-generated IDs: `{timestamp}-{routeId}-{eventType}-{random}`.

Three event types:
- **`DETOUR_DETECTED`** — `routeId`, `occurredAt`, `detectedAt`, `lastSeenAt`, `triggerVehicleId`, `vehicleCount`, `confidence`, `evidencePointCount`, `source`
- **`DETOUR_UPDATED`** — `routeId`, `occurredAt`, `detectedAt`, `lastSeenAt`, `triggerVehicleId`, `previousTriggerVehicleId`, `vehicleCount`, `previousVehicleCount`, `changedFields[]`, `source` (note: no `confidence`/`evidencePointCount` — those are tracked via `changedFields`)
- **`DETOUR_CLEARED`** — `routeId`, `occurredAt`, `detectedAt`, `clearedAt`, `durationMs`, `triggerVehicleId`, `previousVehicleCount`, `source`

All history events include `source: "detour-worker-v2"`.

---

## 3. Current State (as of 2026-03-03)

### What riders see today
The client now has the main rider-facing pieces in code:
- `DetourAlertStrip` on the map screen
- `DetourDetailsSheet` for affected stops and detour timing
- `DetourOverlay` and detour-focused map mode

The rider feature is still controlled by `EXPO_PUBLIC_ENABLE_AUTO_DETOURS`.

Note: Firestore is the source of truth for active detours. The client should render what the backend publishes rather than applying its own freshness pruning rules.

### What's built (backend — complete)
- Detection worker running on Railway, polling every 30s
- Detection algorithm with consecutive readings, zone-aware clearing (separate on-route threshold within detour zone), hysteresis (buffer between detection and clearing thresholds to prevent flickering)
- **Service-hours-aware clearing** — outside service hours (1 AM - 5 AM EST), detection freezes. At end-of-service, all active detours are cleared and the worker starts fresh when service resumes.
- Firestore publishing (active detours + geometry) with write throttling
- Detour history event logging (30-day retention)
- Debug endpoints: `/api/detour-status`, `/api/detour-debug`, `/api/detour-logs`
- 170 tests across 9 suites

### What's built (frontend — partially complete)
- `DetourOverlay` component (native + web) — draws skipped segment + inferred path on the map
- `useDetourOverlays` hook — transforms Firestore data for map rendering
- `detourService.js` — Firestore real-time listener for activeDetours
- Wired into TransitContext and HomeScreen (both platforms)

### What's missing to go public

**Deploy steps:**
1. **Turn on the rider feature flag** — Set `EXPO_PUBLIC_ENABLE_AUTO_DETOURS` to `true`.

**Build work:**
2. Validate the current alert strip, map overlay, and details sheet together in production-like builds.
3. Confirm the affected-stop derivation is accurate across route variants and opposite directions.

**Should-haves:**
5. **Push notifications** — Alert riders who have favorited a route when a new detour is detected.
6. **Accessibility** — Screen reader announcements for detour events.

### Known Issues (Fixed)
- **Flapping detours** (Fixed 2026-02-27) — Single-vehicle GPS noise caused rapid detect/clear cycles. Fixed by raising `CONSECUTIVE_READINGS_REQUIRED` from 3→4 (2 minutes at 30s ticks). Made configurable via `DETOUR_CONSECUTIVE_READINGS` env var.
- **Zombie detours & premature clearing** (Fixed 2026-03-03, simplified 2026-03-13) — False-positive detours could linger overnight while real multi-vehicle detours cleared inconsistently when buses stopped reporting. The current model clears all detours at end-of-service and re-detects fresh detours the next service day.

---

## 4. Definition of Success

The feature is "done" when a rider can open the app and know a detour is happening without any other source of information.

### Must Have (MVP)
- [ ] Rider opens the map and sees a visual overlay on any route that's currently detoured
- [ ] A banner on the map screen tells the rider which route is affected ("Route 1 is on detour")
- [ ] Tapping the banner/overlay shows which stops are skipped
- [ ] Detours are detected within 5 minutes of buses deviating (math: 4 readings × 30s = 2min minimum; 5min target provides margin for GPS jitter)
- [ ] For established detours (>10min old): clear within 5 minutes of all buses returning to route (math: 6 readings × 30s = 3min + 1 tick)
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
| `DETOUR_OFF_ROUTE_THRESHOLD_METERS` | `75` | Distance from shape to count as "off route" |
| `DETOUR_CONSECUTIVE_READINGS` | `4` | Off-route ticks before confirming (4 × 30s = 2min) |
| `DETOUR_EVIDENCE_WINDOW_MS` | `900000` | Time window for geometry evidence points (15min) |
| `DETOUR_NO_VEHICLE_TIMEOUT_MS` | `1800000` | Time before detour with no vehicles enters clear-pending (30min) |

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
| `DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE` | `6` | On-route ticks before clearing per vehicle (6 × 30s = 3min) |

### Publishing & History
| Variable | Default | Description |
|---|---|---|
| `DETOUR_GEOMETRY_WRITE_THROTTLE_MS` | `120000` | Min ms between Firestore geometry writes per route (2min) |
| `DETOUR_HISTORY_ENABLED` | `true` | Enable detour event history in Firestore |
| `DETOUR_HISTORY_RETENTION_DAYS` | `30` | Days to retain history (<=0 disables pruning) |

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
| `DP_TOLERANCE_METERS` | `25` | detourGeometry.js | Douglas-Peucker simplification tolerance |

---

## 6. Failure Modes & Resilience

| Scenario | Behavior |
|---|---|
| **GTFS-RT feed unavailable** | Fetch retries once (2s delay), then fails tick. `consecutiveFailureCount` increments. Detours persist in-memory. Worker retries next tick (30s), no backoff. |
| **Vehicle disappears from feed** | Removed from state after 5min (`STALE_VEHICLE_TIMEOUT_MS`). Does NOT clear the detour — absence of data is not evidence of return. |
| **All vehicles on route go offline** | Detour enters `clear-pending` after 30min without evidence (`DETOUR_NO_VEHICLE_TIMEOUT_MS`). Can reactivate if a vehicle returns off-route. |
| **Firestore write fails** | Error logged, publish skipped for that tick. Detection state machine continues in-memory. Retries next tick. |
| **Firestore unreachable at startup** | Publisher hydration may fail, but the detector still begins fresh. Existing detours are re-detected as vehicles appear. |
| **Worker restarts** | Detector state is rebuilt from fresh vehicle evidence rather than seeded from Firestore. |
| **Service ends with active detours** | All active detours are cleared immediately. New off-route vehicles are ignored until service hours resume. |

---

## 7. Debug Endpoints

### `GET /api/detour-status`
Overview of the detection system. Returns:
- `enabled`, `running`, `tickCount`, `lastSuccessfulTick`
- `consecutiveFailureCount`, `errors.fetchFailures`, `errors.publishFailures`
- `activeDetours` — map of route IDs → `{ vehicleCount, detectedAt, state }`
- `baseline` — `{ loaded, loadedAt, source, routeCount, shapeCount }`
- `recentEvents` — last 20 events (human-readable strings)
- `evidenceSummary` — per-route `{ pointCount, oldestMs, newestMs }`

### `GET /api/detour-debug?routeId=8`
Raw evidence points for a specific route. Returns lat/lon/timestamp/vehicleId for each point (max 200). Without `routeId`, returns summary counts only (safe for production).

### `GET /api/detour-logs?limit=50&routeId=&eventType=&start=&end=`
Queries `detourHistory` collection with optional filters. Returns event log entries (DETECTED, UPDATED, CLEARED) in reverse chronological order.

---

## 8. Rollout Plan

**Stage 1: Internal Testing** (current)
- Detection worker running in production, rider UI behind `EXPO_PUBLIC_ENABLE_AUTO_DETOURS`
- Monitoring for false positives and flapping via `/api/detour-status`
- Tuning thresholds based on real Barrie Transit data

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
   Look for `"running": true` and `tickCount` incrementing.

4. To see detour overlays in the client, also set in your root `.env`:
   ```
   EXPO_PUBLIC_ENABLE_AUTO_DETOURS=true
   ```

---

## 10. Key Files

### Server (api-proxy/)
- `detourWorker.js` — Worker orchestrator, 30s tick loop, service-hours-aware fresh-start processing
- `detourDetector.js` — Core detection algorithm, state machine, vehicle tracking
- `detourGeometry.js` — Skipped segment + inferred path computation
- `detourPublisher.js` — Firestore publisher with write throttling
- `baselineManager.js` — Persists baseline route shapes to Firestore; detects shape changes between GTFS updates

### Client (src/)
- `services/firebase/detourService.js` — Firestore listener for activeDetours
- `hooks/useDetourOverlays.js` — Transforms detour data for map rendering
- `components/DetourOverlay.js` / `.web.js` — Map overlay components
- `context/TransitContext.js` — Integrates detour state into app context

### Tests (143 test cases across 6 files)
- `api-proxy/__tests__/detourDetector.test.js` — 45 tests: detection logic, hysteresis, multi-vehicle
- `api-proxy/__tests__/detourGeometry.test.js` — 27 tests: shape analysis, simplification, confidence
- `api-proxy/__tests__/detourPublisher.test.js` — 14 tests: snapshots, throttling, history events
- `api-proxy/__tests__/detourIntegration.test.js` — 9 tests: full pipeline, state transitions
- `src/__tests__/detourOverlays.test.js` — 25 tests: overlay derivation, state filtering
- `src/__tests__/detourIntegration.test.js` — 23 tests: Firestore → context → rendering
