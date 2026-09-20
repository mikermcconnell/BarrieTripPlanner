# Android internal testing candidate

## Release boundary

- Candidate: 1.0.12, Android version code 31.
- Verified current Play production release: 1.0.11 (30).
- Branch: `release/android-internal-20260920`.
- Preserved local snapshot: `2c81a24`; incorporated production source `23362d6`.
- Target: Google Play **internal** track, EAS **internal-testing** channel.
- Production track, production OTA channel, backend and Firebase rules are not deployed by this task.
- Original protected checkout is preserved. Generated files and credentials are not committed.

## Included work

Local rider-trust, walking validation, cancellation and progressive preview changes
are integrated with production service-date handling, stale-feed status, map-provider
authentication, crash reporting and map-rendering safeguards. The candidate keeps
the larger route pool through walking checks and ranks live-feasible alternatives
before hiding similar results. Main-map selections remain camera-neutral.

Internal testing explicitly enables the Android trip-map preview so its native
transitions can be tested on a phone. The production profile is unchanged.

Security review found new dependency advisories. The candidate updates js-yaml to
4.3.2 or later and the web-only maplibre-gl package to 6.10.0 or later. The native
MapLibre package is unchanged. No additional audit exemptions were introduced;
existing documented Metro image-parser build-time exemptions remain.

## Verification and release procedure

The release gate checks app/API tests, version identity, production environment,
Expo health, dependency audits, anonymous authenticated proxy access, detour
readiness, legal pages, Firestore retention and protected-route authentication.
Deployed Firestore rules were separately compared with the release source and match.
No persistence shape or permission changes relative to production require rule deployment.

Pre-build evidence: 249 app suites / 1,507 tests and 76 API suites / 907 tests
passed; Expo Doctor passed 18/18; the full live-readiness gate passed; production
web export succeeded after the web-map security update. Interactive browser smoke
testing could not run because no browser was available to the UI tool. No phone
or upgrade test is claimed complete.

Use `scripts/build-release.ps1 -InternalTesting` from a clean, synchronized
`release/*` branch. Submit only using the named `internal-testing` profile and the
exact verified build ID, never `--latest`. Verify the internal track after submission
and confirm production still serves version code 30.

## Phone acceptance checklist

1. Join internal testing using the Google account on the phone, then update through Play
   without uninstalling or clearing data.
2. Confirm version 1.0.12; verify sign-in, saved trips, favorites and settings survive.
3. Test cold/warm launch, first/repeat searches, early preview, alternatives and navigation.
4. Change endpoints/time during a slow search; verify no old route returns.
5. Test offline startup, weak network, background/resume and recovery.
6. Check detours, arrive-by trips, transfers and midnight service; compare with current notices.
7. Check large text, TalkBack, back gestures and Android bottom-button spacing.

This is not production sign-off. Device performance and upgrade behavior require
the phone test. Web dependency export/smoke checks do not replace browser release QA.

## Recovery

Production remains untouched. If the test fails, stop the internal release and ship
a corrected internal build with a higher version code. Android will not install an
older production version over build 31 without uninstalling, which can erase local data.
Do not uninstall merely to troubleshoot an upgrade test.
