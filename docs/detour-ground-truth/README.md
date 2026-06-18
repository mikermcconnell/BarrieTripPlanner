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

## Current cases

- `route-10-mulcaster-simcoe-2026-05-26.json` — Route 10 active Mulcaster/Simcoe detour validation case.
- `route-11-mulcaster-simcoe-2026-05-26.json` — Route 11 active Mulcaster/Simcoe detour validation case.
- `route-12b-bayfield-sophia-2026-06-05.json` — Route 12B short Bayfield/Sophia detour case with no skipped stops and no distant notice impacts.

