# Android production release preparation: 1.0.13 (32)

## Scope

Promotes the reviewed local rider improvements already preserved in internal build 31, plus destination fallback and the native rerouting ReferenceError fix. The primary dirty checkout was compared against its source snapshot (2c81a24); all non-generated uncommitted files were already represented. Runtime/build/package version is consistently 1.0.13; Android versionCode is 32. Public Play baseline is 1.0.11 (30), verified through the Android Publisher API. Internal build 31 remains distinct.

Deployment target: Google Play production using the explicit play-production submit profile, not internal-testing. No backend, rules, indexes, legal-hosting, or application web-hosting deployment is required by this change. No OTA targeting the older 1.0.11 runtime: use a new signed Play build to preserve native compatibility.

## Verification

- App suite: 251 suites / 1,538 tests passed after Android prebuild. The first run had two missing-generated-manifest failures; both passed once the required native files were generated.
- API suite: 907 tests passed.
- Production environment preflight passed; Expo Doctor 18/18 passed.
- Production dependency audit passed with existing documented build-time exceptions; API audit passed.
- Deployed Firestore rules match repository rules; no rule/index/data-access changes from production source.
- Authenticated live proxy read, public legal URLs, feedback TTL, API health/auth guards, and detour readiness checks passed.
- Captured real-feed replay resolves the exact arrival error while retaining live arrival times and refusing ambiguous destinations.
- Native rerouting regression reproduces the old ReferenceError and passes after removing the obsolete call.
- No connected Android device or browser was available for manual smoke testing. Device upgrade, interactive navigation, and rider receipt remain unverified.

## Risk and recovery

This release changes rider-facing routing behavior and is higher risk than a cosmetic patch. Do not describe automated checks as device sign-off. If a production issue is found, halt any staged rollout/review where possible and publish a corrected build with versionCode greater than 32. Do not tell users to uninstall to downgrade, because that can erase local data. Preserve the previous production build (30) and build 31 records. A runtime-compatible EAS repair is possible only after verifying the receiving build's native compatibility and production channel.

Build/submission IDs, final hashes, and Play track read-back are recorded in the release operator's timestamped receipt after completion. Preparation is not proof of publication or device delivery.

