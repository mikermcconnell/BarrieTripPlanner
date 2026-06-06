# Route 12B Short Detour Long-Term Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent short, real detours from expanding into larger public detours with unrelated closed stops.

**Architecture:** Keep V2 event-window detection as the source of truth, but tighten candidate identity, publish explicit stop-impact roles, spatially gate official notices, and add a ground-truth regression case for this Route 12B pattern. These are long-term route-agnostic changes; do not add one-off Route 12B clearing or hardcoded public-data edits.

**Tech Stack:** Node.js backend in `api-proxy/`, V2 detector, Firestore publisher, React Native client stop/detail rendering, Jest tests, ground-truth validator.

---

## Current evidence

- Live Route 12B Bayfield/Sophia event: `12B:1fd211d5-ccc2-483b-a555-aa6ffdaa98b7:3300-3600`.
- Ground truth start: `44.3919167, -79.6927500`.
- Ground truth end: `44.3908333, -79.6930278`.
- Ground-truth direct distance: about 122 m.
- Ground-truth route-progress span: about 248 m.
- Current published core span: about 519 m.
- Current backend has `skippedStops: []` but `affectedStops: [75, 486]`.
- Current publisher also attaches Saunders/Welham notice temporary/active stop fields to this Bayfield/Sophia event.

Saved evidence files:

- `logs/live-route-12b-active-detour-events-v2.json`
- `logs/live-route-12b-detour-event-history-v2.json`
- `logs/route-12b-ground-truth-projection-codepath.json`
- `logs/transit-news-impact-1637.json`

---

## Fix 1: Adaptive candidate identity and expansion for short detours

### Problem

`findMatchingEventCandidate` can attach a point outside the event confirmation window when the progress gap is within `DETOUR_V2_GEOMETRY_CLUSTER_GAP_METERS` (default 1000 m). That broad fallback lets a short provisional detour absorb a downstream point and become a larger public event.

### Principle

A provisional event should only expand from evidence that belongs to the same physical movement. Farther evidence should create a separate candidate unless there is same-trip/same-vehicle continuity proving it is one longer detour.

### Files

- Modify: `api-proxy/detourV2/eventWindows.js`
- Modify: `api-proxy/detourV2/detector.js`
- Test: `api-proxy/__tests__/detourV2EventWindows.test.js`
- Test: `api-proxy/__tests__/detourV2Detector.test.js`
- Docs: `docs/AUTO-DETOUR-DETECTION.md`
- Docs: `docs/AUTO-DETOUR-VALIDATION-MATRIX.md`

### Implementation steps

- [ ] Add event-window helper functions:
  - `getEventWindowCoreSpanMeters(eventWindow)`.
  - `getEventWindowConfirmGapMeters(point, eventWindow)`.
  - `canExpandEventWindowWithPoint(eventWindow, point, candidate, options)`.
- [ ] Replace the generic `nearestGap <= GEOMETRY_CLUSTER_GAP_METERS` candidate match with stricter logic:
  - Points inside the confirmation window can match.
  - Points outside the confirmation window can match only if they are from the same signature and form a coherent sparse forward trace within the existing time/reversal limits.
  - Different vehicles outside the confirmation window create separate candidates.
- [ ] Keep `GEOMETRY_CLUSTER_GAP_METERS` for geometry splitting/long sparse traces, but stop using it as the normal candidate identity fallback.
- [ ] Update provisional event IDs when a candidate expands across progress buckets before first publish. Do not leave a candidate keyed by its first off-route bucket if its frozen core moved to a different bucket.
- [ ] Add a detector regression test reproducing the Route 12B pattern:
  - two or more points near progress about 2965-3218 confirm the short event;
  - a later off-route point around 3483 does not expand that event unless same-trip continuity proves it belongs;
  - the resulting public event span remains near the short corridor.
- [ ] Add a long-detour sparse-trace regression to prove this does not split a real long detour when the same trip has coherent forward sparse evidence.
- [ ] Run:
  - `npm --prefix api-proxy test -- --runTestsByPath __tests__/detourV2EventWindows.test.js __tests__/detourV2Detector.test.js --runInBand`

### Acceptance criteria

- Short provisional events scale to their own evidence instead of being stretched by unrelated nearby route noise.
- Multiple close-but-distinct same-route events remain separate.
- Real sparse long detours still publish as one event when same-trip trace continuity supports that.

---

## Fix 2: Explicit stop-impact roles instead of treating boundary stops as closed

### Problem

For the Bayfield/Sophia event, backend data correctly has no skipped stops, but it publishes boundary/nearby stops as `affectedStops`. Some rider surfaces infer closure-like messaging from `affectedStops`, so a short no-skipped-stop event can look like it has closed stops.

### Principle

A rider-facing stop should only be shown as closed/skipped when the backend explicitly marks it skipped for that route. Boundary stops and active notice stops need different roles and copy.

### Files

- Modify: `api-proxy/detour/stopImpacts.js`
- Modify: `api-proxy/detourGeometry.js`
- Modify: `src/hooks/useAffectedStops.js`
- Modify: `src/components/DetourTimeline.js`
- Modify: `src/components/DetourImpactSummary.js`
- Modify: `src/utils/tripDetourImpacts.js`
- Test: `api-proxy/__tests__/stopImpacts.test.js`
- Test: `src/__tests__/useAffectedStops.test.js`
- Test: `src/__tests__/tripDetourImpacts.test.js`
- Test: `src/__tests__/detourOverlays.test.js`

### Implementation steps

- [ ] Extend backend stop-impact output with explicit roles:
  - `boundaryStops`: entry/exit or last-served/first-served stops.
  - `skippedStops`: route stops the detour bypasses.
  - `affectedStops`: broad context only; not automatically closed.
  - stop objects should include `detourStopRole: 'boundary' | 'skipped' | 'served-by-detour' | 'notice-active'` where possible.
- [ ] Keep existing fields for compatibility, but update frontend surfaces to prefer roles and `skippedStops` for closure logic.
- [ ] Update `DetourTimeline`:
  - If `skippedStops` is empty and boundary stops exist, show “Detour between A and B” and “No stops currently marked closed.”
  - Do not use `affectedStops.slice(1, -1)` as skipped-stop truth.
- [ ] Update trip-planning warnings:
  - Boarding/alighting at `skippedStops` remains high severity.
  - Boarding/alighting at only a boundary/affected stop becomes route-level caution, not “closed stop.”
- [ ] Add tests using the Bayfield/Sophia shape:
  - affected/boundary stops `75` and `486`, `skippedStops: []`.
  - no closed-stop marker and no closed-stop trip warning.
- [ ] Run:
  - `npm --prefix api-proxy test -- --runTestsByPath __tests__/stopImpacts.test.js --runInBand`
  - `npm test -- --runTestsByPath src/__tests__/useAffectedStops.test.js src/__tests__/tripDetourImpacts.test.js src/__tests__/detourOverlays.test.js --runInBand`

### Acceptance criteria

- Boundary stops are not portrayed as closed.
- A short detour with no skipped stops can still be public, but with neutral route-detour messaging.
- Closed-stop map markers and trip warnings are driven by `skippedStops`, not generic `affectedStops`.

---

## Fix 3: Spatially gate and strictly limit official notice stop impacts

### Problem

`mergeNoticeStopImpactsIntoGeometry` applies active MyRide notice impacts by route family. The Saunders/Welham notice is Route 12-family, so its temporary/active stop fields attach to a Bayfield/Sophia Route 12B event several kilometres away.

### Principle

Official notices must never detect, expand, clear, or keep alive an auto-detour. They may only enrich an already GPS-confirmed detour when the notice stop impacts overlap the physical event window and the enrichment does not create false stop-closure messaging. Route family alone is not enough.

### Files

- Modify: `api-proxy/detourPublisher.js`
- Possibly modify: publisher GTFS data assembly where `gtfsData` is passed, if shape lookup is not currently available there.
- Test: `api-proxy/__tests__/detourPublisher.test.js`
- Docs: `docs/AUTO-DETOUR-DETECTION.md`
- Docs: `docs/AUTO-DETOUR-QA-CHECKLIST.md`

### Implementation steps

- [ ] Add a helper such as `noticeImpactOverlapsSegment(routeId, segment, noticeImpact, gtfsData)`.
- [ ] Resolve candidate notice stops to GTFS coordinates, project them onto the segment shape, and compare them with the segment/event progress window.
- [ ] Allow notice enrichment on a segment only when at least one notice closure candidate:
  - is already in current skipped/boundary fields; or
  - projects inside the event core/segment window plus a modest route-progress tolerance; or
  - is within a small geographic distance of the closed segment/detour path.
- [ ] Do not attach notice temporary stops, notice active stops, or notice closure candidates to a segment when the notice fails the spatial overlap gate.
- [ ] Preserve the current valid behavior for the actual Saunders/Welham/Hooper Route 12 detour.
- [ ] Add publisher tests:
  - Saunders/Welham notice does not attach to a Bayfield/Sophia Route 12B event.
  - Saunders/Welham notice still enriches the Saunders/Welham event.
  - A broad route-family notice with no mappable stop impacts does not create any detour fields or stop-impact fields by itself.
- [ ] Run:
  - `npm --prefix api-proxy test -- --runTestsByPath __tests__/detourPublisher.test.js --runInBand`

### Acceptance criteria

- Official notice stop impacts are route-family AND location relevant.
- Bayfield/Sophia Route 12B event has no Saunders/Welham temporary/active stop fields.
- Valid Saunders/Welham Route 12 events still receive notice-backed temporary stop data.

---

## Fix 4: Durable ground-truth validation for short detours

### Problem

We caught this issue through manual review. Without a durable validation case, future detector changes could re-expand the same type of short event or reattach distant notice impacts.

### Principle

Known real-world cases should become repeatable validation fixtures, not one-off operational overrides.

### Files

- Create: `docs/detour-ground-truth/route-12b-bayfield-sophia-2026-06-05.json`
- Modify: `scripts/validate-detour-ground-truth.js`
- Modify: `docs/detour-ground-truth/README.md`
- Modify: `docs/AUTO-DETOUR-VALIDATION-MATRIX.md`
- Test: add or extend a validator test if this script has test coverage; otherwise add a small fixture-based smoke command to the plan verification section.

### Implementation steps

- [ ] Add a ground-truth fixture with:
  - route `12B`.
  - expected start/end coordinates.
  - maximum closed span tolerance, initially ground-truth progress span plus about 40 m, configurable after live calibration.
  - expected `skippedStopCodes: []`.
  - disallowed notice source/news ID `1637` unless spatially overlapping.
  - disallowed distant stop codes `617`, `618`, `931`, `756`, `932`, `933` for this event.
- [ ] Extend the validator to support V2 active event docs from `activeDetourEventsV2`.
- [ ] Add checks for:
  - event route match;
  - event geometry proximity to expected start/end;
  - maximum event core/closed span;
  - skipped stop list expectations;
  - absence of distant official notice impacts.
- [ ] Run the validator against a saved live snapshot and document expected pass/fail:
  - Before fixes: FAIL because span and notice impacts are wrong.
  - After fixes: PASS.
- [ ] Update validation matrix with a new scenario, for example `DET-050 Short location-specific detour with no closed stops`.

### Acceptance criteria

- The Route 12B short-detour case is repeatable from a saved/live snapshot.
- The validator fails on the current bad output and passes after the long-term fixes.
- Future launch checks can detect this regression without manual map inspection.

---

## Suggested execution order

1. Fix 1 first: stop candidate over-expansion at the source.
2. Fix 3 second: prevent distant official notice data from polluting unrelated events.
3. Fix 2 third: clean up rider stop semantics and copy.
4. Fix 4 last: encode the real-world case as a durable regression check.

---

## Product decisions from Mike

- Short detours with no skipped stops should remain public when GPS-confirmed and safe to render.
- Tighten short-detour geometry tolerance below the earlier 75-100 m suggestion. Use an initial target of about 40 m, aligned with the default GPS off-route threshold, and make it configurable for calibration.
- Auto-detours must never be detected from official notices. GPS is always the detector source of truth.
- Official notices must not create, expand, or keep alive an auto-detour. At most, they may enrich a GPS-confirmed detour only when spatially relevant and explicitly safe.
- Boundary stops that remain in service should not receive closure markers, stop-impact warnings, or “affected stop” notifications. For this kind of short detour, if no stop is skipped, the rider message should be route/corridor-level only.

---

## Verification checklist

- [ ] `npm --prefix api-proxy test -- --runTestsByPath __tests__/detourV2EventWindows.test.js __tests__/detourV2Detector.test.js __tests__/detourPublisher.test.js __tests__/stopImpacts.test.js --runInBand`
- [ ] `npm test -- --runTestsByPath src/__tests__/useAffectedStops.test.js src/__tests__/tripDetourImpacts.test.js src/__tests__/detourOverlays.test.js --runInBand`
- [ ] `npm run validate:detour-ground-truth -- --fixture docs/detour-ground-truth/route-12b-bayfield-sophia-2026-06-05.json`
- [ ] Update `docs/AUTO-DETOUR-DETECTION.md`, `docs/AUTO-DETOUR-QA-CHECKLIST.md`, and `docs/AUTO-DETOUR-VALIDATION-MATRIX.md` only where behavior changed.
