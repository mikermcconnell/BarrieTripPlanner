# Detour Geometry UI — QA Checklist

Manual QA verification for detour overlays on native and web platforms.

**Prerequisites:**
- Backend running with `DETOUR_WORKER_ENABLED=true`
- At least one active detour (or use `/api/detour-debug` to verify)
- Feature flag `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI=true`

---

## 1. Overlay Visibility

### Native (iOS/Android)
- [ ] Active detour route shows **red dashed line** (skipped segment) on the map
- [ ] Active detour route shows **orange solid line** (inferred detour path) on the map
- [ ] Both overlays appear when the detouring route is **selected** in the route filter
- [ ] Overlays **disappear** when the detouring route is deselected
- [ ] Overlays are **not visible** during trip preview mode

### Web (Leaflet)
- [ ] Active detour route shows **red dashed line** (skipped segment)
- [ ] Active detour route shows **orange solid line** (inferred detour path)
- [ ] Both overlays appear when the detouring route is selected
- [ ] Overlays disappear when the detouring route is deselected
- [ ] Overlays are not visible during trip preview mode

---

## 2. Styling & Colors

### Native
- [ ] Skipped segment: red (#ef4444), dashed pattern [8, 6], strokeWidth=5
- [ ] Inferred path: orange (#f97316), solid line, strokeWidth=5
- [ ] Both lines have outline (outlineWidth=1.5) for readability

### Web
- [ ] Skipped segment: red (#ef4444), dashed pattern "10, 8", strokeWidth=5
- [ ] Inferred path: orange (#f97316), solid line, strokeWidth=5
- [ ] Skipped segment has **no outline** (outlineWidth=0)
- [ ] Inferred path has outline (outlineWidth=1.5)

---

## 3. Z-Order Layering

- [ ] Detour overlays render **above** normal route polylines
- [ ] Detour overlays render **below** stop markers and bus markers
- [ ] Bus icons are not obscured by detour geometry
- [ ] Stop labels/names are still readable

---

## 4. State-Based Behavior

### Clear-Pending State
- [ ] When detour enters `clear-pending`, overlays become **semi-transparent** (opacity 0.45)
- [ ] Orange dot badge on route filter chip **persists** during clear-pending
- [ ] After detour fully clears, overlays **disappear** and badge is removed

### Active State
- [ ] Active detours show at **full opacity** (1.0)
- [ ] Orange dot badge appears on the route filter chip

---

## 5. Feature Flag Gating

- [ ] With `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI=false`: no detour overlays on map
- [ ] With flag=false: orange dot badge on route chip **still works** (not gated by flag)
- [ ] With flag=true: detour geometry overlays are visible on both platforms

---

## 6. Performance

- [ ] No visible frame drops or lag when detour overlays are rendered
- [ ] Map panning/zooming remains smooth with overlays active
- [ ] Route selection toggle does not cause noticeable delay
- [ ] Multiple simultaneous detours do not degrade performance

---

## 7. Edge Cases

- [ ] Route with `skippedSegmentPolyline` but no `inferredDetourPolyline`: only red line shown
- [ ] Route with `inferredDetourPolyline` but no `skippedSegmentPolyline`: only orange line shown
- [ ] Route with both polylines having < 2 points: no overlay rendered (graceful)
- [ ] Pre-geometry detour document (old format, no polylines): badge shows but no overlay
- [ ] Multiple routes detouring simultaneously: each shows its own overlays

---

## 8. Cross-Platform Parity

- [ ] Visual intent is equivalent between native and web (same colors, same line types)
- [ ] Note: web uses CSS `dashArray` string; native uses numeric array — visual result should match
- [ ] Web overlays have `interactive=false` (no hover/click events)
- [ ] Both platforms hide overlays during trip preview

---

## 9. Backend Health Verification

- [ ] `GET /api/detour-status` shows `enabled: true` and active detour summaries
- [ ] `GET /api/detour-rollout-health` reports flapping rate, duration stats, publish failures
- [ ] `GET /api/detour-debug?routeId=X` shows evidence points for active detours
- [ ] No `detour cleared` false events visible in recent events log during active detours

---

## Sign-Off

| Platform | Tester | Date | Pass/Fail | Notes |
|----------|--------|------|-----------|-------|
| iOS      |        |      |           |       |
| Android  |        |      |           |       |
| Web      |        |      |           |       |
