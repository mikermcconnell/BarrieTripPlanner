# MapLibre 11 detour-focus beta

Status: isolated Android beta; **device gesture sign-off still required**.

Internal APK build: https://expo.dev/accounts/mrmcconn/projects/barrie-transit-planner/builds/af7591ad-ad2a-4739-9983-d04f6acc70ae
(finished September 25, 2026; `detour-beta` channel; version 1.0.13 / Android
versionCode 32). No Play submission or production update was made.

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
