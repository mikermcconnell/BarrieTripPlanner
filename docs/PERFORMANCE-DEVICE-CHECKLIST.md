# Device Performance Checklist (Home Map)

Use this checklist on a physical Android device first, then iOS if available.

## Setup

1. Build and run a dev client with performance logs enabled:
   - Set `EXPO_PUBLIC_PERF_DEBUG=true` in `.env`.
   - Restart Metro and reinstall app if needed.
2. Open Home screen and wait 20-30 seconds for vehicles to load.
3. Keep route filter on `All` and stops toggle `OFF` for baseline.

## Pass/Fail Targets

- Pinch-to-zoom response begins within `100ms` of gesture start.
- No visible freeze/hang longer than `250ms` during repeated pinch/zoom.
- Pan stays fluid with no major stutter while buses are visible.
- After 60 seconds of interactions, app remains responsive and no crash.
- Perf logs should not repeatedly show:
  - `Slow region handler` above `12ms`.
  - `Visible vehicles` beyond budget for extended periods.

## Test Matrix

1. Baseline zoom stress:
   - Perform 20 rapid pinch-in/pinch-out cycles.
   - Pan immediately after each pinch.
2. Stops overlay stress:
   - Toggle stops `ON`.
   - Repeat 20 pinch cycles + panning.
3. Route-filter stress:
   - Select 3 routes, then `All`, then 1 route.
   - During each state, perform pinch/pan cycles.
4. Trip planner stress:
   - Enter trip mode and type in origin/destination fields for 20 seconds.
   - While keyboard is open, return focus to map and pinch/pan.
5. Long run:
   - Interact with map continuously for 2 minutes.

## Capture Template

- Device model:
- OS version:
- Build type:
- Scenario:
- Result: Pass/Fail
- Worst observed stall (ms):
- Logs (`[perf][home-map]` lines):

## If Failures Are Seen

1. Note exact scenario and route/stops state.
2. Capture `Slow region handler` and `Visible` warnings.
3. Re-test with:
   - Stops OFF
   - Single route selected
   - Trip planner closed
4. Compare results to isolate which layer causes regressions.
