# Auto-Detour Remaining Safeguards

Date: 2026-07-17
Status: Implemented locally; diagnostic production rollout pending
Starting checkpoint: `7decd9686f28b8a189b274b83df85007a8d21043`

## Goal

Complete the two remaining global safeguards without weakening short-detour detection:

1. Require confirmed-event refreshes to follow the detour's known travel direction.
2. Keep refined rider-map boundary projections inside the detector's original route-progress area on looping or self-crossing routes.

These are global rules. They must not contain Route 8, Livingstone, or Shanty Bay special cases.

## Why this work remains

### Confirmed-event refresh direction

The refresh rule currently requires an on-route / marginal / on-route traversal, at least 75 metres of travel, the same shape, the event area, and proximity to the trusted detour path. It accepts both increasing and decreasing route progress, which is necessary because some valid trips use decreasing progress.

However, it does not compare the observed traversal with the direction that originally confirmed the event. A backward movement could therefore refresh an event in theory.

### Refined map boundaries on loops

The map fix projects trimmed detour-path endpoints onto the entire scheduled shape. On an ordinary route this is correct. On a loop or self-crossing shape, the nearest point may belong to a different visit to the same street. The detector already knows the event's original progress window, so the display projection should prefer that portion of the shape.

## Non-goals

- Do not lower the 40-metre off-route threshold.
- Do not change the two-trip confirmation rules.
- Do not change normal-route GPS clearing rules.
- Do not require route progress to always increase.
- Do not add route-specific coordinates or IDs.
- Do not merge `detour/roadGeometry.js` with the older general geometry utilities during this work. Their signatures and calculations differ, so that consolidation needs a separate equivalence study.
- Do not require a client or Expo update unless the implementation unexpectedly changes the public client contract.

## Implementation plan

### Phase 1 — Add stable direction metadata

Files:

- `api-proxy/detourV2/detector.js`
- `api-proxy/detourV2/confirmedEventRefresh.js`
- `api-proxy/__tests__/detourV2Detector.test.js`
- `api-proxy/__tests__/confirmedEventRefresh.test.js`

Steps:

1. Normalize the existing internal `progressSortDirection` to `1` or `-1` when geometry is built.
2. Store it as `progressDirection` on each geometry segment and on the top-level primary geometry.
3. Preserve it through runtime serialization, Firestore `segments[]`, road matching, restart hydration, and trusted-geometry reuse.
4. Add one resolver for confirmed refreshes. Resolution order:
   - segment `progressDirection`;
   - top-level `progressDirection`;
   - a legacy fallback derived by projecting the stored entry and exit points onto the event's matching shape, but only when both projections are credible and their progress separation is meaningful.
5. Return `null` when direction cannot be established safely. Do not guess that progress is increasing.

Expected result: new and restored V2 events carry an explicit direction, while credible legacy active events can continue working during rollout.

### Phase 2 — Enforce direction on confirmed-event refresh

Files:

- `api-proxy/detourV2/confirmedEventRefresh.js`
- `api-proxy/detourV2/detector.js`
- focused tests listed above

Steps:

1. When a marginal refresh is armed, store the event's resolved expected direction with the pending refresh.
2. At completion, calculate observed direction from the entry and exit progress values only after the existing 75-metre traversal requirement passes.
3. Require observed direction to match both:
   - the direction stored when the refresh was armed; and
   - the event's current direction, if it is still available.
4. Keep the existing rule that the marginal point must sit between entry and exit, with the current reversal tolerance.
5. If direction is missing, contradictory, or changes during the traversal:
   - do not refresh the event heartbeat;
   - do not erase normal-route clear evidence;
   - leave normal off-route detection and clearing unchanged.
6. Add a diagnostic reason such as `confirmed-refresh-direction-mismatch` or `confirmed-refresh-direction-unknown` without creating rider-facing alerts.

### Phase 3 — Build a progress-window route slice

Files:

- `api-proxy/detour/roadGeometry.js`
- `api-proxy/detour/boundaryRefinement.js`
- `api-proxy/detourRoadMatcher.js`
- `api-proxy/__tests__/boundaryRefinement.test.js`
- `api-proxy/__tests__/detourRoadMatcher.test.js`

Steps:

1. Add a tested helper that extracts a route-shape slice between two absolute progress values, including interpolated start and end points.
2. Read the window from the segment's `detourZone` or `startProgressMeters` / `endProgressMeters`.
3. Apply a small configurable padding outside the detector window so legitimate road-level separation points are not clipped. Proposed default: 150 metres, bounded to the shape.
4. Keep the full scheduled shape for conservative route-overlap safety checks.
5. Use the windowed route slice for:
   - trimming normal-route approaches;
   - projecting refined entry and exit points;
   - building the refined skipped-route segment.
6. If the progress window is invalid or unavailable, retain the current full-shape behaviour for backward compatibility and record that the projection was not constrained.

This separation is important: the smaller slice chooses the correct occurrence on a loop, while the full shape still prevents a proposed detour path from quietly following another part of the regular route.

### Phase 4 — Regression fixtures and tests

Add these cases before enabling enforcement:

| Area | Required case | Expected result |
|---|---|---|
| Refresh direction | Increasing event, increasing traversal | Refresh accepted |
| Refresh direction | Decreasing event, decreasing traversal | Refresh accepted |
| Refresh direction | Increasing event, decreasing traversal | Refresh rejected; clear proof preserved |
| Refresh direction | Direction changes after arming | Refresh rejected |
| Refresh direction | Unknown legacy direction | No guessed direction; normal lifecycle continues |
| Persistence | Restart/hydration | Direction survives |
| Boundary projection | Self-crossing shape with two nearby occurrences | Projection stays inside the event window |
| Boundary projection | Decreasing-progress trip | Same correct physical window; path orientation preserved |
| Boundary projection | Invalid or missing progress bounds | Safe current fallback |
| Boundary safety | Detour path follows another regular-route branch | Still rejected by the full-shape overlap check |
| Route 8 regression | Shanty Bay-style narrow middle path | Alert and refined path remain eligible |
| Route 8 regression | Livingstone-style normal road match | Existing path remains unchanged |

Before implementation finishes, create a sanitized deterministic Route 8 fixture if the available production evidence can be stored safely. The repository currently has focused Shanty Bay-type tests but no named live Shanty Bay replay fixture.

### Phase 5 — Verification

Run in this order:

1. New module-level direction and progress-window tests.
2. `detourV2Detector`, `detourRoadMatcher`, `detourPublisher`, alert visibility, and client detour service tests.
3. Full app and backend test command: `npm run test:all`.
4. Synthetic lab: `npm run score:detour-synthetic-lab` and require 15/15.
5. Route 8 fixture/replay, if added.
6. `git diff --check`.
7. Final code review for accidental threshold changes, lifecycle/display mixing, and unnecessary abstractions.

## Rollout plan

1. Deploy backend only; no client update should be needed.
2. First run direction resolution in diagnostic mode for at least one normal service cycle:
   - count resolved increasing directions;
   - count resolved decreasing directions;
   - count unknown or conflicting directions;
   - confirm Route 8 active events resolve correctly.
3. Enable direction enforcement after the diagnostic counts show that valid active events are not mostly unresolved.
4. Deploy the constrained boundary projection with clear rejection/fallback logging.
5. After deployment verify:
   - scheduler health;
   - Route 8 debug output;
   - Shanty Bay alert and refined line remain visible when evidence is current;
   - no increase in `road-match-closed-overlap` or boundary-refinement fallback rates;
   - normal-route clear evidence is not being erased by rejected refreshes.

## Rollback

- Direction enforcement must have one backend switch so it can return to diagnostic-only mode without removing stored direction metadata.
- Progress-window projection should fall back to the current full-shape calculation when the window is unavailable.
- If production validation fails, roll back the backend function to checkpoint `7decd96`; no Firestore migration is required because the new fields are additive.

## Finish criteria

- Increasing and decreasing valid trips both refresh correctly.
- Opposite-direction traversals cannot refresh an event or erase clear evidence.
- Self-crossing routes select display boundaries from the correct event area.
- Shanty Bay and Livingstone regressions pass.
- Full tests and the 15-scenario synthetic lab pass.
- Production diagnostics show no meaningful rise in hidden valid detours or unsafe published paths.
- Source documentation and the validation matrix record the new behaviour and rollout evidence.

## Implementation result

- New V2 geometry stores a confirmed `progressDirection` of `1` or `-1`; weak traces do not guess a direction.
- Legacy active events can derive direction only from credible entry/exit projections on the matching shape and inside the stored event window.
- Confirmed refreshes now support `off`, `diagnostic`, and `enforce` modes. Enforcement preserves normal-route clear evidence when direction is unknown, changes after arming, or conflicts with the observed traversal.
- Route and global direction counters are exposed through detector state and route debug output.
- Refined display projection now uses the detector progress window plus 150m default padding. Full-route overlap safety remains unchanged.
- Added regression coverage for increasing and decreasing travel, opposite and changed direction, unknown enforced direction, restart persistence, legacy fallback, self-crossing routes, missing bounds, full-route overlap, and the existing Route 8 short-detour path.

## Verification result

- Focused detour suites: 265 tests passed.
- Full app and backend test command passed.
- Backend: 65 suites and 791 tests passed.
- Synthetic detour lab: 15 of 15 scenarios passed.
- `git diff --check` passed.
- No production deployment was performed. The default direction mode remains `diagnostic` for the planned staged rollout.
