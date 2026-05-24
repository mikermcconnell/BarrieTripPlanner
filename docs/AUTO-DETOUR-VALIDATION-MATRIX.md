# Auto-Detour Validation Matrix

Status: Current as of 2026-05-24

Use this file to turn detour bugs, live observations, and product decisions into repeatable validation scenarios.

## Purpose

Auto-detour quality should improve through accumulated evidence, not one-off chat fixes.

For every meaningful detector issue:

1. Capture the observed scenario.
2. State the expected rider-facing and backend behavior.
3. Identify the root cause.
4. Add or update automated coverage where practical.
5. Update docs if the behavior or validation process changed.
6. Record remaining risks.

## Source-of-truth boundaries

- Expected behavior, data model, and rider UX: [`AUTO-DETOUR-DETECTION.md`](./AUTO-DETOUR-DETECTION.md)
- Manual/live validation steps: [`AUTO-DETOUR-QA-CHECKLIST.md`](./AUTO-DETOUR-QA-CHECKLIST.md)
- Backend deployment and operations: [`API-PROXY-OPERATIONS.md`](./API-PROXY-OPERATIONS.md)
- This file: scenario index, regression matrix, and change-control workflow
- Dated notes under [`docs/plans/`](./plans/) remain working notes only.

If this file conflicts with the behavior doc, fix the conflict instead of treating this file as an override.

## Scenario matrix

| ID | Scenario | Expected behavior | Automated coverage | Manual/live validation | Current status | Risk to watch |
|---|---|---|---|---|---|---|
| DET-001 | Normal confirmed detour | Publish an active detour only after confirmed off-route evidence from the required unique same-route vehicles. | `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/detourIntegration.test.js` | QA sections 3, 4, 9 | Covered | False positives from noisy GPS or bad baseline |
| DET-002 | Likely path confidence gate | Keep the alert active, but hide the rider-facing likely path until trusted entry/exit and corridor evidence exist. | `api-proxy/__tests__/detourGeometry.test.js`, `src/__tests__/detourOverlays.test.js` | QA sections 5, 6, 7 | Covered | Sparse evidence producing a convincing but wrong purple path |
| DET-003 | Very short recurring detour | Confirm repeated short off-route deviations only when two unique same-route trips/vehicles corroborate the same segment. | `api-proxy/__tests__/detourDetector.test.js` | QA sections 4, 12 | Covered | Counting repeated snapshots from the same trip as independent evidence |
| DET-004 | Low-frequency / Sunday service | Keep candidate evidence long enough for the next low-frequency bus to corroborate; do not clear from bus absence. | `api-proxy/__tests__/detourDetector.test.js` | QA section 12 | Covered | Candidate memory too short or stale warnings mistaken for clear proof |
| DET-005 | GPS-proven normal clearing | Clear only after same-bus normal-route traversal through the affected segment, then delete the active Firestore doc. | `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/detourPublisher.test.js` | QA sections 10, 11 | Covered | Premature clearing when a bus is merely near the route |
| DET-006 | Stale active detour | Keep active detours visible with `currentVehicleCount: 0` until new evidence confirms detour or normal routing. | `api-proxy/__tests__/detourDetector.test.js` | QA sections 11, 12 | Covered | Old evidence staying visible too long without operator review context |
| DET-007 | Backend cold start with active detours | Rehydrate runtime state or active Firestore snapshots so the first post-restart tick does not delete valid detours. | `api-proxy/__tests__/detourIntegration.test.js` | QA section 13 | Covered | Empty runtime state causing accidental deletion |
| DET-008 | Same-route multiple independent detours | Publish separate `segments[]` under one route document; do not merge separated closures into one giant lifecycle. | `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/detourIntegration.test.js` | QA sections 5, 14 | Covered | Normal in-between route travel clearing or merging unrelated segments |
| DET-009 | Multi-vehicle noisy geometry | Select a representative trajectory instead of weaving all vehicle points into overlapping reroute branches. | `api-proxy/__tests__/detourGeometry.test.js` | QA section 5 | Covered | Messy inferred path when vehicles take different alternates |
| DET-010 | Route-family projection | Project a confirmed physical closure to sibling route variants only when the source segment has reliable closure geometry. | `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/detourGeometry.test.js` | QA sections 4, 12, 15 | Covered | A bus using a sibling's regular route being mislabeled as a detour |
| DET-011 | Same-stop self-loop / turnaround | Reject same-stop self-loop geometry when no real closed route segment is identified. | `api-proxy/__tests__/detourGeometry.test.js`, `api-proxy/__tests__/detourPublisher.test.js` | QA section 5 | Covered | Route-fallback spurs appearing as false detours |
| DET-012 | Rider map rendering | Show closed route sections, likely detour paths, stops, buses, banner, and details without stale overlays after tab switching. | `src/__tests__/detourOverlays.test.js`, `src/__tests__/detourIntegration.test.js` | QA sections 6, 7, 8, 9 | Partially covered | Visual regressions that only appear in native/web map rendering |
| DET-013 | Baseline safety | Block detection when the baseline is unsafe or silently refreshed from live detoured GTFS. | Existing backend status and rollout-health checks | QA sections 1, 13, 14 | Needs explicit scenario review before launch | Treating a live detour as normal service |
| DET-014 | Rollout health / flapping | Surface recent failures, flapping, short-lived detections, and false-positive indicators before public launch. | `api-proxy` rollout-health coverage where present | QA section 14 | Needs ongoing live review | Launching with noisy but test-passing behavior |

## Recorded issues

### DET-011A — same-stop out-and-back path shown as a detour

- Date/time observed: 2026-05-24
- Environment: live Firestore capture during auto-detour validation
- Route(s): `12A`, `12B`; projected from shared-location route-family evidence from `8B`
- What happened: the app showed a likely detour path that travelled down Simcoe Street, looped/U-turned, and returned to the same downtown hub road area.
- What should have happened: this should not be rider-visible as a detour because no real closed route segment was identified.
- Evidence: captured active detour snapshots showed bad segments with `entryStopId === exitStopId`, `skippedStopIds` containing only that same stop, `roadMatchSource: "osrm-match"`, and `debug.routeFamilyMergeMode: "projected-shared-location"`.
- Initial classification:
  - geometry
  - route family
  - publishing/history
- Root cause: route-family/shared-location projection accepted a same-stop, single-stop segment as a valid closure. The road matcher then produced a high-confidence out-and-back path, but the backend had no validity gate to reject the segment as a non-closure before publishing or preserving the path.
- Fix:
  - reject same-stop, single-stop non-closure segments after stop-impact enrichment
  - apply the same filter before publishing top-level geometry
  - do not preserve a previously trusted likely path from a same-stop non-closure segment
- Tests added/updated:
  - `api-proxy/__tests__/detourGeometry.test.js`
  - `api-proxy/__tests__/detourPublisher.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - `AUTO-DETOUR-QA-CHECKLIST.md`
  - this matrix
- Remaining risk: similar false positives could still occur if entry and exit stops differ but the inferred path is still a short terminal loop. Watch for future cases where the affected segment is very short, terminal-only, or hub-only but not technically the same stop ID.

## Status definitions

- **Covered** — automated coverage exists and the manual checklist has a matching validation path.
- **Partially covered** — logic is tested, but visual/device/manual validation still matters.
- **Needs explicit scenario review** — behavior exists, but it deserves a dedicated regression case before launch.
- **Blocked** — expected behavior is known, but implementation or validation is missing.

## Issue capture template

Add a short entry under the appropriate scenario row, or create a new row if the issue is a new class of failure.

```md
### Issue: short title

- Date/time observed:
- Environment: local / staging / production
- Route(s):
- Vehicle/trip IDs, if known:
- What happened:
- What should have happened:
- Evidence:
  - activeDetours doc:
  - detourHistory event:
  - /api/detour-debug or /api/detour-status:
  - screenshot/video:
- Initial classification:
  - detection
  - geometry
  - clearing
  - route family
  - publishing/history
  - frontend rendering
  - baseline/operations
- Root cause:
- Fix:
- Tests added/updated:
- Docs updated:
- Remaining risk:
```

## Change-control checklist

Before closing any meaningful auto-detour change:

- [ ] The scenario matrix row is updated or a new row is added.
- [ ] Expected behavior is documented in `AUTO-DETOUR-DETECTION.md` if behavior changed.
- [ ] Manual validation is documented in `AUTO-DETOUR-QA-CHECKLIST.md` if QA changed.
- [ ] Automated tests were added or intentionally skipped with a reason.
- [ ] Existing related scenarios were checked for regressions.
- [ ] Firestore fields or operational requirements were documented if they changed.
- [ ] Remaining risk is written down plainly.

## Root-cause categories

Use these labels consistently so repeated patterns are easy to spot:

- **Detection threshold** — off-route/on-route thresholds, consecutive readings, candidate confirmation.
- **Geometry confidence** — entry/exit anchors, skipped segment, inferred path, road matching.
- **Route-family mapping** — sibling route projection, branch variants, opposite directions.
- **Lifecycle / clearing** — active, clear-pending, cleared, stale monitoring, service-hours behavior.
- **Persistence / restart** — runtime state, persistent learned detours, Firestore hydration.
- **Publishing / history** — activeDetours schema, detourHistory events, write throttling.
- **Frontend rendering** — map overlays, banner, details sheet, tab switching, safe-area layout.
- **Baseline / operations** — trusted baseline, scheduler mode, auth, deployment environment.

## Launch-quality rule

Do not treat a detector fix as launch-ready just because the immediate symptom is gone.

It is launch-ready only when:

- the scenario is repeatable,
- expected behavior is clear,
- regression coverage exists where practical,
- rider-facing risk is understood,
- and the relevant docs were updated.
