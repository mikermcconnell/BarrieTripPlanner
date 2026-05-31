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
- `docs/detour-ground-truth/` contains operator-supplied known detour cases used by `scripts/validate-detour-ground-truth.js`.
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
1. A server-side worker processes GTFS-RT vehicle positions on each detection tick. The low-cost production baseline is one externally scheduled tick per minute, with burst sampling disabled. Optional production offset sampling adds a Cloud Task-delayed second tick about 30 seconds later without holding the Cloud Run request open.
2. Each vehicle's GPS is compared against its route's published shape
3. When two buses on the same route produce confirmed off-route evidence, a detour is confirmed. The three required off-route pings can be accumulated across matching trips/vehicles in the same corridor; they do not all have to come from one trip. Short-deviation evidence is captured as soon as a vehicle produces one off-route point, but it is not rider-facing until the matching corridor has at least three off-route pings and two unique same-route trips/vehicles. On 30- to 60-minute headways, the detector can remember the first bus as candidate evidence and confirm when the next unique bus adds enough matching evidence.
4. When that confirmed detour has a real closed segment, the backend can project the same physical detour event onto sibling route variants/directions that share the closure
5. Detour geometry is published to Firestore. Rider-facing detour paths are shown after either a same-bus GPS trace confirms the bus left the regular route, travelled off-route, and returned, or two distinct buses corroborate the same detour corridor.
6. The app subscribes in real time and shows the detour on the main map

Published detour paths are also corrected by GPS, not by public notices. If an already-published path has no current bus on it and a different same-route corridor inside the same affected regular-route window meets the normal publish rule — at least three off-route pings and two unique same-route buses/trips — the detector promotes the newer GPS-proven path and marks the old runtime segment as superseded. The publisher then skips trusted-path preservation so the stale likely path is not reintroduced over the newer GPS evidence.

---

## 2. Architecture

```
GTFS-RT Feed (vehicle positions)
        │
        ▼
┌─────────────────────┐
│  detourWorker.js     │  Runs either as a 30s interval loop or a single externally triggered tick
│  (api-proxy backend) │
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

The detector uses four backend memory/diagnostic layers. The client app does not feed map-icon movement back into detection; app location updates are display-only. GTFS-RT vehicle positions remain the detector evidence source.

1. **Vehicle trace memory** — keeps the last 15-20 minutes of per-vehicle GPS evidence for path confidence and same-bus before/off-route/after proof.
2. **Candidate detour memory** — keeps compact 2-3 hour, headway-aware summaries of unconfirmed off-route candidates. This lets one bus create candidate evidence and a second unique bus confirm it 30-60 minutes later. Short-detour candidates can start from a single off-route GPS point; they are not rider-facing until the same corridor has the required three off-route pings and corroboration from a second unique same-route trip/vehicle.
3. **Active detour memory** — keeps confirmed detours in runtime state and Firestore `activeDetours` until normal-route GPS proof clears them. Clearing is not a fixed "N pings anywhere on route" rule; the same bus must prove regular-route traversal through the affected segment, or two unique same-route trips/vehicles must collectively prove normal service through that same affected segment. On restart, runtime state is loaded first; if it is empty, active Firestore snapshots are hydrated so the first post-restart tick does not delete a still-active detour.
4. **Vehicle projection diagnostics** — stores the latest per-vehicle route projection in runtime state, including distance from shape, thresholds, classification (`on-route-clear`, `deadband`, `off-route`, or `no-projection`), shape ID, trip ID, and timestamp. This is diagnostic evidence only; it explains why a vehicle was or was not treated as off route.

### Firestore Document Schema

#### `activeDetours` collection

One document per active route, keyed by route ID (e.g., `"8A"`, `"1"`).
If a route has multiple independent detour sections at the same time, they are published inside one route document via `segments[]`.

| Field | Type | Description |
|---|---|---|
| `routeId` | String | Route identifier (also the document ID) |
| `shapeId` | String \| null | Baseline GTFS shape used for the primary published segment |
| `title` / `description` / `locationText` | String \| null | Optional rider-facing or operations text |
| `detectedAt` | Timestamp | When the detour was first detected |
| `lastSeenAt` | Timestamp | When off-route evidence was last observed (throttled, updates every 5min) |
| `updatedAt` | Timestamp | When the Firestore document was last written |
| `triggerVehicleId` | String \| null | Vehicle that triggered initial detection |
| `vehicleCount` | Number | Unique vehicles that have contributed evidence to this detour. This is the backward-compatible field used by rider visibility rules. |
| `uniqueVehicleCount` | Number | Same evidence count as `vehicleCount`, published explicitly for newer clients and operations review. |
| `currentVehicleCount` | Number | Vehicles currently observed off-route on this detour right now. Can be `0` while the detour remains active waiting for another bus or a normal-route clear. |
| `riderVisible` | Boolean | Whether the client should show this active backend detour to riders. Confirmed detours stay visible until normal-route GPS clear proof exists unless the backend suppresses them for safety reasons such as insufficient or invalid geometry. |
| `riderVisibilityReason` | String \| null | Why the current rider visibility decision was made, for example `gps-clear-required`, `current-detour-vehicle`, `insufficient-geometry`, `suppressed-invalid-geometry`, or `zero-confirmed-vehicle-count`. |
| `staleForReview` | Boolean | Operations-review marker. This does not by itself mean the record should be hidden or cleared. |
| `state` | String | `"active"` or `"clear-pending"` (documents are deleted when cleared, not updated to `"cleared"`) |
| `clearReason` | String \| null | Why a detour is moving toward clear, for example `"normal-route-observed"`. |
| `isPersistent` | Boolean | Whether the published route snapshot is currently backed by a learned persistent detour record |
| `handoffSourceRouteId` | String \| null | Source route when this document is a projected sibling-route view of the same physical detour |
| `detourEventId` | String \| null | Route/segment-specific physical event ID used for geometry continuity. |
| `sharedDetourEventId` | String \| null | Backend-owned event-card grouping ID when several route documents describe the same physical closure. |
| `sharedRouteIds` | String[] | Active routes that belong to the same rider-facing detour event card. |
| `eventPrimaryRouteId` | String \| null | Route whose geometry should represent the shared event for card tap/focus behavior. Route overlays remain separate. |
| `eventRouteCount` | Number \| null | Count of active routes in the shared detour event. |
| `eventLocationLabel` | String \| null | Backend-generated location label for the shared event card, usually from road names. |
| `eventConfidence` | String \| null | Highest confidence among routes in the shared event. |
| `segments` | Array | Renderable detour sections for this route. Each segment can have its own entry/exit points and skipped/inferred geometry. |
| `skippedSegmentPolyline` | String \| null | Encoded polyline of the route segment being skipped |
| `inferredDetourPolyline` | String \| null | Encoded polyline of the inferred detour path |
| `canShowDetourPath` | Boolean | Whether the inferred path is trusted enough for rider-facing rendering and road matching. Requires entry and exit boundary anchors plus either a same-vehicle trace or two distinct buses on the same detour corridor. If this is true and no road-matched `likelyDetourPolyline` exists, the client may render `inferredDetourPolyline` as the alternate path. |
| `likelyDetourPolyline` | String \| null | Optional road-matched path shown to riders as the likely detour path |
| `likelyDetourRoadNames` | String[] | Optional road names from map matching |
| `roadMatchConfidence` | String \| null | `"low"`, `"medium"`, or `"high"` from the road matcher |
| `roadMatchRawConfidence` | Number \| null | Raw matcher confidence when available |
| `roadMatchSource` | String \| null | Source such as `osrm-match` or `osrm-route` |
| `detourPathLabel` | String | Rider-facing label, currently `"Likely detour path"` |
| `entryPoint` | `{ lat, lon }` \| null | Where vehicles leave the published route |
| `exitPoint` | `{ lat, lon }` \| null | Where vehicles rejoin the published route |
| `entryStopId` / `exitStopId` | String \| null | Stop anchors for the primary segment when known |
| `skippedStopIds` / `skippedStopCodes` / `skippedStops` | Array | Stops not served by this detoured route for the primary segment |
| `detourPathServedStopIds` / `detourPathServedStopCodes` / `detourPathServedStops` | Array | Stops that were initially inside the skipped route section but are passed by the final rider-facing detour path, so they should not be shown as skipped/closed for detour purposes |
| `affectedStopIds` / `affectedStopCodes` / `affectedStops` | Array | Broader affected-stop data for the primary segment |
| `confidence` | String \| null | `"low"`, `"medium"`, or `"high"` |
| `evidencePointCount` | Number \| null | GPS evidence points collected |
| `lastEvidenceAt` | Timestamp \| null | Backward-compatible evidence timestamp, usually the geometry evidence time |
| `latestGpsEvidenceAt` | Timestamp \| null | Newest actual off-route GPS evidence used by the detector lifecycle. Use this for "is there fresh GPS evidence?" questions. |
| `geometryLastEvidenceAt` | Timestamp \| null | Newest GPS evidence that contributed to the currently displayed geometry. This can be older than `latestGpsEvidenceAt` when the trusted geometry is reused. |

`segments[]` is the source of truth for multi-section detours. The top-level geometry fields (`entryPoint`, `exitPoint`, `skippedSegmentPolyline`, `inferredDetourPolyline`, `likelyDetourPolyline`) are still published for backward compatibility and mirror the route's primary segment.

Key `segments[]` fields mirror the top-level geometry and stop-impact fields: `shapeId`, `skippedSegmentPolyline`, `inferredDetourPolyline`, `likelyDetourPolyline`, `canShowDetourPath`, `entryPoint`, `exitPoint`, `entryStopId`, `exitStopId`, `skippedStops`, `affectedStops`, `confidence`, `evidencePointCount`, `lastEvidenceAt`, `detourEventId`, and shared-event metadata.

Stop impacts inside `segments[]` are route-scoped. A stop in `skippedStops` means "not served by this detoured route," not necessarily "closed to every route." Skipped/affected stop objects may include `routeId`, `affectedRouteIds`, `servedRouteIds`, `allServingRouteIds`, and `impactScope: "partial"` when another route still serves the same stop. The rider UI should use wording such as "Stop 192 is not served by Route 11" or "Still served by Route 8" instead of global "stop closed" copy unless all routes serving that stop are actually unavailable.

The final rider-facing detour path is also service evidence. If a stop is close to the published `likelyDetourPolyline` or trusted renderable `inferredDetourPolyline`, and is not just at the entry/exit endpoint buffer, the backend removes it from `skippedStops` and records it under `detourPathServedStops`. The frontend applies the same safeguard before drawing closed-stop markers so stale explicit stop-impact data cannot label a stop closed when the bus path passes it.

Shared detour event fields are also written onto individual `segments[]` when geometry is available. The client groups event cards by `sharedDetourEventId` first, then falls back to `detourEventId` and geometry/title matching. This combines one physical closure into one event card while keeping each route's map overlay and route geometry separate. Routes with no physical closure geometry are not grouped only because they share a route family.

When a newer GPS-confirmed alternate corridor supersedes a previously published path, the replacement geometry may carry `gpsSupersedesPreviousPath: true` internally through the detector/publisher pipeline. This flag is an operations/debug guard that prevents preservation of the previous road-matched path. It does not lower the publish threshold: the alternate still needs the normal same-route two-vehicle/three-ping proof.

Self-loop segments are not valid closures when they enter and exit at the same stop and only that stop is affected. Segments with no entry stop, no exit stop, no skipped route segment, and explicit empty stop-impact fields are also not valid rider-facing closures. Long alternate paths anchored to a tiny closed span with no skipped segment are also suppressed because they usually indicate the wrong rejoin point. The backend filters these cases before publishing and before preserving a previously trusted likely path.

For loop routes or routes that pass near the same downtown area more than once, exit-anchor selection is route-agnostic and progress-aware. When multiple return-to-route GPS candidates exist, geometry prefers the downstream rejoin that creates a plausible closed route span instead of a later candidate near the original entry point. If multiple exit candidates still only produce a long likely path with a tiny/no closed span, that geometry is suppressed until a credible rejoin is available.

Geometryless or unsafe detours are backend-only. If the detector has an active record but cannot publish trustworthy rider geometry, the backend keeps monitoring and writes `riderVisible: false`, usually with `riderVisibilityReason: "insufficient-geometry"` or `"suppressed-invalid-geometry"`. The client must not show a detour alert, route detour card, or overlay for that record. If later GPS evidence creates a trusted skipped segment or likely path, the backend can make it rider-visible. If normal service is proven, the backend can clear it.

Documents are created on detection, updated each publish cycle, and deleted when the final active segment clears. The publisher only deletes an absent active route after the previous snapshot has `clearReason: "normal-route-observed"`; stale age, missing current vehicles, or route-family activity are not deletion proof.

### Clearing rule gotcha

Geometry-backed detours clear from route-progress proof, not from a fixed GPS count by itself. One on-route GPS point is not enough. The primary path is same-bus proof: one bus needs at least two useful on-route GPS samples far enough apart to show it travelled through the affected regular-route segment. The fallback path is collective proof: two or more unique same-route trips/vehicles can clear when their normal-route samples collectively cover the affected segment window and no newer off-route evidence has returned. By default, both paths require the observed normal-route span to overlap at least 60% of that affected segment and show enough movement through it (up to 100m; shorter segments use their 60% span). Scheduled mode's default 4 on-route samples and interval mode's default 6 are conservative sampling settings, but traversal proof is the gate. After proof, the segment enters `clear-pending` and is deleted on a following tick if no off-route vehicle returns.

#### `persistentDetoursAuto` collection

One document per learned long-running route detour. These records let the backend survive deploys/restarts without forgetting the active closure.

Key fields:
- `fingerprint` — stable route/shape/entry/exit signature for the learned closure
- `sharedGeometryFingerprint` — optional pointer to route-agnostic learned geometry in `persistentDetourGeometriesAuto`
- `geometry` — latest route-specific renderable detour geometry; if this is incomplete, the route can use trusted global geometry after the route itself has already met publish rules
- `detourZone` — route progress window used for GPS-based clearing
- `evidence` — learned GPS points, confidence points, and entry/exit boundary candidates retained beyond the short live evidence window
- `latestGpsEvidenceAt` / `lastEvidenceAt` — last actual GPS evidence time; this does not advance just because the record was refreshed
- `geometryLastEvidenceAt` — latest GPS evidence behind the stored geometry
- `recordUpdatedAt` — when the persistence record was last written

#### `persistentDetourGeometriesAuto` collection

One document per learned physical detour geometry, keyed by `sharedGeometryFingerprint`. This is global geometry memory, not a shortcut for detection.

Rules:
- A route still has to satisfy the normal publish rule before it becomes rider-facing: three matching off-route pings plus two unique same-route trip/vehicle signatures.
- Normal route-family vehicle presence is not detour proof and must not make a zero-confirmed or geometryless record public.
- Global learned geometry may improve rendering or restart recovery only for an already-published route detour, or for a route-specific persistent record that was previously published.
- The global record stores trusted geometry, learned GPS evidence, `routeIds`, `latestGpsEvidenceAt`, `geometryLastEvidenceAt`, and `recordUpdatedAt`.
- Clearing remains route-specific and GPS-proof based. Removing one route's persistent record removes that route from the global geometry record but does not automatically clear other routes.

#### `detourHistory` collection

One document per event. Auto-generated IDs: `{timestamp}-{routeId}-{eventType}-{random}`.

Main event types:
- **`DETOUR_DETECTED`** — `routeId`, `occurredAt`, `detectedAt`, `lastSeenAt`, `triggerVehicleId`, `vehicleCount`, `uniqueVehicleCount`, `currentVehicleCount`, `confidence`, `evidencePointCount`, `lastEvidenceAt`, `shapeId`, `entryPoint`, `exitPoint`, `skippedSegmentPolyline`, `inferredDetourPolyline`, `segmentCount`, `source`
- **`DETOUR_UPDATED`** — `routeId`, `occurredAt`, `detectedAt`, `lastSeenAt`, `triggerVehicleId`, `previousTriggerVehicleId`, `vehicleCount`, `previousVehicleCount`, `uniqueVehicleCount`, `currentVehicleCount`, `clearReason`, `changedFields[]`, `source`
- **`DETOUR_CLEARED`** — `routeId`, `occurredAt`, `detectedAt`, `clearedAt`, `durationMs`, `triggerVehicleId`, `previousVehicleCount`, `uniqueVehicleCount`, `currentVehicleCount`, `clearReason`, `lastEvidenceAt`, `shapeId`, `entryPoint`, `exitPoint`, `skippedSegmentPolyline`, `inferredDetourPolyline`, `segmentCount`, `source`
- **`DETOUR_AUTO_CLEARED_STALE`** — legacy event type from earlier stale-safety behavior. Current active detours clear from normal-route GPS evidence, not elapsed time.

All history events include `source: "detour-worker-v2"`.

---

## 3. Current State (as of 2026-05-27)

### What riders see today
The client now has the main rider-facing pieces in code:
- `DetourAlertStrip` on the map screen
- `DetourDetailsSheet` for affected stops and detour timing
- `DetourOverlay` and detour-focused map mode

The rider feature is still controlled by `EXPO_PUBLIC_ENABLE_AUTO_DETOURS`.

Note: Firestore is the source of truth for active detours. The client should render what the backend publishes rather than applying its own freshness pruning rules. The client must not use app icon movement as detector evidence; only backend GTFS-RT vehicle samples should create, confirm, or clear detours. If Firestore is unavailable, the app should fail quiet for auto-detours rather than running an on-device detector.
The client already renders multi-segment detours from `segments[]`; the recent backend work makes same-route independent detours publish as separate sections instead of one merged lifecycle.

### What's built (backend — complete)
- Detection worker supports a legacy 30s interval loop, a low-cost manual/scheduled single-tick mode, and optional Cloud Tasks 30-second offset sampling
- Detection algorithm with consecutive readings, zone-aware clearing (separate on-route threshold within detour zone), hysteresis (buffer between detection and clearing thresholds to prevent flickering)
- **Recurring short-deviation detection** — repeated short off-route streaks on the same route segment can publish a detour even when no single bus stays off-route long enough to hit the normal consecutive-reading threshold. Candidate evidence is captured on the first off-route point, then requires at least three matching off-route pings and two unique same-route trips/vehicles before it becomes rider-facing. This is meant for short jogs anywhere in the network, not route-specific patches.
- **Route-family geometry reconciliation/projection** — sibling routes can share a confirmed physical closure segment once one branch has enough evidence and reliable entry/exit boundaries. One bus on each branch still does not create alerts for both branches, and point-only short deviations remain route-specific.
- **Shared detour event cards** — separate route documents that describe the same physical closure now receive a shared backend event ID. The rider event card can show multiple affected routes together, while map lines and closed/open route geometry stay route-specific.
- **Service-hours-aware retention** — outside service hours (1 AM - 5 AM EST), detection freezes. End-of-service no longer clears active detours; current vehicles are dropped and detours stay visible until an in-service bus adds detour evidence or proves normal routing.
- **GPS-evidence clearing** — active geometry-backed detours are retained until normal-route GPS proves service through the affected detour segment. The primary proof is same-bus traversal; the fallback proof is two or more unique same-route trips/vehicles whose on-route samples collectively cover the affected segment window after the latest off-route evidence. By default, proof must overlap at least 60% of the affected segment and show enough route-progress movement through it (up to 100m; shorter segments use their 60% span). No-bus/currently-zero-vehicle states, evidence age, route-family activity, same-route reporting away from the affected segment, and a single on-route GPS point are not enough to clear or hide a confirmed detour. Once traversal proof exists, short detour segments can move to clearing without waiting for the fixed on-route tick threshold. If an active record has no usable closure geometry or clear window, the automated detector keeps monitoring; it does not auto-clear until a clear window is recovered and GPS-traversed, or an operator/admin explicitly clears it.
- **Rider visibility** — confirmed detours stay rider-visible until GPS clear proof exists. The app must not hide a detour from age, `staleForReview`, no-current-vehicle state, or route-family activity. It hides only when the backend explicitly publishes `riderVisible: false` for safety reasons such as zero confirmed evidence, insufficient geometry, or invalid geometry.
- **Headway-aware candidate confirmation** — unconfirmed off-route evidence can be retained long enough for the next unique bus on 30- to 60-minute service to corroborate the same detour candidate.
- **Path-confidence gate** — geometry-backed detour alerts can remain active while the map hides the alternate detour path until the backend sees trusted path evidence: either same-bus before/off-route/after evidence or two distinct buses with entry/exit anchors on the same corridor. When `canShowDetourPath=true`, the app can draw the trusted inferred path even before road matching produces a `likelyDetourPolyline`. If there is no trustworthy skipped segment or path, the whole detour remains backend-only.
- **Continuous trace path building** — representative detour paths are built from continuous vehicle traces, not every point ever seen from the same bus. The backend splits candidates on trip changes, large time gaps, or clear route-progress reversals so repeated trips are not stitched into a back-and-forth line.
- **Non-closure segment rejection** — geometry segments are rejected when the inferred closure enters and exits at the same stop with only that stop affected, or when the segment has no entry stop, no exit stop, no skipped route segment, and explicitly no skipped/affected stops. This prevents route-fallback turnarounds, short spurs, or unanchored road-matched paths from being published as detours when no real closed route segment was found.
- **Geometryless rider suppression** — active records without trustworthy geometry stay in Firestore for monitoring, but are hidden from rider UI until the backend can explain the detour safely.
- **Segment-level detour lifecycle under one route document** — same-route detours separated by normal on-route travel are now tracked as separate internal segments with independent clear-pending and clearing behavior.
- Firestore publishing (active detours + geometry) with write throttling
- Detour history event logging (30-day retention)
- Debug endpoints: `/api/detour-status`, `/api/detour-debug`, `/api/detour-logs`
- Targeted backend regression coverage across detector, geometry, publisher, and integration suites

### What's built (frontend — built, pending launch validation)
- `DetourOverlay` component (native + web) — draws skipped segment + inferred path on the map
- `useDetourOverlays` hook — transforms Firestore data for map rendering
- `detourService.js` — Firestore real-time listener for activeDetours
- Wired into TransitContext and HomeScreen (both platforms)

### Most recent findings
- **Fixed 2026-03-15: same-route detours were merging into one giant lifecycle** — The detector used to keep one active lifecycle per route, so two separate detours on the same route could collapse into one record and then clear when the bus served normal stops between them. The detector now keeps segment-level state internally and publishes both sections in one route document.
- **Fixed 2026-03-20: noisy multi-vehicle detour geometry could render overlapping reroute branches** — The geometry builder used to simplify one timestamp-ordered list of all evidence points, which could weave together multiple buses and draw a messy inferred path. The backend now scores per-vehicle trajectories and publishes one representative reroute line so riders see a cleaner detour overlay.
- **Fixed 2026-05-26: repeated downtown detour trips could render as a zigzag path** — Representative path selection now splits the same vehicle into continuous traces by trip, time gap, and route-progress direction, and exit-anchor selection avoids far stale candidates when a nearer candidate matches the selected trace.
- **Fixed 2026-05-04: very short recurring detours could be missed** — The detector used to require one vehicle to stay off route for the full consecutive-reading window. It now also aggregates repeated short deviations across vehicles/trips within the same route segment.
- **Fixed 2026-05-12: sparse evidence could create a misleading likely path** — Geometry now requires both entry and exit boundary anchors for skipped-route geometry. The path can publish once one bus provides a full trace or two distinct buses corroborate the same corridor.
- **Updated 2026-05-20: physical detour events can project to sibling route variants** — A confirmed closure segment on one branch can now publish projected geometry for a sibling branch, so paired variants such as 12A/12B do not require separate hand patches when they share the same closure. Point-only short deviations still stay route-specific.
- **Updated 2026-05-20: long-running detours retain learned GPS evidence** — Persistent detours now store learned evidence points and boundary candidates separately from the short live window, so trusted paths can survive deploys/restarts. `lastEvidenceAt` only moves when new GPS evidence exists.
- **Updated 2026-05-24: low-frequency confirmation uses backend memory instead of burst pulses** — Scheduled production runs should collect one GTFS-RT snapshot per minute. The detector keeps short vehicle traces, longer headway-aware candidate summaries, and active Firestore snapshots so 30- to 60-minute routes can confirm and retain detours without multiple pulses inside a request.
- **Fixed 2026-05-24: same-stop turnaround geometry could publish as a false detour** — The geometry and publisher trust gates now drop segments where `entryStopId === exitStopId` and the only affected/skipped stop is that same stop. Previously, those segments could preserve a likely path that went out, turned around, and returned without identifying a closed road segment.
- **Fixed 2026-05-25: unanchored no-stop geometry could publish as a false detour** — The geometry and publisher trust gates now drop segments that have no entry stop, no exit stop, no skipped route segment, and explicitly empty skipped/affected stop fields. Valid sibling or multi-segment detours can still publish their anchored sections; only the unanchored no-stop section is removed.
- **Fixed 2026-05-25: Route 101-style tiny-span out-and-back paths could persist** — The publisher trust gate now rejects and does not preserve segments where the inferred/likely path is long but the identified closed span is tiny and has no skipped route segment. This prevents old Firestore geometry from keeping a looped out-and-back path after the geometry builder suppresses it.
- **Updated 2026-05-25: stale active detours can be hidden from rider UI without being backend-cleared** — The publisher now writes `riderVisible`, `riderVisibilityReason`, and stale review metadata. The app filters `riderVisible: false`, while the backend still waits for normal-route GPS proof before clearing.
- **Fixed 2026-05-25: loop-route rejoin selection could choose the wrong return point** — Exit-anchor selection now prefers a downstream, progress-plausible rejoin when multiple return-to-route GPS candidates exist. This is route-agnostic and prevents long detour paths from being anchored back near the original entry point with no meaningful closed segment.
- **Fixed 2026-05-25: loop-route trip rollover could clear Route 100 too early** — When a bus changes GTFS trip at a terminal/start-end stop, the detector no longer uses that same bus's next trip as normal-route clear proof for the previous detour segment. This prevents Downtown Hub loop routes from treating "next trip started" as "the detour ended."
- **Updated 2026-05-25: shared event cards group the same physical closure across routes** — The publisher now writes `sharedDetourEventId`, `sharedRouteIds`, `eventPrimaryRouteId`, and event label/confidence fields. The app uses those fields to show one event card for aligned route detours, while retaining separate map overlays and route-specific `detourEventId` values.
- **Corrected 2026-05-26: stale visibility is not clear proof** — A same-day attempt to hide stale zero-current records from client metadata alone incorrectly hid valid Route 12A/12B Hooper detours. The app now treats `staleForReview` as review metadata, not a hide rule. Planned/manual notices may help rider messaging and operations review, but they do not detect or clear a detour. Detection and clearing remain GPS-evidence decisions.
- **Fixed 2026-05-26: trusted inferred paths could be hidden when road matching was absent** — The map now renders `inferredDetourPolyline` when `canShowDetourPath=true` and no `likelyDetourPolyline` is available, while still hiding untrusted raw inferred geometry.
- **Corrected 2026-05-29: elapsed time is not a rider hide rule or clear proof** — Same-route buses reporting after a long evidence gap must not clear or hide a valid geometry-backed detour unless their GPS proves normal-route traversal through the affected segment. Geometryless or invalid records can be hidden from riders for safety and kept for monitoring; if no affected-segment clear window exists, generic same-route normal service does not auto-clear the record. The backend waits for a recovered clear window plus GPS traversal, or an explicit operator/admin clear.
- **Updated 2026-05-24: true 30-second sampling uses Cloud Tasks** — Live GTFS-RT polling showed fresh vehicle snapshots roughly every 30 seconds. The scheduled production path can now keep the one-minute Cloud Scheduler job, enqueue a delayed Cloud Task for the half-minute sample, and use a Firestore distributed lock so overlapping Cloud Run instances do not double-process the same tick.
- **Updated 2026-05-24: short-detour candidates are captured on first off-route point** — The recurring short-deviation path no longer waits for the same bus to return on-route before recording candidate evidence. This improves detection for brief diversions that may only be visible for one GTFS-RT sample. Runtime state also stores the latest per-vehicle projection diagnostic so missed cases can be explained without guessing.
- **Still in validation: affected-stop accuracy on route variants and opposite directions** — Geometry and rendering are segment-aware and sibling projection is now supported, but the public-launch validation pass still needs to confirm the skipped-stop derivation is correct across route families such as 8A/8B, 12A/12B, and both directions of travel.

### What's missing to go public

**Deploy steps:**
1. **Turn on the rider feature flag** — Set `EXPO_PUBLIC_ENABLE_AUTO_DETOURS` to `true`.
2. **Pass rollout health checks** — Confirm `/api/detour-rollout-health` reports `launchReadiness.status` as `pilot_ready` or `pilot_ready_with_cautions`. Treat baseline divergence as a launch blocker and review stale warnings or any non-GPS clear history before enabling the rider UI.

**Build work:**
3. Validate the current alert strip, map overlay, details sheet, and geometryless-hidden behavior together in production-like builds.
4. Confirm the affected-stop derivation is accurate across route variants and opposite directions.

**Security / operations:**
5. Keep route-specific `/api/detour-debug?routeId=...` disabled for non-admin production callers unless a trusted operator explicitly enables `DETOUR_DEBUG_ROUTE_DETAILS_ENABLED=true`.
6. Keep baseline mutation endpoints restricted to detour admins. Use scheduler auth or a detour-admin token for `POST /api/detour-run-once`.
7. Monitor short-lived detections, repeated clears, stale warnings, any non-GPS clear history, and publish failures in rollout health during the first live validation window.

**Should-haves:**
7. **Push notifications** — Alert riders who have favorited a route when a new detour is detected.
8. **Accessibility** — Screen reader announcements for detour events.

### Known Issues (Fixed)
- **Flapping detours** (Fixed 2026-02-27) — Single-vehicle GPS noise caused rapid detect/clear cycles. Fixed by the configurable `CONSECUTIVE_READINGS_REQUIRED` guard. The current default is 3 off-route readings, configurable via `DETOUR_CONSECUTIVE_READINGS`.
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
- [ ] Detours without trustworthy rider geometry stay backend-only with `riderVisible=false`
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

Key env vars for the detour system, set in the backend environment or `.env` locally.

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
| `DETOUR_CONSECUTIVE_READINGS` | `3` | Off-route ticks before confirming. At 60-second scheduled sampling this is about 3min; with 30-second offset sampling this is about 90 seconds. |
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
| `DETOUR_NO_VEHICLE_TIMEOUT_MS` | `1800000` | Advisory no-current-vehicle timeout; absence alone does not clear or hide a confirmed detour |
| `DETOUR_ROUTE_OVERRIDES_JSON` | unset | Optional per-route detector tuning. Use sparingly; prefer route-agnostic fixes. |
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
| — | — | There is intentionally no time-based clear or rider hide rule for active detector-owned detours. They are retained and, when confirmed with safe geometry, remain visible so later buses can add evidence or prove normal routing. |

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
| `DETOUR_OFFSET_SAMPLING_ENABLED` | `false` | Enables Cloud Tasks delayed half-minute sampling after the primary scheduled tick. |
| `DETOUR_OFFSET_SAMPLE_DELAY_SECONDS` | `30` | Delay before the offset sample runs. |
| `DETOUR_DISTRIBUTED_LOCK_ENABLED` | `false` | Uses a Firestore lock to prevent overlapping scheduled/task/manual runs across Cloud Run instances. |
| `DETOUR_OFFSET_TASK_QUEUE` | `bttp-detour-offset-samples` | Cloud Tasks queue used for delayed offset samples. |
| `DETOUR_OFFSET_TASK_LOCATION` | `us-central1` | Cloud Tasks queue location. |
| `DETOUR_OFFSET_TASK_TARGET_URL` | — | Absolute `/api/detour-run-once` URL that Cloud Tasks should call. |
| `DETOUR_HISTORY_ENABLED` | `true` | Enable detour event history in Firestore |
| `DETOUR_HISTORY_RETENTION_DAYS` | `30` | Days to retain history (<=0 disables pruning) |
| `DETOUR_FALSE_POSITIVE_WINDOW_MS` | `604800000` | Rollout-health window for false-positive rate checks (7 days) |

### Client Feature Flags
| Variable | Default | Description |
|---|---|---|
| `EXPO_PUBLIC_ENABLE_AUTO_DETOURS` | `false` | Enable the rider-facing auto detour feature |
| `EXPO_PUBLIC_ACTIVE_DETOURS_COLLECTION` | `activeDetoursV2` in the lab branch | Firestore collection the client subscribes to for active detours. Use `activeDetoursV2` for isolated V2 lab testing so the app does not hydrate V1 records. |
| `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI` | `false` | Legacy fallback for older builds; prefer `EXPO_PUBLIC_ENABLE_AUTO_DETOURS` |
| `EXPO_PUBLIC_SHOW_LOW_CONFIDENCE_DETOURS` | `false` | Development/validation-only display option for low-confidence detour previews |

### V2 Lab Storage Isolation
| Variable | Default | Description |
|---|---|---|
| `DETOUR_DETECTOR_VERSION` | `v1` | Backend storage selector. `v2` uses `activeDetoursV2`, `detourHistoryV2`, and `systemState/detourRuntimeV2`. |
| `DETOUR_ACTIVE_COLLECTION` | version default | Optional explicit active-detour collection override. |
| `DETOUR_HISTORY_COLLECTION` | version default | Optional explicit history collection override. |
| `DETOUR_RUNTIME_STATE_COLLECTION` | `systemState` | Optional runtime-state collection override. |
| `DETOUR_RUNTIME_STATE_DOC` | version default | Optional runtime-state document override. |

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
| **GTFS-RT feed frozen/stale** | Raw vehicle entities are still counted in `vehicleFeed`, but vehicles older than 5 minutes are filtered out before detection. `/api/detour-status` reports `vehicleFeed.freshness.status: "stale"` and the worker logs `[detourWorker] Vehicle feed stale...`; stale GPS does not create or clear detours. |
| **Vehicle disappears from feed** | Removed from state after 5min (`STALE_VEHICLE_TIMEOUT_MS`). Does NOT clear the detour — absence of data is not evidence of return. |
| **All vehicles for one active segment go offline** | The segment stays active with `currentVehicleCount: 0` so the next bus can add evidence. It clears only after same-bus normal-route GPS traversal through the affected segment. |
| **Active detour has no trustworthy geometry** | The backend keeps monitoring but publishes `riderVisible: false`. Riders do not see the detour until trustworthy geometry exists. If no segment clear window exists, same-route normal-service pings do not auto-clear it; clearing requires a recovered clear window plus GPS traversal, or an explicit operator/admin clear. |
| **Firestore write fails** | Error logged, publish skipped for that tick. Detection state machine continues in-memory. Retries next tick. |
| **Firestore unreachable at startup** | Runtime-state hydration may fail. If active-detour snapshot fallback also cannot load, the first empty publish is guarded so an empty fresh runtime does not immediately delete existing active detours. Existing detours can still be re-detected as vehicles appear. |
| **Worker restarts** | In interval mode, detector rehydrates learned persistent detours, including learned GPS evidence, and resumes in-memory monitoring. In manual/scheduled mode, runtime detector state is reloaded from Firestore before each tick; if runtime state is empty, active Firestore snapshots are hydrated as a cold-start fallback. |
| **Service ends with active detours** | Detection freezes, current vehicle associations are dropped, and active detours remain published with `currentVehicleCount: 0`. They clear only after in-service GPS shows the same bus traversing the regular route through the affected segment. |
| **Loop route bus starts a new trip at the terminal** | The old trip's vehicle association is dropped, but the same bus's next trip is not allowed to clear the previous detour segment by itself. This avoids false clears when a loop route starts and ends at Downtown Hub. |

---

## 7. Debug Endpoints

### `GET /api/detour-status`
Overview of the detection system. Returns:
- `enabled`, `running`, `tickCount`, `lastSuccessfulTick`
- `consecutiveFailureCount`, `errors.fetchFailures`, `errors.publishFailures`
- `activeDetours` — map of route IDs → `{ vehicleCount, detectedAt, state }` for the currently published route snapshots
- `baseline` — `{ loaded, loadedAt, source, routeCount, shapeCount }`
- `vehicleFeed` — raw GTFS-RT vehicle feed health, including raw entity count, positioned vehicle count, usable vehicle count, stale-filtered count, and freshness status
- `vehicleSamples` — post-filter duplicate-sample tracking for detection input
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
- `detour/projection.js` — Shared route-shape projection and per-vehicle projection diagnostics
- `detour/candidateMemory.js` — Headway-aware candidate evidence memory for low-frequency confirmation
- `detourGeometry.js` — Skipped segment + inferred path computation
- `detourPublisher.js` — Firestore publisher with write throttling
- `detour/publisher/snapshotEvents.js` — Active-detour snapshot and history event shaping
- `activeDetourSnapshotStore.js` — Loads published `activeDetours` snapshots for cold-start hydration/deletion safety
- `persistentDetourStore.js` — Firestore persistence for learned long-running detours
- `detourRuntimeStateStore.js` — Firestore persistence for detector runtime state between manual/scheduled ticks
- `baselineManager.js` — Persists baseline route shapes to Firestore; detects shape changes between GTFS updates

### Client (src/)
- `services/firebase/detourService.js` — Firestore listener for activeDetours
- `hooks/useDetourOverlays.js` — Transforms detour data for map rendering
- `components/DetourOverlay.js` / `.web.js` — Map overlay components
- `utils/detourOverlayGeometry.js` and `utils/detourOverlayDisplay.js` — Shared detour overlay path/display helpers
- `context/TransitContext.js` — Integrates detour state into app context

### Tests
- `api-proxy/__tests__/detourDetector.test.js` — detection logic, hysteresis, multi-vehicle behavior, same-route multi-segment lifecycle
- `api-proxy/__tests__/detourGeometry.test.js` — shape analysis, simplification, confidence, segment splitting
- `api-proxy/__tests__/detourPublisher.test.js` — snapshots, throttling, history events
- `api-proxy/__tests__/detourIntegration.test.js` — full pipeline, state transitions, one-route-two-segment publishing
- `src/__tests__/detourOverlays.test.js` — overlay derivation, state filtering
- `src/__tests__/detourIntegration.test.js` — Firestore → context → rendering

### Ground-truth validation
- `docs/detour-ground-truth/` — operator-supplied known detour cases; these are validation fixtures, not route-specific hardcoded behavior
- `scripts/validate-detour-ground-truth.js` — checks current/saved output against known closure and detour-path expectations
