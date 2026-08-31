# Barrie Transit Trip Planner

A React Native mobile app for real-time transit information in Barrie, Ontario.

## Documentation Guide

Read docs in this order:

1. [AGENTS.md](./AGENTS.md) for repo context, load order, and what not to trust by default
2. this README for current setup, scripts, and product surface
3. [docs/API-PROXY-OPERATIONS.md](./docs/API-PROXY-OPERATIONS.md) for backend deployment and auth
4. [docs/AUTO-DETOUR-DETECTION.md](./docs/AUTO-DETOUR-DETECTION.md) for detour feature behavior
5. [docs/AUTO-DETOUR-VALIDATION-MATRIX.md](./docs/AUTO-DETOUR-VALIDATION-MATRIX.md) when working on auto-detour quality, regressions, or launch readiness
6. [docs/TESTING.md](./docs/TESTING.md) for the current automated + manual testing approach

Working notes in [`docs/plans/`](./docs/plans/) are non-default context. Start with [`docs/plans/README.md`](./docs/plans/README.md) if you need them.

## Features

- Real-time bus tracking with live vehicle positions
- Interactive map with route polylines
- Stop search and information
- Trip planning with integrated trip details and navigation
- Local-first My Trips with editable, real-time collaboration links
- Service alerts and detour overlays
- Official MyRide holiday-service notices with advance in-app and opted-in push reminders
- Platform maps for major transit hubs from the City of Barrie source PDF
- Favorites and account-backed rider preferences
- Supporting profile flows for news, surveys, and settings

## Current Product Surface

Core v1 features:

- map
- stop and route search
- arrivals
- trip planning
- navigation
- alerts
- favorites

Supporting features:

- onboarding
- profile and auth utilities
- transit news
- surveys
- settings

## Prerequisites

- Node.js 18+ installed
- Android Studio / emulator if doing native Android development
- Expo account only if you need EAS builds or Expo-hosted services

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Android Firebase services file:**

   Android builds require `google-services.json`.

   - Local/dev: place the file at `./google-services.json`
   - EAS cloud builds: set `GOOGLE_SERVICES_JSON` as an EAS file secret (preferred)

   `app.config.js` loads `GOOGLE_SERVICES_JSON` automatically when present.

3. **Configure environment variables:**

   For full feature parity in development, copy `.env.example` to `.env` and fill required values:
   - `EXPO_PUBLIC_API_PROXY_URL`
   - `LOCATIONIQ_API_KEY` (for local `proxy-server.js` / `api-proxy`)
   - `EXPO_PUBLIC_FIREBASE_*`
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` for native Google sign-in
   - `EXPO_PUBLIC_SENTRY_DSN` for production crash/error delivery
   - `SENTRY_AUTH_TOKEN` as a sensitive EAS production variable for readable source maps
   - Optional fallback OTP backend: `EXPO_PUBLIC_OTP_URL`
   - Keep `EXPO_PUBLIC_ALLOW_DIRECT_LOCATIONIQ=false` for production/public builds
   - Keep `EXPO_PUBLIC_API_PROXY_TOKEN` empty for production/public builds

4. **Choose a development path:**

   Native Android:
   ```bash
   npm run android:dev
   ```

   Web:
   ```bash
   npm run web:dev
   ```

   Optimized static web export:
   ```bash
   npm run web:export
   ```

   General Expo server only:
   ```bash
   npm start
   ```

   `npm start` is useful for generic Expo workflows, but the main day-to-day paths for this repo are `android:dev`, `android:stable`, and `web:dev`.

## Android Emulator Quick Start (Recommended)

When working in Android emulator, use one of these commands instead of manual Metro setup:

### Android UI Safe-Area Gotcha

Android's system navigation bar can cover bottom-aligned UI. For full-screen loading screens, modals, maps, or bottom action controls, use the helpers in `src/utils/androidNavigationBar.js` so content sits above the nav bar.

- `npm run android:stable`
  - Most reliable path.
  - Builds/installs release, then launches.
  - Does not rely on Metro streaming.
  - `npm run android` now maps to this stable path.

- `npm run android:stable:launch`
  - Launch only (skip rebuild).
  - Use this after a successful `android:stable` if you only want to reopen quickly.

- `npm run android:dev`
  - Development path with live reload.
  - Runs recovery, starts Metro, starts any required local proxy, then launches the app.
  - The proxy avoids emulator bundle transfer issues seen with direct Metro streaming.
  - This is the preferred native development path for the current app.
  - It starts the local auto-detour worker on `http://127.0.0.1:3002` only when both `EXPO_PUBLIC_ENABLE_AUTO_DETOURS=true` and `DETOUR_DEV_WORKER_ENABLED=true`.
  - Before enabling the worker, point `EXPO_PUBLIC_ACTIVE_DETOURS_COLLECTION` at the isolated dev collection (default `devActiveDetourEventsV2`).

- `npm run android:dev:launch`
  - Fast relaunch path when Metro is already running.
  - Reuses the existing dev server, resets adb reverse ports, and opens the Expo dev-client URL.
  - Use this after a successful `android:dev` when you only need to reopen the app.

- `npm run android:dev:clear`
  - Same as `android:dev`, but clears the Metro cache first.
  - Use this only when Metro cache problems are suspected; clearing the cache makes startup slower.

- `npm run android:dev:direct`
  - Direct Metro on `8083` without proxy.
  - Use only if you explicitly want to bypass the proxy.

- `npm run android:recover`
  - Kills stale Metro/proxy processes and clears adb reverse mappings.
  - Use this if emulator startup gets stuck on loading/bundling.

- `npm run android:stable:rebuild`
  - Forces a fresh release rebuild/install, then launches.

### Android Emulator Troubleshooting

- Slow relaunch after Metro is already running:
  - Use `npm run android:dev:launch`, not a full `android:dev` restart.

- Red console says a package cannot be resolved, but the package exists in `node_modules`:
  - Example: `Unable to resolve module expo-asset`.
  - Confirm the package resolves:
    ```bash
    node -e "console.log(require.resolve('expo-asset'))"
    ```
  - Restart Metro with a clean cache:
    ```bash
    npm run android:dev:clear
    ```
  - Then relaunch:
    ```bash
    npm run android:dev:launch
    ```

- Emulator boot itself is slow:
  - Check emulator logs for `Failed to load snapshot 'default_boot'`.
  - If present, close the emulator and delete only:
    `C:\Users\Mike McConnell\.android\avd\BTTP_Emulator.avd\snapshots\default_boot`
  - Start the emulator once, then shut it down cleanly so Android Studio creates a fresh quick-boot snapshot.

When auto-detour testing is enabled locally, `npm run android:recover` also stops the local detour worker. The worker is fail-closed by default; set `DETOUR_DEV_WORKER_ENABLED=true` only for an intentional isolated test run.
For rider-visible detour testing, `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON` must point to valid Firebase Admin credentials so the worker can publish to Firestore.

### Web Development (CORS Proxy Required)

Barrie GTFS feeds do not expose browser CORS headers, so web mode must use a proxy.
The web app uses the repo's MapLibre GL JS renderer and expects proxied GTFS/geocoding access.

Run web with the local proxy:
```bash
npm run web:dev
```

Web development keeps GTFS traffic on the local CORS proxy and uses the
configured authenticated API proxy for LocationIQ geocoding. The LocationIQ
key remains server-side; do not add it as an `EXPO_PUBLIC_*` variable.

If you use a deployed proxy instead, set:
- `EXPO_PUBLIC_CORS_PROXY_URL`
- or `EXPO_PUBLIC_API_PROXY_URL` (with a `/proxy?url=` endpoint)
- Optional hardened proxy token headers:
  - `EXPO_PUBLIC_CORS_PROXY_TOKEN`
  - `EXPO_PUBLIC_API_PROXY_TOKEN`
  - Use token headers only for internal/non-public clients; public production should use Firebase Bearer auth.

Hosted web builds do not auto-fallback to `localhost`; configure one of the proxy URLs above.
For public clients, do not ship `EXPO_PUBLIC_LOCATIONIQ_API_KEY` in app builds.

## Project Structure

```
src/
├── components/     # Reusable UI components
├── config/         # Configuration and constants
├── context/        # React Context providers
├── navigation/     # Navigation setup
├── screens/        # App screens
├── services/       # API and data services
└── utils/          # Helper functions
```

## Testing

BTTP has two separate automated test surfaces:

- app tests from the repo root
- backend tests for `api-proxy/`

Use:

```bash
npm test
```

to run the app suite, or:

```bash
npm run test:all
```

to run both the app and API proxy suites.

Additional commands:

```bash
npm run test:app
npm run test:api
npm run score:detour-quality
```

`score:detour-quality` replays the checked-in detector safety case and scores saved rider output against operator-supplied ground truth. Add every confirmed production issue to this corpus before treating a fix as complete.

The full testing strategy, mock guidance, and manual smoke checklist live in [docs/TESTING.md](./docs/TESTING.md).

## Data Sources

- **Static GTFS:** http://www.myridebarrie.ca/gtfs/Google_transit.zip
- **Real-time Vehicle Positions:** http://www.myridebarrie.ca/gtfs/GTFS_VehiclePositions.pb
- **Real-time Trip Updates:** http://www.myridebarrie.ca/gtfs/GTFS_TripUpdates.pb
- **Service Alerts:** http://www.myridebarrie.ca/gtfs/GTFS_ServiceAlerts.pb

Data provided by [Barrie Transit](https://www.barrie.ca/transit).

Trip-planning search also includes a researched [local Barrie landmark catalogue](./docs/LOCAL-LANDMARK-CATALOGUE.md) for common names, abbreviations, and former facility names.

## Planning Notes

Dated plans and working notes live under [`docs/plans/`](./docs/plans/).
They are useful background, but they are not default source-of-truth context.

Start with:

- [docs/plans/README.md](./docs/plans/README.md)
- [docs/plans/2026-03-07-phase-0-3-deliverables.md](./docs/plans/2026-03-07-phase-0-3-deliverables.md)
- [docs/plans/2026-03-07-app-stabilization-roadmap.md](./docs/plans/2026-03-07-app-stabilization-roadmap.md)

## Server-Side Detour Feed (New)

The app can now consume a shared Firestore detour feed produced by the backend worker (instead of relying only on on-device detection).

### Backend setup (`api-proxy`)

The backend deployment/auth/ops model is documented in [docs/API-PROXY-OPERATIONS.md](./docs/API-PROXY-OPERATIONS.md).

1. Install backend dependencies:
   ```bash
   cd api-proxy
   npm install
   ```
2. Set environment variables:
   - `DETOUR_WORKER_ENABLED=true`
   - `DETOUR_DATA_ENVIRONMENT=production` in production; local workers use `development` plus isolated dev collections
   - `DETOUR_DETECTOR_VERSION=v2`, `DETOUR_ACTIVE_COLLECTION=activeDetourEventsV2`, `DETOUR_HISTORY_COLLECTION=detourEventHistoryV2`, and `DETOUR_RUNTIME_STATE_DOC=detourRuntimeV2` are the production storage contract
   - `DETOUR_WORKER_MODE=manual` for local/ad hoc testing, or `scheduled` for low-cost production with Cloud Scheduler calling `POST /api/detour-run-once` every 60 seconds; use `interval` only for the legacy always-on loop
   - `DETOUR_HISTORY_ENABLED=true` (default true)
   - `DETOUR_HISTORY_RETENTION_DAYS=30` (default 30; set `<=0` to disable automatic pruning)
   - `DETOUR_BURST_SAMPLING_ENABLED=false` for normal scheduled production; burst sampling is diagnostic only
   - `DETOUR_DETECTOR_VERSION=v2`, `DETOUR_VEHICLE_TRACE_WINDOW_MS=1200000`, and the headway-aware candidate defaults (`2700000` fallback, `1.25` headway multiplier, `600000` buffer, `5400000` cap) keep event-scoped storage and bounded backend memory for low-frequency route confirmation
   - `BASELINE_AUTO_INIT=false` (prevents seeding the baseline from live GTFS during an active detour)
   - `DETOUR_REQUIRE_SAFE_BASELINE=true` (blocks detection until a trusted baseline is loaded)
   - `FIREBASE_SERVICE_ACCOUNT_JSON=...` (or `GOOGLE_APPLICATION_CREDENTIALS`)
   - `LOCATIONIQ_API_KEY=...` (still required for existing proxy routes)
   - `REQUIRE_API_AUTH=true`
   - `REQUIRE_FIREBASE_AUTH=true` (recommended/required for production)
   - `ALLOW_SHARED_TOKEN_AUTH=false` (recommended/required for production)
   - `SURVEY_ADMIN_UIDS=...` only if you cannot use Firebase admin/surveyAdmin custom claims
   - `APP_FEEDBACK_ADMIN_UIDS=<developer Firebase UID>` to restrict the private app-feedback inbox
   - `ALLOWED_ORIGINS=...` (required for browser clients)
   - Optional non-production token auth: `API_PROXY_TOKEN=...` (or `API_PROXY_TOKENS=token1,token2`)
3. Start backend:
   ```bash
   npm start
   ```
4. Verify worker status:
   - `GET /api/health`
   - `GET /api/detour-status`
   - `POST /api/detour-run-once` (recommended in manual/scheduled mode)
   - `GET /api/news-status`
   - `POST /api/news-run-once` (for scheduled/manual MyRide news sync)
   - `GET /api/detour-logs?limit=100`
     - Optional filters: `routeId`, `eventType` (comma-separated), `start`, `end`
     - Log event types: `DETOUR_DETECTED`, `DETOUR_UPDATED`, `DETOUR_CLEARED`

### Detour email alerts

Newly detected detours can trigger email alerts through the scheduled **Detour Email Monitor** GitHub Actions workflow.

- Workflow: `.github/workflows/detour-email-monitor.yml`
- Script: `npm --prefix api-proxy run detour:email-monitor`
- Default trigger: every 5 minutes
- Default alert type: first-time `DETOUR_DETECTED` events only
- Dedupe store: Firestore `detourEmailNotifications`

Required GitHub secrets:

- `DETOUR_ALERT_RECIPIENTS` — set to `michaelryanmcconnell@gmail.com`
- `RESEND_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`

Optional GitHub secrets:

- `DETOUR_ALERT_FROM`
- `DETOUR_ALERT_APP_URL`

Detour emails are text-only and enrich stop codes with GTFS stop names when available.

### Firestore rules

Deploy updated rules so clients can read:
- `activeDetourEventsV2/*` and `detourEventHistoryV2/*` for the production event feed
- dev active/history collections only when local isolated testing is intentionally enabled
- legacy `activeDetours/*`, `detourHistory/*`, `activeDetoursV2/*`, and `detourHistoryV2/*` remain read-only archive/audit data and are not production sources of truth

Shared trips also require:

- Firebase Anonymous Authentication enabled. It provides an invisible low-privilege identity for edits; riders do not see a sign-in screen.
- the current `firestore.rules` deployed so exact `sharedTrips/{shareId}` links can be read while collection listing stays disabled
- Firebase Hosting deployed from `legal-public/` so `trip.html?id=...` provides the public live viewer and app-edit handoff

My Trips is local-first for signed-out riders. Account sign-in is optional and remains useful for account-backed cross-device storage. Shared-trip updates are revision checked so a stale editor cannot overwrite a newer saved version.

### EAS Android Firebase file

- `app.config.js` resolves `android.googleServicesFile` from `GOOGLE_SERVICES_JSON` when present.
- For reproducible cloud builds, set `GOOGLE_SERVICES_JSON` as an EAS file secret (pointing to `google-services.json`).
- Production EAS builds also require `EXPO_PUBLIC_API_PROXY_URL` and reject insecure env vars (`EXPO_PUBLIC_LOCATIONIQ_API_KEY`, direct LocationIQ mode, and public proxy tokens).

### Google Play AAB versioning

- Before building any Android App Bundle (`.aab`) for Google Play Console, always increment the Android `versionCode`.
- Keep the Expo config and native Android config in sync: update `android.versionCode` in `app.base.json` and `versionCode` in `android/app/build.gradle`.
- Keep `package.json`, `app.base.json`, and `release.json` on the same release version. `release.json` must record a version name and Android version code higher than the last known Play production release.
- Do not use `EXPO_PUBLIC_APP_VERSION` to move a build or OTA update onto another runtime. A mismatched override is rejected by app configuration and the production preflight.

### Production release gate

- Run `npm run verify:production` from a clean branch that is synchronized with its upstream branch.
- Production releases must come from clean `master` tracking the exact `origin/master` commit. The gate prints and validates the checked-in release identity before running the broader suite.
- The gate checks tests, production environment safety, Expo health, dependency severity, live API auth, legal URLs, and feedback-retention TTL policies.
- Public auto-detours require `EXPO_PUBLIC_AUTO_DETOURS_APPROVED=true`. Keep both production flags `false` until the live baseline and rollout-health critical checks pass; the production release gate verifies those checks whenever the feature is enabled.
- Run `npm run build:release` only after the gate passes. It creates the Google Play AAB through EAS-managed upload signing; a local Gradle release is a smoke-test artifact and must not be uploaded.
- Static legal pages live in `legal-public/` and Firebase Hosting is configured to deploy only that directory. They identify Mike McMike as the independent operator. Obtain legal review, run `firebase deploy --only hosting`, then verify each public URL. The app contact is `mybarrietransit@outlook.com`; Service Barrie remains the transit-service contact only.

### Client behavior

`TransitContext` renders the backend Firestore detour feed only. If the feed is unavailable, the app does not create local detector evidence; use dev fixtures or the simulation endpoint for local UI checks.
To temporarily disable all auto-detour behavior during testing, set `EXPO_PUBLIC_ENABLE_AUTO_DETOURS=false`.

## License

MIT
