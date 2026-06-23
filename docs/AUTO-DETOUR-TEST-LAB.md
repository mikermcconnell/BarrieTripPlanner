# Auto-Detour Test Lab

Use this checklist when testing BTTP detour display with simulated records.

## Safety rules

- Use this only in development or lab validation.
- Clear simulated detours before and after each testing session.
- Publish one regular detour at a time unless you are deliberately testing multiple alerts.
- Edge fixtures are intentionally bad or suppressed; they should not become regular presets.
- Replayed observed records are detector evidence, not proof that the historical detour was operationally correct.
- Never clear or overwrite real records; the runner only targets simulated/test records.

## Runner commands

List regular presets:

```powershell
node scripts/detour-test-runner.js list
```

List edge fixtures:

```powershell
node scripts/detour-test-runner.js edge-list
```

List observed replay cases:

```powershell
node scripts/detour-test-runner.js observed-list
```

Publish a regular preset:

```powershell
node scripts/detour-test-runner.js publish wellington-owen-grove --duration=30
```

Publish an edge fixture:

```powershell
node scripts/detour-test-runner.js publish-edge closed-overlap-hidden --duration=30
```

Publish an observed replay:

```powershell
node scripts/detour-test-runner.js publish-observed route-10-mulcaster-simcoe-jun3 --duration=30
```

Check currently published simulated records:

```powershell
node scripts/detour-test-runner.js verify
```

Clear all simulated detours:

```powershell
node scripts/detour-test-runner.js clear all
```

The runner defaults to V2 storage (`activeDetourEventsV2`) and uses simulated document IDs.

## Regular detour visual checklist

For each regular preset, confirm:

- the detour alert appears;
- route chips and labels are readable;
- the closed regular route segment is visible and masked correctly;
- the likely detour path follows local streets;
- entry and exit points make sense for the route direction;
- the likely path does not add a turn only to touch an artificial endpoint after regular service has resumed;
- skipped stops, if shown, are route-scoped and credible;
- clearing removes the alert, route mask, labels, and stop markers.

Route 2 calibration check:

- for `dunlop-ferndale-anne`, Route `2B` should continue on Anne at the service rejoin and must not turn onto Dunlop only to touch the artificial endpoint.

Recommended order:

1. `dunlop-ferndale-anne`
2. `wellington-owen-grove`
3. `yonge-bigbay-little`
4. `farmers-market`
5. `saunders-welham`

## Observed replay checklist

Observed replays clone historical detector geometry into simulated active records so current frontend and normalization behavior can be reviewed.

Current observed replay cases:

- `route-12b-hooper-jun3` — normal rider-visible Hooper Road replay.
- `route-12a-hooper-jun4` — paired 12A/12B grouping and direction-specific geometry.
- `route-8a-downtown-jun4` — downtown short closure, OSRM refreshed path, label placement.
- `route-10-mulcaster-simcoe-jun3` — loop route, cleaned repeated-trip geometry, route masking.
- `route-11-mulcaster-simcoe-jun3` — multi-route downtown grouping.
- `route-100-mulcaster-simcoe-jun3` — downtown loop grouping.
- `route-101-mulcaster-simcoe-jun3` — old out-and-back artifact protection.

For observed replays, confirm:

- the likely path reaches the closed-segment gates or has current handoff stitching;
- old repeated-trip geometry is collapsed into one clean representative path;
- OSRM refresh is used when the historical path was not road-snapped;
- route-specific paths remain operationally plausible;
- shared downtown events group into one rider-facing card when appropriate;
- regular route masking does not leave duplicate/parallel route lines through the detour area.

## Edge fixture checklist

Use edge fixtures to verify bad geometry is hidden or suppressed.

Current edge fixtures:

- `closed-overlap-hidden` — event may appear, but likely path should not draw over the closed route.
- `tiny-span-long-path-hidden` — event may appear, but the unrealistic long likely path should not draw.
- `same-stop-out-and-back-hidden` — event should be hidden from riders.
- `clear-pending-visible-valid-path` — stale/clear-pending valid geometry remains visible.
- `circuitous-osrm-route-hidden` — circuitous OSRM result is suppressed.
- `osrm-failed-inferred-visible` — OSRM failure does not hide a trusted inferred path.
- `osrm-failed-unsafe-inferred-hidden` — unsafe inferred fallback is suppressed.
- `long-label-text-visible` — long banner/card/path labels remain readable.
- `many-affected-stops-visible` — large affected/skipped stop sets do not break layout.

For edge fixtures, confirm:

- no misleading purple path is drawn when geometry is unsafe;
- valid fallback geometry can still render when OSRM fails;
- the app does not fall back to stale top-level geometry;
- the alert strip follows the `riderVisible` setting;
- clear-pending/stale metadata is not used by the client as a hide rule when `riderVisible` remains true;
- long labels, route chips, and stop lists wrap or collapse without clipping;
- clearing removes the fixture.

## Multi-route chip stress test

For a large route-chip stress test, publish grouped simulated records with the shared event ID `simulated:edge:many-route-chips-visible`.

Expected behavior:

- one rider-facing event/card;
- first few route chips shown with a `+N` overflow indicator;
- no clipped chips or overlapping text;
- details sheet remains readable.

## Manual validation order

A practical regression pass is:

1. one regular preset, such as `dunlop-ferndale-anne`;
2. one observed replay with handoff stitching, such as `route-10-mulcaster-simcoe-jun3`;
3. one paired route replay, such as `route-12a-hooper-jun4` plus `route-12b-hooper-jun3`;
4. one suppressed unsafe geometry fixture, such as `closed-overlap-hidden`;
5. one OSRM failure fixture, such as `osrm-failed-inferred-visible`;
6. one layout stress fixture, such as `long-label-text-visible` or `many-affected-stops-visible`;
7. clear all simulated detours and verify no simulated records remain.

## Test commands

Backend simulation tests:

```powershell
npm --prefix api-proxy test -- detourSimulation.test.js
```

Related backend geometry tests:

```powershell
npm --prefix api-proxy test -- detourRoadMatcher.test.js segmentValidity.test.js detourPublisher.test.js
```

Frontend overlay tests:

```powershell
npm test -- detourOverlays.test.js detourIntegration.test.js detourRouteMasking.test.js
```

## Environment

For Firestore publishing and clearing, set Firebase Admin credentials:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\Users\Mike McConnell\Documents\secrets\bttp-firebase-admin.json"
```

Optional road matching for publish commands:

```powershell
node scripts/detour-test-runner.js publish yonge-bigbay-little --road-match
```
