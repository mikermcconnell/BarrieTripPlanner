# Detour Ground Truth Validation

This folder stores operator-supplied validation cases for the auto-detour detector.

These files are **not** route-specific hardcoded detours. They are ground-truth checks used to confirm that live or saved `activeDetours` output matches known closures and detour paths.

## Workflow

1. Capture one detour at a time.
2. Record:
   - route ID
   - whether it should be active now
   - closed section start/end
   - expected detour path waypoints in order
   - source and capture time
3. Run the validator against live `activeDetours`:

```powershell
node scripts\validate-detour-ground-truth.js --fixture docs\detour-ground-truth\route-10-mulcaster-simcoe-2026-05-26.json
```

4. If validation fails, inspect detector output before changing code.
5. Fix detector logic only when a ground-truth failure proves the issue.
6. Re-run app/API tests before moving to the next route.

## Current cases

- oute-10-mulcaster-simcoe-2026-05-26.json — Route 10 active Mulcaster/Simcoe detour validation case.
- oute-11-mulcaster-simcoe-2026-05-26.json — Route 11 active Mulcaster/Simcoe detour validation case.

