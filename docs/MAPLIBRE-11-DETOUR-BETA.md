# MapLibre 11 detour-focus beta

Status: submitted to Google Play internal testing; **device gesture sign-off still required**.

Play internal AAB: https://expo.dev/artifacts/eas/cKVurwcB4MOKA3qb682F-wPIBqG51kQ35aJdO95A5Xk.aab
(EAS build `bbfb0201-2ff1-44c5-b85f-83547897b60b`; version 1.0.14 / Android
versionCode 33). Play track read-back confirmed internal `33` completed and
production `32` unchanged. No production update was made.

Earlier APK-only artifact (not the Play build): EAS build
`af7591ad-ad2a-4739-9983-d04f6acc70ae`, on the `detour-beta` channel, version
1.0.13 / code 32.

This branch upgrades native MapLibre from 10.4.2 to 11.4.0 and restores a single
camera fit when a rider explicitly selects a specific detour. Opening detour
mode, pressing map geometry, background detour updates, and returning to the
regular view remain camera-neutral. The web one-shot fit is also restored for
parity. This must not be promoted to a rider release without an Android test.

The `detour-beta` EAS profile builds an internal APK on its own update channel,
using the existing backend configuration. It does not include the separate,
unfinished Google Sign-In work. It uses the normal Android package name and
version, so installing it may replace an existing production installation;
uninstalling it may erase locally stored app data. It is not submitted to Play.

The Play internal build is the `internal-testing` AAB, with a separate OTA
channel from production. It contains the MapLibre/detour camera change only,
not the separate Google Sign-In work. Live backend readiness is limited: the
detour worker still reports GTFS baseline divergence on routes 7A, 7B, and 8B
(checked September 25, 2026). Some real detours may therefore be hidden during
this beta; do not interpret missing detours on those routes as evidence about
the map fix.

## Android beta checks

1. Open a specific detour from the active-detour banner. Confirm it fits the
   selected physical event once and both the closed route and alternate path
   are visible beyond the top and bottom controls.
2. Immediately pan away and pinch in and out repeatedly. The map must never
   snap back. Wait through several live vehicle and detour-feed updates, then
   repeat. Also test double-tap zoom.
3. Open another detour: exactly one new fit is allowed. Pan away again.
4. Return to the regular map. Center and zoom must stay where the rider left
   them. Press a detour line and enter detour mode without selecting a new
   event; neither action should refit the camera.
5. Check ordinary map interactions: stops, bus clusters, route lines, My
   Location, trip preview, and navigation follow/overview. Check map labels,
   marker taps, and live bus animation for MapLibre 11 migration regressions.

If Android still snaps back, leave automatic focus disabled. The previous
camera-neutral release is the rollback path; an APK is not a substitute for
device gesture testing.
