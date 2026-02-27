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
│  detourWorker.js     │  30s poll interval, seeds from Firestore on restart
│  (api-proxy/Railway) │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  detourDetector.js   │  State machine: pending → active → clear-pending → cleared
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

---

## 3. Current State (as of 2026-02-27)

### What riders see today: Nothing yet
Both client feature flags are **off** (`false`). The detection is running server-side, but riders don't see anything in the app. The map overlay component exists in code but is behind a feature flag.

### What's built (backend — complete)
- Detection worker running on Railway, polling every 30s
- Detection algorithm with consecutive readings, zone-aware clearing, hysteresis dead band
- Firestore publishing (active detours + geometry) with write throttling
- Detour history event logging (30-day retention)
- Debug endpoints: `/api/detour-status`, `/api/detour-debug`, `/api/detour-logs`
- 312 tests across 23 suites

### What's built (frontend — partially complete)
- `DetourOverlay` component (native + web) — draws skipped segment + inferred path on the map
- `useDetourOverlays` hook — transforms Firestore data for map rendering
- `detourService.js` — Firestore real-time listener for activeDetours
- Wired into TransitContext and HomeScreen (both platforms)

### What's missing to go public
These are the remaining pieces before riders see detours on the map:

1. **Turn on the feature flags** — Flip `EXPO_PUBLIC_ENABLE_AUTO_DETOURS` and `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI` to `true`. This alone would show the map overlay, but without the banner or details, riders might not notice or understand it.
2. **DetourBanner** — A notification banner on the main map: "Route 1 is currently on detour." This is how riders find out. Without it, they'd have to visually spot the overlay.
3. **DetourDetailsSheet** — Tap the banner or overlay → bottom sheet with: which stops are skipped, where the bus is going instead, when the detour started.
4. **useAffectedStops hook** — Figures out which stops fall within the detoured segment. Powers the details sheet.
5. **Push notifications** (should have) — Alert riders who have favorited a route when a new detour is detected.
6. **Accessibility** (should have) — Screen reader announcements for detour events.

### Known Issues (Fixed 2026-02-27)
- **Flapping detours** — Single-vehicle GPS noise caused rapid detect/clear cycles. Fixed by raising `CONSECUTIVE_READINGS_REQUIRED` from 3→4 (2 minutes at 30s ticks). Made configurable via `DETOUR_CONSECUTIVE_READINGS` env var.

---

## 4. Definition of Success

The feature is "done" when a rider can open the app and know a detour is happening without any other source of information.

### Must Have (MVP)
- [ ] Rider opens the map and sees a visual overlay on any route that's currently detoured
- [ ] A banner on the map screen tells the rider which route is affected ("Route 1 is on detour")
- [ ] Tapping the banner/overlay shows which stops are skipped
- [ ] Detours are detected within 5 minutes of buses deviating
- [ ] Detours clear within 10 minutes of buses returning to route
- [ ] False positive rate < 10% over a 7-day window

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

All env vars for the detour system, set in Railway (production) or `.env` (local):

### Detection Tuning
| Variable | Default | Description |
|---|---|---|
| `DETOUR_WORKER_ENABLED` | `false` | Master switch for the detection worker |
| `DETOUR_POLL_INTERVAL_MS` | `15000` | How often to poll GTFS-RT (ms) |
| `DETOUR_STATIC_REFRESH_MS` | `21600000` | How often to refresh static GTFS shapes (6h) |
| `DETOUR_OFF_ROUTE_THRESHOLD_METERS` | `75` | Distance from shape to count as "off route" |
| `DETOUR_CONSECUTIVE_READINGS` | `4` | Off-route ticks before confirming (4 = 2min at 30s) |
| `DETOUR_EVIDENCE_WINDOW_MS` | `1800000` | Time window for geometry evidence (30min) |
| `DETOUR_MIN_ROUTE_EVIDENCE` | `8` | Minimum data points for geometry building |
| `DETOUR_MIN_UNIQUE_VEHICLES` | `2` | Minimum vehicles for geometry (not detection) |

### Clearing Tuning
| Variable | Default | Description |
|---|---|---|
| `DETOUR_ON_ROUTE_CLEAR_THRESHOLD_METERS` | `40` | Tighter threshold for "back on route" |
| `DETOUR_CLEAR_GRACE_MS` | `600000` | Minimum age before clear-pending (10min) |
| `DETOUR_MIN_ACTIVE_MS` | `300000` | Minimum age before clearing considered (5min) |
| `DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE` | `6` | On-route ticks before clearing per vehicle |

### Publishing & History
| Variable | Default | Description |
|---|---|---|
| `DETOUR_GEOMETRY_WRITE_THROTTLE_MS` | `120000` | Min ms between Firestore geometry writes per route |
| `DETOUR_HISTORY_ENABLED` | `true` | Enable detour event history in Firestore |
| `DETOUR_HISTORY_RETENTION_DAYS` | `30` | Days to retain history (<=0 disables pruning) |

### Client Feature Flags
| Variable | Default | Description |
|---|---|---|
| `EXPO_PUBLIC_ENABLE_AUTO_DETOURS` | `false` | Enable detour detection subscription in client |
| `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI` | `false` | Show detour geometry overlay on map |

---

## 6. Rollout Plan

**Stage 1: Internal Testing** (current)
- Detection worker running in production, geometry overlays behind feature flag
- Monitoring for false positives and flapping via `/api/detour-status`
- Tuning thresholds based on real Barrie Transit data

**Stage 2: Soft Launch**
- Enable `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI` for all users
- Build and ship DetourBanner + DetourDetailsSheet
- Monitor user-facing accuracy for 2 weeks

**Stage 3: Full Launch**
- Enable push notifications for favorited routes
- Remove feature flag guards (always-on)
- Add analytics tracking for detection accuracy

---

## 7. Key Files

### Server (api-proxy/)
- `detourWorker.js` — Worker orchestrator, 30s tick loop, Firestore seeding
- `detourDetector.js` — Core detection algorithm, state machine, vehicle tracking
- `detourGeometry.js` — Skipped segment + inferred path computation
- `detourPublisher.js` — Firestore publisher with write throttling

### Client (src/)
- `services/firebase/detourService.js` — Firestore listener for activeDetours
- `hooks/useDetourOverlays.js` — Transforms detour data for map rendering
- `components/DetourOverlay.js` / `.web.js` — Map overlay components
- `context/TransitContext.js` — Integrates detour state into app context

### Tests
- `api-proxy/__tests__/detourDetector.test.js` — 54 unit tests
- `api-proxy/__tests__/detourIntegration.test.js` — Pipeline + state transition tests
- `src/__tests__/detourOverlays.test.js` — Client overlay tests
- `src/__tests__/detourIntegration.test.js` — End-to-end client tests
