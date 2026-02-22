# Detour Geometry + UI Implementation Plan

## Goal

Show users **where** a detour is happening on the map (not just that a route is detouring), while preventing false clears when buses briefly rejoin normal routing mid-detour.

This plan is organized into small, deployable chunks with explicit acceptance criteria.

---

## Current Gaps (Baseline)

1. Detection state can clear too quickly:
   - Route detour clears as soon as off-route evidence drops below minimum (`MIN_VEHICLES_FOR_DETOUR=1`).
   - There is no route-level clear grace period/hysteresis.
2. Backend does not publish detour geometry:
   - `activeDetours` has status metadata, but no skipped segment or inferred detour polyline.
3. UI only shows route-level detour indicator:
   - Route chip dot exists, but no on-map detour overlay.

---

## Scope

### In scope

1. Stabilize detection to avoid flapping.
2. Generate and publish detour geometry:
   - skipped normal-route segment
   - inferred detour path from off-route evidence
3. Render these geometries in native and web map UIs.
4. Add diagnostics and rollout controls.

### Out of scope (for this iteration)

1. Full road-network map-matching service.
2. User-edited/manual detour drawing tools.
3. Historical replay UI.

---

## Target Output

When route `8A`/`8B` detours:

1. Route remains marked detouring even if bus briefly rejoins normal line mid-trip.
2. Map shows:
   - red dashed **skipped normal segment**
   - orange dashed **inferred detour corridor/path**
3. Detour clears only after sustained on-route behavior.

---

## Chunked Implementation Plan

## Chunk 1: Detection Hysteresis + Latching (Backend Core)

**Files**

- `api-proxy/detourDetector.js`
- `api-proxy/detourWorker.js` (tick model + event logging updates)
- `api-proxy/.env` and `.env.example` (new tuning vars)

**Tasks**

1. Add route-level latch state in detector memory:
   - `activeSince`
   - `lastOffRouteAt`
   - `clearCandidateSince`
   - per-vehicle on-route/off-route streaks
2. Introduce separate detect vs clear thresholds:
   - `DETOUR_OFF_ROUTE_THRESHOLD_METERS` (existing, default `75`)
   - `DETOUR_ON_ROUTE_CLEAR_THRESHOLD_METERS` (new, default `40`)
3. Add clear hysteresis controls:
   - `DETOUR_CLEAR_GRACE_MS` (default `600000`, 10 min)
   - `DETOUR_MIN_ACTIVE_MS` (default `300000`, 5 min)
   - `DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE` (default `6`)
4. Apply trip-shape-first distance check:
   - use trip shape distance when available
   - fallback to route-wide shape distance
5. Ensure clear only happens when route-level criteria pass (not a single on-route tick).
6. **Rewrite `removeVehicleFromDetour` for deferred clearing:**
   - Current implementation calls `activeDetours.delete(routeId)` immediately when vehicle count drops below `MIN_VEHICLES_FOR_DETOUR`. This must be replaced with a time-deferred check that transitions to `clear-pending` state instead of instant deletion.
   - The function runs on every individual vehicle update, not on a route-level tick — hysteresis requires converting this to a state-transition model (`active` → `clear-pending` → cleared) rather than an immediate delete.
7. **Update `processVehicles` return contract for multi-state model:**
   - `processVehicles` must return routes in `clear-pending` state (not just truly-active routes) so the publisher can continue including them with `state: 'clear-pending'`.
   - Without this, the worker's `detour cleared` event logging (line ~50 of `detourWorker.js`) will still fire false clear events during the grace period, defeating hysteresis.
8. **Update `detourWorker.js` event logging:**
   - The worker must distinguish between `detour cleared` (final, after grace period) and `detour clear-pending` (transitional).
   - Do not emit `detour cleared` until the route has fully exited the grace period and met all clear criteria.

**Acceptance criteria**

1. Route does not clear after brief rejoin (< grace period).
2. Repeated off/on oscillations do not flap active state every tick.
3. `detour-status` still updates tick health with zero failures.
4. `processVehicles` returns `clear-pending` routes with their state field.
5. No false `detour cleared` events fire during the grace period.

---

## Chunk 2: Detour Evidence Capture + Geometry Builder

**Files**

- `api-proxy/detourDetector.js`
- `api-proxy/geometry.js` (if helper functions needed)
- `api-proxy/detourPublisher.js`

**Tasks**

1. Capture off-route evidence points per route while latched:
   - timestamped vehicle coordinates
   - bounded memory window (e.g. last 15 minutes)
2. Determine detour entry/exit anchors on normal route:
   - nearest shape index/point when route leaves and rejoins.
3. Build skipped segment geometry:
   - polyline slice of normal route between entry/exit.
4. Build inferred detour polyline:
   - ordered/simplified evidence points
   - minimum point count and confidence score
5. Add confidence classification:
   - `low|medium|high` based on evidence density/duration/vehicle count.

**Acceptance criteria**

1. For active detours, detector can produce:
   - `skippedSegmentPolyline`
   - `inferredDetourPolyline`
2. Geometry is bounded (no unbounded point growth).
3. Geometry degrades gracefully when evidence is sparse.

---

## Chunk 3: Firestore Schema + Publisher Updates

**Files**

- `api-proxy/detourPublisher.js`
- `firestore.rules`
- `firestore.indexes.json`
- `README.md`

**Tasks**

1. Extend `activeDetours/{routeId}` schema with:
   - `state` (`active`, `rejoining`, `clear-pending`)
   - `entryPoint`, `exitPoint` (optional)
   - `skippedSegmentPolyline`
   - `inferredDetourPolyline`
   - `confidence`
   - `lastEvidenceAt`
2. Keep `detourHistory` events and add geometry snapshot references for detect/clear transitions.
3. Validate read rules still permit client reads.
4. Add any needed indexes for detour-history geometry/time filters.
5. Document schema and env knobs in `README.md`.
6. **Add geometry write throttle:**
   - The evidence window changes every tick (~30s) as new points arrive. The existing `LAST_SEEN_THROTTLE_MS` only guards `lastSeenAt`, not geometry payloads.
   - Add `DETOUR_GEOMETRY_WRITE_THROTTLE_MS` (default `120000`, 2 min). Only write geometry to Firestore when:
     - The simplified point count has changed by more than 5 points since last write, OR
     - More than `DETOUR_GEOMETRY_WRITE_THROTTLE_MS` has elapsed since the last geometry write, OR
     - The detour state has changed (e.g., `active` → `clear-pending`).
   - Without this, expect ~48 Firestore writes/hour per active detour of large polyline payloads.
7. **Expand `hydratePublisherState` to include geometry fields:**
   - The current hydration function (lines ~123-159) only maps `detectedAt`, `lastSeenAt`, `updatedAt`, `triggerVehicleId`, `vehicleCount`. After a server restart, `lastPublishedState` will lack geometry fields, causing incorrect change detection or incomplete `DETOUR_UPDATED` events.
   - Add all new fields (`state`, `skippedSegmentPolyline`, `inferredDetourPolyline`, `confidence`, `entryPoint`, `exitPoint`, `lastEvidenceAt`) to hydration.
8. **Expand `buildUpdatedEvent` change detection to include geometry:**
   - Currently (lines ~74-99) only checks `vehicleCount` and `triggerVehicleId`. It will never detect a geometry-only change and will not emit `DETOUR_UPDATED` for new/changed geometry.
   - Add `state`, `confidence`, and a geometry hash/point-count comparison to the `changedFields` logic.

**Acceptance criteria**

1. Firestore docs include geometry fields for active detours.
2. Existing clients still function if they only read old fields.
3. No write amplification spikes — geometry writes are throttled to max 1 per `DETOUR_GEOMETRY_WRITE_THROTTLE_MS` unless state changes.
4. After server restart, hydrated state includes geometry fields and change detection works correctly.
5. `DETOUR_UPDATED` events fire for geometry changes, not just vehicleCount changes.

---

## Chunk 4: API Diagnostics for Geometry

**Files**

- `api-proxy/index.js`
- optionally `api-proxy/detourPublisher.js`

**Tasks**

1. Add/extend diagnostics endpoint(s):
   - `GET /api/detour-status` includes geometry summary per active route
   - optional `GET /api/detour-debug?routeId=...` for raw evidence counts
2. Add validation and lightweight payload limits for debug responses.
3. Ensure auth/ratelimiting behavior matches existing API policy.
4. **Add ops-safe auth bypass for debug endpoints:**
   - `index.js` (line ~175) applies `authenticateApiRequest` to all `/api` routes (except `/health`). When `REQUIRE_FIREBASE_AUTH=true` in production, ops engineers cannot hit the debug endpoint without a client token.
   - Add a separate auth path for internal diagnostics: either an IP-allowlist, a server-only API key (`DETOUR_DEBUG_API_KEY`), or exempt `/api/detour-debug` from Firebase auth while keeping it behind rate limiting.
   - Do not expose raw evidence data on the unauthenticated path — only geometry summaries and health status.

**Acceptance criteria**

1. Ops can verify geometry production without opening the app.
2. Endpoint remains safe for production use (bounded payloads).
3. Debug endpoint is accessible to ops in production without requiring a Firebase client token.

---

## Chunk 5: Client Data Layer Support

**Files**

- `src/services/firebase/detourService.js`
- `src/context/TransitContext.js`
- `src/config/constants.js` (feature flags if needed)

**Tasks**

1. **Explicitly add geometry fields to `detourService.js` object construction:**
   - The current subscription (lines ~15-22) builds the client-side detour map with an explicit object literal — it does NOT spread `data`. New Firestore fields will be silently dropped unless each is explicitly added.
   - Add: `state`, `skippedSegmentPolyline`, `inferredDetourPolyline`, `confidence`, `entryPoint`, `exitPoint`, `lastEvidenceAt`.
   - Default each to `null` when absent for backwards compatibility.
   - **This must be the first task in Chunk 5** — all subsequent UI work depends on it.
   - Add a unit test confirming geometry fields are forwarded (not just that old fields still work).
2. Keep backwards compatibility when geometry fields are absent.
3. **Expose helpers in `TransitContext.js` with clear ownership:**
   - `getRouteDetour(routeId)` — returns the full detour object (including geometry) or `null`. Lives as a new context value derived from `activeDetours` state.
   - `isRouteDetouring(routeId)` — existing behavior preserved (boolean check). Remains unchanged.
   - Both helpers must derive from the same `activeDetours` state to stay in sync. Screen files should use `getRouteDetour` for geometry access and `isRouteDetouring` for the existing chip-dot conditional — never reconstruct detour state independently.

**Acceptance criteria**

1. No regressions in existing detour chip-dot behavior.
2. Geometry data is available to map screens on both native and web.
3. Unit test confirms all new Firestore fields are forwarded through `detourService.js`.
4. `getRouteDetour` and `isRouteDetouring` both derive from the same state — no split API surface.

---

## Chunk 6: Native Map Rendering (MapLibre)

**Files**

- `src/components/DetourOverlay.js` (NEW — native detour rendering component)
- `src/hooks/useDetourOverlays.js` (NEW — shared detour overlay logic)
- `src/screens/HomeScreen.js` (import only — no inline rendering)
- `src/components/RoutePolyline.js`

**Prerequisite: Extract detour rendering to avoid bloating HomeScreen files.**

`HomeScreen.js` is already **925 lines** (violates the 500-line CLAUDE.md limit). Do NOT add detour overlay rendering inline. Instead:

1. **Create `src/hooks/useDetourOverlays.js`** — shared hook consumed by both native and web:
   - Accepts `activeDetours` map from context.
   - Returns renderable detour data: `{ skippedSegments, inferredPaths, detourStates }`.
   - Handles confidence-based styling (opacity/width), feature flag gating, and memoization.
2. **Create `src/components/DetourOverlay.js`** — native rendering component:
   - Wraps `RoutePolyline` with detour-specific dash patterns, colors, z-order.
   - Accepts data from `useDetourOverlays` hook.

**Tasks**

1. Render skipped normal segment overlay:
   - red dashed, visible above normal route lines.
2. Render inferred detour path overlay:
   - orange/red dashed with confidence-based opacity/width.
3. Add z-order rules to keep buses/stops readable.
4. Add optional label/chip for state:
   - `Detour Active`, `Rejoining`, `Clear Pending`.
5. Gate with feature flag:
   - `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI=true`.
6. `HomeScreen.js` only adds `<DetourOverlay />` import + single JSX element — no inline rendering logic.

**Acceptance criteria**

1. Detour geometry overlays are visible and readable on native.
2. No frame drops from excessive rerenders when vehicle updates tick.
3. Existing route/trip overlays still render correctly.
4. `HomeScreen.js` line count does not increase by more than ~5 lines.

---

## Chunk 7: Web Map Rendering (Leaflet)

**Files**

- `src/components/DetourOverlay.web.js` (NEW — web detour rendering component)
- `src/components/WebMapView.js` (dash pattern support for `WebRoutePolyline`)
- `src/screens/HomeScreen.web.js` (import only — no inline rendering)

> **Note:** `RoutePolyline.web.js` is a **null stub** (returns `null`) that exists only for platform-parity checking. It is NOT the web rendering path. The real web polyline rendering lives in `WebMapView.js` via `WebRoutePolyline`, which is imported directly by `HomeScreen.web.js` (lines ~473-487). All detour overlay work targets `WebMapView.js` and the new `DetourOverlay.web.js`, NOT `RoutePolyline.web.js`.

**Tasks**

1. **Add dash pattern support to `WebRoutePolyline` in `WebMapView.js`:**
   - Extend `WebRoutePolyline` (or `LeafletPolyline`) to accept `dashArray` and `dashOffset` props for detour styling.
2. **Create `src/components/DetourOverlay.web.js`** — web rendering counterpart:
   - Uses `WebRoutePolyline`/`LeafletPolyline` from `WebMapView.js` with detour dash patterns.
   - Consumes data from `useDetourOverlays` hook (shared with native in Chunk 6).
   - `HomeScreen.web.js` (already **1313 lines**) only adds import + single JSX element.
3. Render skipped segment and inferred detour overlays with same semantics as native.
4. Ensure hover/selection styles still work with detour overlays.
5. Add confidence legend/tooltip on web (lightweight).

**Acceptance criteria**

1. Web and native show equivalent detour geometry intent.
2. No pointer-event conflicts with existing route hover behavior.
3. `HomeScreen.web.js` line count does not increase by more than ~5 lines.

---

## Chunk 8: Validation + Test Coverage

Tests are split across sprints so each chunk ships with its own test coverage.

**Files**

- `api-proxy/__tests__/detourDetector.test.js`
- `api-proxy/__tests__/detourPublisher.test.js`
- `api-proxy/__tests__/index.routes.test.js`
- `src/__tests__/detourService.test.js`
- `src/__tests__/...` (new detour mapping/render tests)

**8a — Sprint A (ships with Chunk 1):**

1. Detector tests for:
   - mid-detour route rejoin does not clear early
   - clear after grace window and sustained on-route
   - hysteresis threshold behavior
   - `removeVehicleFromDetour` transitions to `clear-pending` instead of deleting
   - `processVehicles` returns `clear-pending` routes
   - worker does not emit false `detour cleared` during grace period

**8b — Sprint B (ships with Chunks 2-4):**

2. Publisher tests for:
   - geometry field persistence to Firestore
   - geometry write throttle (no writes within throttle window unless state changes)
   - `hydratePublisherState` round-trips all geometry fields
   - `buildUpdatedEvent` detects geometry-only changes
3. API tests for debug/status geometry output.
4. API test for debug endpoint auth bypass (ops access without Firebase token).

**8c — Sprint C (ships with Chunks 5-7):**

5. Client tests for:
   - `detourService.js` forwards all geometry fields (not silently dropped)
   - `getRouteDetour` returns full object, `isRouteDetouring` returns boolean
   - geometry mapping fallback when fields are absent
6. `DetourOverlay` / `DetourOverlay.web.js` render tests.

**8d — Sprint D (final hardening):**

7. Screenshot/manual QA checklist for native + web overlays.
8. End-to-end integration tests across detector → publisher → client → UI.

**Acceptance criteria**

1. Tests cover false-clear regression scenario from 8A/8B.
2. CI passes with no net loss in existing coverage areas.
3. Each sprint's code ships with its own tests — no deferred coverage gaps.

---

## Chunk 9: Rollout Strategy

**Tasks**

1. Deploy backend with geometry writing enabled but UI hidden (feature flag off).
2. Monitor for 24-48 hours:
   - clear flapping rate
   - active duration distributions
   - publish failures
3. Enable UI for internal testing users first.
4. Full rollout after confirming stable behavior on real detours.

**Rollback plan**

1. Toggle `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI=false` to hide overlays.
2. Keep detection/hysteresis running.
3. If needed, disable geometry writes while preserving active detour state docs.

---

## Proposed Environment Variables

1. `DETOUR_ON_ROUTE_CLEAR_THRESHOLD_METERS=40`
2. `DETOUR_CLEAR_GRACE_MS=600000`
3. `DETOUR_MIN_ACTIVE_MS=300000`
4. `DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE=6`
5. `DETOUR_GEOMETRY_WRITE_THROTTLE_MS=120000`
6. `DETOUR_DEBUG_API_KEY=<server-only key for ops debug endpoint>`
7. `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI=true`

---

## Work Breakdown (Manageable Chunks)

1. **Sprint A (Backend Stability)**
   - Chunk 1 + Chunk 8a (detector hysteresis tests only)
2. **Sprint B (Geometry Data Production)**
   - Chunk 2 + Chunk 3 + Chunk 4 + Chunk 8b (geometry publisher tests + API tests)
   - _Tests for geometry writing and diagnostics ship with the geometry code, not deferred to Sprint D._
3. **Sprint C (Client Rendering)**
   - Chunk 5 + Chunk 6 + Chunk 7 + Chunk 8c (client mapping + render tests)
4. **Sprint D (Rollout & Hardening)**
   - Chunk 8d (screenshot/manual QA checklist, integration tests) + Chunk 9

---

## Definition of Done

1. Detours do not clear prematurely during expected rejoin behavior.
2. Active detours publish stable geometry fields in Firestore.
3. Native and web maps both show skipped segment + inferred detour path.
4. Health endpoints prove detector operational state even with zero active detours.
5. Regression tests lock in behavior for the 8A/8B false-clear scenario.

