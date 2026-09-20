# Startup and trip preview performance

Reviewed and implemented locally: 2026-09-20. Not built or deployed.

## Scope and acceptance criteria

Remove unnecessary startup/search waits; make the first validated route available
before alternatives finish; bound slow requests and suppress cancelled results.
Preserve walking, requested-time, live-prediction, detour and navigation safety checks.
Verification requires repeatable timing/ordering tests plus routing and hook regressions.
Existing unrelated work must remain intact.

## Changes

- `src/context/TransitContext.js`: display saved map data without waiting for network
  detection; build routing without waiting for cache persistence; share in-progress
  schedule downloads and avoid invalidating routing built from the same data.
- `src/utils/requestControl.js`: bounded async work and cancellable delays.
- `src/services/walkingService.js`: 15-second walking deadlines, cancellation,
  shared request spacing, background cache writes, and conservative early candidates.
- `src/services/tripService.js`: propagate cancellation and early candidates;
  retain original requested-time checks. On-demand adjusted trips remain atomic.
  OTP cancellation remains connected through response-body loading.
- `src/services/tripDelayService.js`: bound the batch prediction wait, retaining
  existing schedule fallback and freshness rules.
- `src/hooks/useTripPlanner.js`: 45-second planning deadline, live/detour checking
  before early display, stable selection while alternatives arrive, final-only
  history saving, cancellation on edits/reset/unmount, and removal of an early
  preview if final validation fails.
- Native/web `TripBottomSheet` and `HomeScreen` wiring: show progress phases and
  explain that alternatives are still being checked. No map-layer redesign.

## Repeatable evidence

`walkingPerformance.test.js` uses six candidates with twelve unique walking legs,
550 ms request spacing and mocked 50 ms responses:

| Measurement | Result |
| --- | --- |
| Previous all-candidate walking gate | 6,100 ms simulated |
| First verified walking candidate callback | 600 ms simulated |
| Complete candidate batch | Still 6,100 ms simulated |
| Repeat identical walking search | Zero additional requests |
| Stalled walking provider | Estimated fallback after 15 seconds |
| Concurrent request starts | 0, 550, 1,100 ms |

The 600 ms figure measures the service callback, not screen paint, startup, or
end-to-end live validation. The UI also checks live predictions and detours before
display. Early and final prediction checks may add work; total search duration is
not claimed to improve by the same amount.

Startup tests execute actual callback bodies with controlled dependencies (not a
mounted provider): saved map data appears while connectivity is unresolved, routing
finishes while persistence is unresolved, offline/no-cache still errors, and a
completed search avoids a redundant background download.

Additional coverage: actual local router plus walking enrichment obey original
request bounds; live-invalid previews are rejected; final failures remove previews;
reset/time edits suppress late callbacks/history; cancelled shared-routing consumers
do not launch stale searches; web results remain rendered during refinement;
OTP body cancellation remains connected; timers/listeners clean up.

## Verification boundaries

- App Jest suite: **231 suites / 1,397 tests passed** (21.608 seconds).
  `git diff --check` passed. Full log: `full-final.log` in the artifact directory.
- Tests added/extended: `requestControl`, `walkingPerformance`,
  `transitStartupCriticalPath`, `tripPlannerRegression`, `tripService`, and
  `riderTrustRoutingIntegration` under `src/__tests__/`.
- No physical-device timing, native visual/accessibility sign-off, or browser
  end-to-end performance measurement completed. Do not interpret simulated timings
  as a production speedup guarantee.
- Shared GTFS setup and underlying prediction fetches can continue after a consumer
  stops waiting. Deadlines bound waiting and prevent stale publication; they do not
  interrupt synchronous routing computation or guarantee physical network aborts.
- If refinement fails, clear the preview and offer the existing error/retry path
  rather than retain a potentially invalid route.
- No Firestore shapes, permissions, indexes, authentication or write contracts changed.
  No rule deployment/live writes required for this slice. No build, commit or release.
- Tracked diffs outside the performance edit set match the saved pre-change diff.

## Next work

1. Measure cold/warm launch, first/repeat search and cancellation on an installed
   Android build, including weak-network conditions; check native preview transitions.
2. Consider a versioned persistent timetable cache to avoid repeat schedule downloads.
3. Isolate frequently updating diagnostics from static-data consumers to reduce renders.

Local logs and pre-change diff: `%TEMP%/bttp-perf-patch-24056fc6/`.
