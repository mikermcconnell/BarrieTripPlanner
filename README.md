# Barrie Transit Trip Planner

A React Native mobile app for real-time transit information in Barrie, Ontario.

## Features

- Real-time bus tracking with live vehicle positions
- Interactive map with route polylines
- Stop search and information
- Trip planning (coming soon)
- User favorites and history (coming soon)

## Prerequisites

- Node.js 18+ installed
- Expo Go app on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))
- Expo account at https://expo.dev

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

3. **Start the development server:**
   ```bash
   npm start
   ```

   For full feature parity in development, copy `.env.example` to `.env` and fill required values:
   - `EXPO_PUBLIC_API_PROXY_URL`
   - `LOCATIONIQ_API_KEY` (for local `proxy-server.js` / `api-proxy`)
   - `EXPO_PUBLIC_FIREBASE_*`
   - Optional fallback OTP backend: `EXPO_PUBLIC_OTP_URL`
   - Keep `EXPO_PUBLIC_ALLOW_DIRECT_LOCATIONIQ=false` for production/public builds
   - Keep `EXPO_PUBLIC_API_PROXY_TOKEN` empty for production/public builds

4. **Open the app:**
   - Scan the QR code with Expo Go on your phone
   - Or press `a` for Android emulator / `i` for iOS simulator

## Android Emulator Quick Start (Recommended)

When working in Android emulator, use one of these commands instead of manual Metro setup:

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
  - Runs recovery, starts Metro on `8084`, starts a local dev proxy on `8083`, then launches the app.
  - The proxy avoids emulator bundle transfer issues seen with direct Metro streaming.

- `npm run android:dev:direct`
  - Direct Metro on `8083` without proxy.
  - Use only if you explicitly want to bypass the proxy.

- `npm run android:recover`
  - Kills stale Metro/proxy processes and clears adb reverse mappings.
  - Use this if emulator startup gets stuck on loading/bundling.

- `npm run android:stable:rebuild`
  - Forces a fresh release rebuild/install, then launches.

### Web Development (CORS Proxy Required)

Barrie GTFS feeds do not expose browser CORS headers, so web mode must use a proxy.

Run web with the local proxy:
```bash
npm run web:dev
```

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

## Data Sources

- **Static GTFS:** http://www.myridebarrie.ca/gtfs/Google_transit.zip
- **Real-time Vehicle Positions:** http://www.myridebarrie.ca/gtfs/GTFS_VehiclePositions.pb
- **Real-time Trip Updates:** http://www.myridebarrie.ca/gtfs/GTFS_TripUpdates.pb
- **Service Alerts:** http://www.myridebarrie.ca/gtfs/GTFS_ServiceAlerts.pb

Data provided by [Barrie Transit](https://www.barrie.ca/transit).

## Development Phases

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the full development roadmap.

- [x] Phase 0+1: Project Setup & Map with Buses
- [x] Phase 2: Stop Information & Arrivals
- [x] Phase 3: Trip Planning (mock data, needs OTP backend)
- [x] Phase 4: User Accounts & Favorites
- [ ] Phase 5: Notifications & Alerts (requires EAS Build)
- [ ] Phase 6: Polish & Launch

## Server-Side Detour Feed (New)

The app can now consume a shared Firestore detour feed produced by the backend worker (instead of relying only on on-device detection).

### Backend setup (`api-proxy`)

1. Install backend dependencies:
   ```bash
   cd api-proxy
   npm install
   ```
2. Set environment variables:
   - `DETOUR_WORKER_ENABLED=true`
   - `DETOUR_HISTORY_ENABLED=true` (default true)
   - `DETOUR_HISTORY_RETENTION_DAYS=30` (default 30; set `<=0` to disable automatic pruning)
   - `FIREBASE_SERVICE_ACCOUNT_JSON=...` (or `GOOGLE_APPLICATION_CREDENTIALS`)
   - `LOCATIONIQ_API_KEY=...` (still required for existing proxy routes)
   - `REQUIRE_API_AUTH=true`
   - `REQUIRE_FIREBASE_AUTH=true` (recommended/required for production)
   - `ALLOW_SHARED_TOKEN_AUTH=false` (recommended/required for production)
   - `ALLOWED_ORIGINS=...` (required for browser clients)
   - Optional non-production token auth: `API_PROXY_TOKEN=...` (or `API_PROXY_TOKENS=token1,token2`)
3. Start backend:
   ```bash
   npm start
   ```
4. Verify worker status:
   - `GET /api/health`
   - `GET /api/detour-status`
   - `GET /api/detour-logs?limit=100`
     - Optional filters: `routeId`, `eventType` (comma-separated), `start`, `end`
     - Log event types: `DETOUR_DETECTED`, `DETOUR_UPDATED`, `DETOUR_CLEARED`

### Firestore rules

Deploy updated rules so clients can read:
- `activeDetours/*`
- `detourHistory/*`

### EAS Android Firebase file

- `app.config.js` resolves `android.googleServicesFile` from `GOOGLE_SERVICES_JSON` when present.
- For reproducible cloud builds, set `GOOGLE_SERVICES_JSON` as an EAS file secret (pointing to `google-services.json`).
- Production EAS builds also require `EXPO_PUBLIC_API_PROXY_URL` and reject insecure env vars (`EXPO_PUBLIC_LOCATIONIQ_API_KEY`, direct LocationIQ mode, and public proxy tokens).

### Client behavior

`TransitContext` now prefers backend detours when the shared feed is live; it falls back to local detector logic if backend feed is unavailable.
To temporarily disable all auto-detour behavior during testing, set `EXPO_PUBLIC_ENABLE_AUTO_DETOURS=false`.

## License

MIT
