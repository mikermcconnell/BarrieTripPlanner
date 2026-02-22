# Detour Geometry — Rollout Guide

Staged deployment plan for the detour detection + geometry overlay feature.

---

## Stage 1: Backend Only (Geometry Writing Enabled, UI Hidden)

**Goal:** Validate detection stability and geometry production without exposing UI to users.

### Env Var Configuration
```
# Backend (api-proxy/.env)
DETOUR_WORKER_ENABLED=true
DETOUR_HISTORY_ENABLED=true
DETOUR_GEOMETRY_WRITE_THROTTLE_MS=120000

# Client (.env)
EXPO_PUBLIC_ENABLE_AUTO_DETOURS=true
EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI=false   # UI hidden
```

### Deploy Steps
1. Deploy api-proxy with updated env vars
2. Verify worker starts: `GET /api/detour-status` returns `{ enabled: true, running: true }`
3. Confirm geometry fields are being written: `GET /api/detour-debug?routeId=<activeRouteId>`

### Monitor for 24-48 Hours
Use `GET /api/detour-rollout-health` to check:

| Metric | Healthy | Warning | Action |
|--------|---------|---------|--------|
| `publishFailureRate.rate` | < 0.01 | > 0.05 | Check Firebase credentials and Firestore rules |
| `flapping.flappingCount` | 0 | > 2 routes | Review hysteresis tuning: increase `DETOUR_CLEAR_GRACE_MS` or `DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE` |
| `durationStats.min` | > 300000 (5 min) | < 120000 (2 min) | False detections — increase `DETOUR_OFF_ROUTE_THRESHOLD_METERS` |
| `consecutiveFailureCount` | 0 | > 3 | Check GTFS feed availability and network connectivity |

### Validation Checklist
- [ ] Worker running with zero consecutive failures for 24h
- [ ] No flapping routes (< 2 clear events per route per day)
- [ ] Active duration distributions look reasonable (5+ minutes)
- [ ] Publish failure rate < 1%
- [ ] Firestore `activeDetours` documents contain geometry fields

---

## Stage 2: Internal Testing (UI Enabled for Testers)

**Goal:** Visual verification on real devices before general availability.

### Env Var Configuration
```
# Client (.env) — internal build only
EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI=true
```

### Testing Targets
1. **Web:** Load app at dev URL, select a detouring route, verify overlays appear
2. **iOS:** Internal TestFlight build with flag enabled
3. **Android:** Internal APK/AAB with flag enabled

### QA Execution
Follow [DETOUR-QA-CHECKLIST.md](./DETOUR-QA-CHECKLIST.md) on all three platforms.

### Key Verifications
- [ ] Red dashed skipped segment visible on map
- [ ] Orange inferred detour path visible on map
- [ ] Overlays appear only for selected routes
- [ ] Clear-pending state shows reduced opacity
- [ ] No performance degradation (frame drops, lag)
- [ ] Badge dot on route chips works independently of geometry flag

---

## Stage 3: Full Rollout

**Goal:** Enable geometry UI for all users.

### Env Var Configuration
```
# Client (.env) — production
EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI=true
```

### Deploy Steps
1. Push client build with `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI=true`
2. For Expo OTA: update will propagate to all connected clients
3. For native stores: submit new build to App Store / Google Play

### Post-Rollout Monitoring (72 hours)
- Check `GET /api/detour-rollout-health` daily
- Watch for user-reported visual issues
- Monitor Sentry for any new errors related to detour components

---

## Rollback Procedures

### Level 1: Hide UI Only (Instant, No Rebuild)
Toggle the client feature flag to hide overlays while keeping detection running.

```
EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI=false
```

- Detection and geometry writing continue unaffected
- Route badge dots remain functional (not gated by this flag)
- For Expo OTA: push update to disable
- For native: requires a new build submission

### Level 2: Disable Geometry Writing
Stop writing geometry fields to Firestore while keeping basic detection.

```
DETOUR_GEOMETRY_WRITE_THROTTLE_MS=999999999   # effectively disables writes
```

- Active detour state docs still maintained (just without geometry fields)
- Existing geometry in Firestore remains until detour clears
- Detection and state transitions unaffected

### Level 3: Disable Worker
Stop all detour detection entirely.

```
DETOUR_WORKER_ENABLED=false
```

- No more detection, no Firestore writes
- Existing `activeDetours` documents remain (stale)
- Client sees stale data until documents are manually cleaned
- To clean: delete all documents in `activeDetours` collection

---

## Environment Variable Reference

| Variable | Default | Stage 1 | Stage 2 | Stage 3 |
|----------|---------|---------|---------|---------|
| `DETOUR_WORKER_ENABLED` | `false` | `true` | `true` | `true` |
| `DETOUR_HISTORY_ENABLED` | `true` | `true` | `true` | `true` |
| `EXPO_PUBLIC_ENABLE_AUTO_DETOURS` | `false` | `true` | `true` | `true` |
| `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI` | `false` | `false` | `true` | `true` |
| `DETOUR_OFF_ROUTE_THRESHOLD_METERS` | `75` | `75` | `75` | `75` |
| `DETOUR_ON_ROUTE_CLEAR_THRESHOLD_METERS` | `40` | `40` | `40` | `40` |
| `DETOUR_CLEAR_GRACE_MS` | `600000` | `600000` | `600000` | `600000` |
| `DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE` | `6` | `6` | `6` | `6` |
| `DETOUR_GEOMETRY_WRITE_THROTTLE_MS` | `120000` | `120000` | `120000` | `120000` |

---

## Monitoring Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/detour-status` | API token / Firebase | Worker health, active detours, recent events |
| `GET /api/detour-debug` | API token / debug key | Raw evidence data per route |
| `GET /api/detour-rollout-health` | API token / Firebase | Flapping rate, duration stats, publish failures |
| `GET /api/detour-logs` | API token / Firebase | History event timeline with filters |
