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

2. **Configure Google Maps API Key (Android only):**

   For Android, you need a Google Maps API key. Get one from the [Google Cloud Console](https://console.cloud.google.com/google/maps-apis).

   Edit `app.json` and replace `YOUR_GOOGLE_MAPS_API_KEY` with your actual key:
   ```json
   "android": {
     "config": {
       "googleMaps": {
         "apiKey": "YOUR_ACTUAL_API_KEY"
       }
     }
   }
   ```

   **Note:** iOS uses Apple Maps by default in Expo Go, so no API key is needed for iOS development.

3. **Start the development server:**
   ```bash
   npm start
   ```

4. **Open the app:**
   - Scan the QR code with Expo Go on your phone
   - Or press `a` for Android emulator / `i` for iOS simulator

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
   - `FIREBASE_SERVICE_ACCOUNT_JSON=...` (or `GOOGLE_APPLICATION_CREDENTIALS`)
   - `LOCATIONIQ_API_KEY=...` (still required for existing proxy routes)
3. Start backend:
   ```bash
   npm start
   ```
4. Verify worker status:
   - `GET /api/health`
   - `GET /api/detours`

### Firestore rules

Deploy updated rules so clients can read:
- `publicDetoursActive/*`
- `publicSystem/*`

### Client behavior

`TransitContext` now prefers backend detours when the shared feed is live; it falls back to local detector logic if backend feed is unavailable.
To temporarily disable all auto-detour behavior during testing, set `EXPO_PUBLIC_ENABLE_AUTO_DETOURS=false`.

## License

MIT
