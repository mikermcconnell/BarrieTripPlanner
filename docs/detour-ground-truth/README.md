# Detour Ground Truth Validation

This folder stores operator-supplied validation cases for the auto-detour detector.

These files are **not** route-specific hardcoded detours. They are ground-truth checks used to confirm that live or saved `activeDetours` / `activeDetourEventsV2` output matches known closures and detour paths.

## Workflow

1. Capture one detour at a time.
2. Record:
   - route ID
   - whether it should be active now
   - closed section start/end
   - expected detour path waypoints in order
   - expected skipped stop codes, if any
   - disallowed distant notice source IDs or stop codes, if any
   - source and capture time
3. Run the deterministic saved-snapshot check:

```powershell
npm run validate:detour-ground-truth
```

The npm shortcut validates the Route 10 ground-truth case against a saved active-detour snapshot so it can be used as a stable regression check.

To validate against live `activeDetours`, pass `--source live` directly:

```powershell
node scripts\validate-detour-ground-truth.js --fixture docs\detour-ground-truth\route-10-mulcaster-simcoe-2026-05-26.json
```

To validate a saved V2 event snapshot:

```powershell
node scripts\validate-detour-ground-truth.js --fixture docs\detour-ground-truth\route-12b-bayfield-sophia-2026-06-05.json --active-detours-json logs\live-route-12b-active-detour-events-v2.json
```

4. If validation fails, inspect detector output before changing code.
5. Fix detector logic only when a ground-truth failure proves the issue.
6. Re-run app/API tests before moving to the next route.

## Corpus scoring

Run the deterministic production-quality corpus with:

```powershell
npm run score:detour-quality
```

The corpus manifest is `quality-corpus.json`. It supports:

- `ground-truth-output` cases that score saved active-detour output for detection, path, stop-impact, and duplicate-publication quality;
- `detector-replay` cases that restore detector/runtime snapshots and verify safety decisions exactly.
- `synthetic-detector-suite`, which runs 15 test-only GPS traces through the real V2 detector at 30-second ticks.

Run only the synthetic lab with:

```powershell
npm run score:detour-synthetic-lab
```

The synthetic lab currently covers Routes 2, 7, 8, 11, and 12 with five positive detours, five false-positive/safety traps, and five clearing/restart lifecycle cases. The scenarios are defined in `scripts/detourSyntheticScenarios.js`; the tick runner is `scripts/detourV2Replay.js`.

The report separates labelled precision/recall from output quality. A short-lived event is only a review signal; it is not automatically a false positive. Add inactive/normal-service cases as well as real detours so recall and precision are both meaningful.

`regressionPass` means every checked-in case still behaves as labelled. `productionReadiness.ready` is intentionally stricter: the default corpus minimums are 20 labelled cases, at least 10 real detours, 10 normal-service cases, 10 path cases, five stop-impact cases, and five safety replays, plus the documented accuracy targets and zero duplicate publications. The starter corpus should pass regressions while remaining `productionReadiness.ready: false` until it is expanded.

Synthetic results appear only under `syntheticLab` with `countsTowardProductionReadiness: false`. They can catch regressions sooner, but they never increase real precision, recall, operator-review counts, or production sample minimums.

## Current cases

- `route-10-mulcaster-simcoe-2026-05-26.json` — Route 10 active Mulcaster/Simcoe detour validation case.
- `route-11-mulcaster-simcoe-2026-05-26.json` — Route 11 active Mulcaster/Simcoe detour validation case.
- `route-12b-bayfield-sophia-2026-06-05.json` — Route 12B short Bayfield/Sophia detour case with no skipped stops and no distant notice impacts.
- `normal-service-observation-2026-07-09-1607.json` — corrected normal-routing snapshot with a fresh 31-vehicle feed; contributes eight clean true-negative route cases. Route 8B was removed after its official July 6 to September 4 Shanty Bay detour was confirmed.
- `normal-service-2026-07-14-route-8a-downtown-hub-egress.json` — operator-confirmed Route 8A normal terminal egress through Simcoe/Mary/Dunlop; the corrected detector output must contain no rider-visible Route 8A detour.
- `review-queue-2026-07-09.md` — prioritized production cases awaiting operator labels.

