# Auto-Detour Code Cleanup

Date: 2026-07-17
Status: Complete
Checkpoint: `20e603d5711f0369ec13c637729c256362622422`

## Goal

Make the short-detour and refined-map-path code easier to understand and adjust without changing its current behaviour.

## Finish line

- Confirmed-event refresh rules have one clearly named owner and direct tests.
- Refined public-map geometry fields are defined and copied in one place.
- Boundary-refinement calculations no longer make the road-matching workflow difficult to read.
- Lifecycle geometry and rider display geometry remain separate.
- Focused detour tests, the full test suite, and the synthetic detour lab pass.
- The source-of-truth detour documentation identifies the new module boundaries.

## Plan

1. Extract confirmed-event refresh matching, arming, and completion from `detourV2/detector.js` into `detourV2/confirmedEventRefresh.js`.
2. Add small unit tests for the extracted refresh state machine before removing the inline implementation.
3. Create `detour/displayGeometry.js` as the shared contract for refined rider-map fields, defaults, clearing, and copying.
4. Extract the boundary-refinement calculations from `detourRoadMatcher.js` into `detour/boundaryRefinement.js` while keeping conservative path checks unchanged.
5. Replace repeated field-by-field display geometry handling in the road matcher and publisher with the shared helper.
6. Update `docs/AUTO-DETOUR-DETECTION.md` with the resulting ownership boundaries.
7. Run focused tests after each extraction, then run all app and backend tests and the synthetic detour lab.
8. Review the final diff for unnecessary layers, unclear names, and remaining duplication.

## Guardrails

- This is a structure-only cleanup. Do not change detection thresholds, confidence gates, or rider visibility rules.
- Keep normal-route lifecycle boundaries separate from refined public display boundaries.
- Do not add a simple increasing-progress direction check. Some valid route shapes use decreasing progress.
- Do not deploy this cleanup unless Mike asks for deployment after review.
- If an extraction needs a complicated dependency framework, keep the working code together instead.

## Deferred recommendations

- Confirmed-event refresh still needs a future direction-aware rule that supports both increasing and decreasing route progress.
- Looping or self-crossing routes may later need display-boundary projections constrained to the detector's original progress window.

## Completed work

- Moved confirmed-event refresh matching, arming, and completion into a 150-line focused module.
- Moved road geometry and boundary refinement out of the road-matcher workflow.
- Replaced repeated refined display field handling with one shared contract.
- Reduced `detourV2/detector.js` from 4,892 to 4,799 lines.
- Reduced `detourRoadMatcher.js` from 1,618 to 1,211 lines.
- Added direct tests for all three new ownership boundaries.
- Updated the source-of-truth detour documentation.

## Verification

- Full app and backend test command passed.
- Backend: 65 suites and 780 tests passed.
- Synthetic detour lab: 15 of 15 scenarios passed, including all path, safety, lifecycle, stop-impact, and clear checks.
- The live Shanty Bay path was verified before checkpoint `20e603d`; this local structure-only cleanup was not deployed.
- `git diff --check` passed.
