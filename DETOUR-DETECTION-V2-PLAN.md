# Auto-Detour Detection v2 — Rebuild Plan

## Context

The old detour detection system was removed (9 dedicated files deleted, 7 integration files cleaned) because it had multiple unclear failures. The old system was over-engineered: 850-line detection service, dual client+server detection with merge logic, confidence scoring, evidence accumulation windows, per-route threshold overrides, and path overlap analysis.

**This rebuild takes the opposite approach: radically simple server-side detection with minimal client UI.**

The key requirement is that detection runs 24/7 on the server regardless of app usage, so any user opening the app sees current detour status immediately.

## Requirements Summary

| Setting | Value |
|---------|-------|
| Detection runs on | api-proxy server (Railway), always-on |
| Storage | Firebase Firestore (`activeDetours` collection) |
| Client subscription | `onSnapshot` real-time listener |
| Poll interval | 30 seconds |
| Off-route threshold | 75 meters from nearest point on any route shape |
| Confirmation | 2 consecutive off-route readings (~60s) |
| Clearing | Auto-clear when all vehicles return to route |
| Corroboration | Single vehicle sufficient |
| Route matching | By route ID (check all shapes for route) |
| MVP UI | Orange dot on route filter chips only |

---

## Architecture

```
Barrie Transit GTFS-RT Feed
        |
        v (every 30s)
[ api-proxy/detourWorker.js ]  ← Railway (always-on)
        |
        | fetch vehicles, compare to shapes
        v
[ api-proxy/detourDetector.js ]  ← core algorithm
        |
        | batch write/delete
        v
[ Firebase Firestore: activeDetours/{routeId} ]
        |
        | onSnapshot (real-time)
        v
[ App: TransitContext → isRouteDetouring(routeId) ]
        |
        v
[ Route chip dot indicator ]
```

---

## Step 1: Server-Side Foundation (7 new files)

### 1a. `api-proxy/firebaseAdmin.js` (~25 lines)
- Initialize Firebase Admin SDK (lazy singleton)
- Supports `FIREBASE_SERVICE_ACCOUNT_JSON` env var (Railway) or `GOOGLE_APPLICATION_CREDENTIALS` (local)
- Exports `getFirestore()`

### 1b. `api-proxy/geometry.js` (~60 lines)
- CommonJS port of 3 functions from `src/utils/geometryUtils.js`:
  - `haversineDistance(lat1, lon1, lat2, lon2)` → meters
  - `pointToSegmentDistance(point, segStart, segEnd)` → meters
  - `pointToPolylineDistance(point, polyline)` → meters
- Only port what we need. No path overlap, no simplification.

### 1c. `api-proxy/gtfsLoader.js` (~120 lines)
- Downloads GTFS static ZIP from `https://www.myridebarrie.ca/gtfs/Google_transit.zip`
- Extracts `shapes.txt` and `trips.txt` using jszip (already in api-proxy deps)
- Builds in-memory: `shapes`, `tripMapping`, `routeShapeMapping`
- 6-hour cache TTL, forced refresh support
- Minimal CSV parser (same approach as `src/services/gtfsService.js`)
- Validate expected GTFS files/headers before use; if invalid/missing, keep last known-good cached data and increment/log `invalidFeed` errors

### 1d. `api-proxy/vehicleFetcher.js` (~130 lines)
- Fetches `https://www.myridebarrie.ca/gtfs/GTFS_VehiclePositions.pb`
- CommonJS port of protobuf decoder from `src/utils/protobufDecoder.js`
- Returns minimal vehicle objects: `{ id, routeId, coordinate: { latitude, longitude } }`
- Resolves routeId via tripMapping when not directly in feed
- On malformed/partial vehicle feed decode failure, fail the tick safely (no crash), increment error counter, and surface in status/logs

### 1e. `api-proxy/detourDetector.js` (~120 lines) — CORE
- Maintains in-memory state per vehicle:
  ```
  vehicleState[vehicleId] = { routeId, consecutiveOffRoute, lastCheckedAt }
  ```
- Maintains active detours per route:
  ```
  activeDetours[routeId] = { detectedAt, lastSeenAt, triggerVehicleId, vehiclesOffRoute: Set }
  ```
- Per poll cycle, for each vehicle:
  1. Get all shapes for vehicle's route via `routeShapeMapping`
  2. Compute `min(pointToPolylineDistance(vehicle, shape))` across all shapes
  3. If >75m: increment `consecutiveOffRoute`; at >=2, add to route's active detour
  4. If <=75m: reset counter, remove from route's `vehiclesOffRoute` set; if set empty, delete detour
- Prune stale vehicles (not seen for 5 minutes) to prevent ghost detours
- Edge cases: skip vehicles with no routeId, skip routes with no shapes
- Restart tolerance requirement: on startup, rehydrate current `activeDetours` documents and do not clear a detour until 2 consecutive on-route readings post-restart (prevents false clear after deploy/restart)

### 1f. `api-proxy/detourPublisher.js` (~70 lines)
- Writes active detours to Firestore `activeDetours` collection
- One document per route (doc ID = routeId)
- Schema: `{ routeId, detectedAt, lastSeenAt, updatedAt, triggerVehicleId, vehicleCount }`
- Tracks `lastPublishedIds` to diff — only writes on change (saves Firestore quota)
- Deletes documents for routes whose detours cleared

### 1g. `api-proxy/detourWorker.js` (~60 lines)
- Orchestrator: `start(logger)`, `stop()`, `getStatus()`
- Uses `setInterval` at 30s with overlap guard
- Chains: getStaticData → fetchVehicles → processVehicles → publishDetours
- Logs each tick: vehicle count, detour count, errors
- Track and expose health metrics: `lastSuccessfulTick`, `lastDetourPublishAt`, `consecutiveFailureCount`, `invalidFeedCount`

### 1h. Modify `api-proxy/index.js`
- Require and start worker when `DETOUR_WORKER_ENABLED=true`
- Add `GET /api/detour-status` diagnostic endpoint
- Add `SIGTERM` handler for graceful shutdown
- Add operations guardrail: alert when 2+ ticks are missed or consecutive failure count crosses threshold

---

## Step 2: Firebase Security Rules

```
match /activeDetours/{routeId} {
  allow read: if true;     // Public — all app users, no auth required
  allow write: if false;   // Admin SDK only (server)
}
```

Deploy via Firebase Console or `firebase deploy --only firestore:rules`.

Rollout guardrail: validate rules in CI/deploy flow first, then confirm reads are public and client writes are denied before enabling UI indicator.

---

## Step 3: Client-Side Listener (1 new file + 1 modify)

### 3a. `src/services/firebase/detourService.js` (~40 lines, new)
- `subscribeToActiveDetours(onUpdate, onError)` → unsubscribe function
- Listens to `activeDetours` collection via `onSnapshot`
- Returns `{ [routeId]: { routeId, detectedAt, lastSeenAt, vehicleCount } }`
- Handles permission-denied gracefully (returns empty object)
- Expose listener health metadata (`lastSnapshotAt`, `hasConnectionError`) so UI can degrade gracefully during reconnects/outages

### 3b. Modify `src/context/TransitContext.js`
- Import `detourService`
- Add `activeDetours` state (`{}`)
- Subscribe on mount once (no auth required — public collection), avoid per-render listener churn
- Expose `isRouteDetouring(routeId)` helper via context value
- Cleanup unsubscribe on unmount

---

## Step 4: MVP UI — Route Chip Dots (3 files modified)

### 4a. Modify `src/screens/HomeScreen.js`
- Destructure `isRouteDetouring` from `useTransit()`
- Pass to `<HomeScreenControls isRouteDetouring={isRouteDetouring} />`

### 4b. Modify `src/components/HomeScreenControls.js`
- Accept `isRouteDetouring` prop
- Inside each route chip: render orange dot when `isRouteDetouring(r.id)` is true
- Style: 8px orange circle, absolute positioned top-right of chip

### 4c. Modify `src/screens/HomeScreen.web.js`
- Destructure `isRouteDetouring` from `useTransit()`
- Add orange dot to route chips in the filter panel (same style as native)
- Gate dot rendering behind a feature flag/remote config kill switch for safe rollout

---

## Implementation Order

| # | Work | Can deploy independently? |
|---|------|--------------------------|
| 1 | Server files (1a-1g) + index.js changes | Yes — deploy to Railway, verify via logs + `/api/detour-status` + Firestore Console |
| 2 | Firestore security rules | Yes — must be done before client listener works |
| 3 | Client listener + TransitContext | Yes — will show empty detours until server is running |
| 4 | UI — route chip dots | Depends on Step 3 |

Steps 1 and 2 can be done first and verified end-to-end before touching any client code.

---

## Verification Plan

1. **Server worker running:** `GET /api/detour-status` returns `{ running: true, tickCount: N }`
2. **Console logs:** `[detourWorker] tick #N: 18 vehicles, 0 active detours` (expect 0 during normal operation)
3. **Firestore Console:** Check `activeDetours` collection — empty during normal ops, populated during real detours
4. **Simulate detour for testing:** Add temporary `GET /api/detour-test` endpoint that injects a fake off-route vehicle, runs 2 detection cycles, and publishes to Firestore. Verify dot appears on route chip in app. Remove endpoint before production.
5. **Alternative test:** Temporarily lower threshold to 5m — GPS jitter at stops will trigger detours on every route, confirming the full pipeline
6. **Client:** Open app, select a route with active (test) detour, confirm orange dot appears on chip
7. **Clearing:** Delete test documents from Firestore Console, confirm dot disappears in real-time
8. **Worker restart tolerance:** With an active detour present, restart worker/deploy and confirm detour is not cleared until 2 consecutive on-route readings arrive post-restart
9. **GTFS validation fallback:** Simulate missing/invalid `shapes.txt` or `trips.txt`; confirm loader logs/increments `invalidFeed`, uses cached data, and worker continues running

---

## Files Summary

**New (8 files):**
- `api-proxy/firebaseAdmin.js`
- `api-proxy/geometry.js`
- `api-proxy/gtfsLoader.js`
- `api-proxy/vehicleFetcher.js`
- `api-proxy/detourDetector.js`
- `api-proxy/detourPublisher.js`
- `api-proxy/detourWorker.js`
- `src/services/firebase/detourService.js`

**Modified (5 files):**
- `api-proxy/index.js` — start worker + status endpoint
- `src/context/TransitContext.js` — subscribe + expose `isRouteDetouring`
- `src/components/HomeScreenControls.js` — detour dot on native chips
- `src/screens/HomeScreen.js` — pass `isRouteDetouring` prop
- `src/screens/HomeScreen.web.js` — detour dot on web chips

**Key existing code to reuse (port to CommonJS for server):**
- `src/utils/geometryUtils.js` → `haversineDistance`, `pointToSegmentDistance`, `pointToPolylineDistance`
- `src/utils/protobufDecoder.js` → protobuf decode functions
- `src/services/gtfsService.js` → CSV parsing approach for shapes/trips
