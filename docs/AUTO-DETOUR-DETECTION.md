# Auto Detour Detection — Project Summary

> Single source of truth for the auto detour detection feature.
> Last updated: 2026-02-27

---

## 1. What It Does

Automatically detects when Barrie Transit buses deviate from their published routes (construction, road closures, events) and notifies riders in real time. No manual input from transit staff required.

**How it works:**
1. A server-side worker (api-proxy on Railway) polls GTFS-RT vehicle positions every 30 seconds
2. Each vehicle's GPS position is compared against its route's published shape geometry
3. When multiple consecutive off-route readings are observed, a detour is confirmed
4. Detour geometry (skipped segment + inferred path) is computed and published to Firestore
5. Clients subscribe to the `activeDetours` Firestore collection for real-time updates
6. Map overlays show affected route segments; riders on affected routes are notified

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

### Built and Deployed
- **Server-side detection** — Running on Railway, polling every 30s
- **Detection algorithm** — Consecutive off-route readings, zone-aware clearing, hysteresis dead band (40m–75m), trip-aware shape resolution
- **Firestore publishing** — Active detours + geometry with write throttling
- **Detour history** — Event logging with 30-day retention and pruning
- **API endpoints** — `/api/detour-status`, `/api/detour-debug`, `/api/detour-logs`
- **Client overlay** — `DetourOverlay` component (native + web) showing skipped segments and inferred paths
- **Feature flags** — `EXPO_PUBLIC_ENABLE_AUTO_DETOURS`, `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI`
- **Tests** — 312 tests across 23 suites (detector, integration, geometry, overlays)

### Not Yet Built
- **DetourBanner** — In-app notification banner when a user's route has an active detour
- **DetourDetailsSheet** — Bottom sheet showing detour details, affected stops, ETA impact
- **useAffectedStops hook** — Determines which stops are skipped by a detour
- **Push notifications** — Firebase Cloud Messaging for detour alerts (favorited routes)
- **Accessibility** — Screen reader announcements for new detours
- **Analytics** — Detection accuracy metrics, false positive tracking

### Known Issues (Fixed 2026-02-27)
- **Flapping detours** — Single-vehicle GPS noise caused rapid detect/clear cycles. Fixed by raising `CONSECUTIVE_READINGS_REQUIRED` from 3→4 (2 minutes at 30s ticks). Made configurable via `DETOUR_CONSECUTIVE_READINGS` env var.

---

## 4. Definition of Success

The feature is "done" when:

### Must Have (MVP)
- [ ] Real detours are detected within 5 minutes of buses deviating
- [ ] False positive rate < 10% over a 7-day window (no flapping)
- [ ] Detours clear within 10 minutes of buses returning to route
- [ ] Users see detour overlay on affected routes in the map view
- [ ] Users on an affected route see an in-app banner notification
- [ ] Detour details show which stops are affected/skipped

### Should Have
- [ ] Push notifications for favorited routes with active detours
- [ ] Detour history visible to users (past detours on a route)
- [ ] Detection works correctly for route variants (8A/8B)

### Nice to Have
- [ ] ETA impact estimation (how much longer the detour adds)
- [ ] Staff dashboard for monitoring detection accuracy
- [ ] Manual override: staff can confirm/dismiss auto-detected detours

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
