# One-Shot Prompt: Barrie Transit Trip Planner (BTTP)

> **Purpose**: This prompt is designed to instruct an expert AI coding agent (Claude, GPT, etc.) to build the entire Barrie Transit Trip Planner app from scratch in a single session. It covers architecture, features, UI/UX, data flows, and platform parity.

---

## System Instruction

You are building **Barrie Transit Trip Planner (BTTP)** — a cross-platform transit companion app for riders of Barrie Transit (Barrie, Ontario, Canada). The app runs on iOS, Android, and Web using **Expo (React Native)** with platform-specific rendering for maps and bottom sheets.

The app's value proposition: **the only all-in-one transit companion built specifically for Barrie** — combining real-time vehicle tracking, trip planning with a local-first RAPTOR routing engine, live detour detection inferred from vehicle GPS data, service alerts, favorites, and turn-by-turn navigation in a single friendly interface. Google Maps doesn't offer Barrie-specific real-time tracking, detour inference, or offline routing.

---

## Tech Stack (Non-Negotiable)

| Layer | Technology |
|-------|-----------|
| **Framework** | Expo SDK ~54 + React Native 0.81+ |
| **Navigation** | React Navigation 7 (bottom tabs + stacks) |
| **Maps (Native)** | MapLibre GL (`@maplibre/maplibre-react-native`) |
| **Maps (Web)** | Leaflet 1.9 + React-Leaflet 5 |
| **State** | React Context API + custom hooks (no Redux) |
| **Auth & DB** | Firebase (Auth + Firestore) |
| **Trip Planning** | Local RAPTOR algorithm (primary) + OpenTripPlanner (fallback) |
| **Geocoding** | Local Barrie address database (primary) + LocationIQ API (fallback) |
| **Transit Data** | GTFS static (CSV/ZIP) + GTFS-RT (protobuf) from myridebarrie.ca |
| **Error Tracking** | Sentry |
| **Offline Storage** | AsyncStorage (GTFS cache, favorites fallback) |
| **Typography** | Nunito font family (expo-google-fonts) |
| **Bottom Sheet** | @gorhom/bottom-sheet (native), custom CSS (web) |
| **Dev Proxy** | Express.js server for CORS + API key hiding |

---

## Platform Parity Rules

This is the most critical architectural constraint:

1. **Every screen and component that touches maps or platform APIs must have BOTH a `.js` (native) and `.web.js` (web) file.**
2. **All business logic lives in shared hooks (`src/hooks/`) and services (`src/services/`).** Both platform files import the same hooks — only rendering differs.
3. **Never duplicate logic in a `.web.js` file.** Extract to a hook or utility first, then import in both.
4. **Native uses MapLibre GL components** (ShapeSource, LineLayer, CircleLayer, PointAnnotation). **Web uses Leaflet components** (Marker, Polyline, CircleMarker with divIcon).
5. **Native uses `react-native-svg`** for inline SVGs. **Web uses DOM `<svg>` elements.**
6. **Native bottom sheets use `@gorhom/bottom-sheet`** with gesture handling. **Web uses CSS-based panels/modals.**

### Known Platform File Pairs
```
src/screens/HomeScreen.js          ↔  HomeScreen.web.js
src/components/TripBottomSheet.js  ↔  TripBottomSheet.web.js
src/components/BusMarker.js        ↔  BusMarker.web.js
src/components/StopMarker.js       ↔  StopMarker.web.js
src/components/RoutePolyline.js    ↔  RoutePolyline.web.js
```

---

## Project Structure

```
BTTP/
├── App.js                          # Root: AuthProvider → TransitProvider → Navigation
├── proxy-server.js                 # Express dev proxy (CORS + API keys)
├── src/
│   ├── config/
│   │   ├── constants.js            # GTFS URLs, map config, refresh intervals, route colors
│   │   ├── theme.js                # Design tokens: colors, spacing, typography, shadows
│   │   └── firebase.js             # Firebase app initialization
│   ├── context/
│   │   ├── AuthContext.js           # User auth, favorites, history (Firestore listeners)
│   │   └── TransitContext.js        # GTFS data, vehicles, alerts, detours
│   ├── navigation/
│   │   └── TabNavigator.js          # Bottom tabs (Map, Search, Profile) + stacks
│   ├── screens/
│   │   ├── HomeScreen.js / .web.js  # Main map screen (THE primary interface)
│   │   ├── SearchScreen.js          # Search stops, routes, addresses
│   │   ├── NavigationScreen.js      # Turn-by-turn directions
│   │   ├── TripDetailsScreen.js     # Full itinerary breakdown
│   │   ├── AlertsScreen.js          # Service alerts list
│   │   ├── ProfileScreen.js         # Auth, favorites, settings
│   │   └── NewsScreen.js            # Transit news feed
│   ├── components/
│   │   ├── TripBottomSheet.js / .web.js     # Trip results bottom sheet
│   │   ├── StopBottomSheet.js               # Stop arrivals sheet
│   │   ├── TripSearchHeader.js / .web.js    # From/To search bar
│   │   ├── TripResultCard.js                # Individual trip result
│   │   ├── BusMarker.js / .web.js           # Real-time vehicle marker
│   │   ├── StopMarker.js / .web.js          # Bus stop marker
│   │   ├── RoutePolyline.js / .web.js       # Route shape line
│   │   ├── HomeScreenControls.js            # Route filter chips
│   │   ├── AddressAutocomplete.js           # Location search input
│   │   ├── MapTapPopup.js                   # Tap-to-get-address popup
│   │   ├── AlertBanner.js                   # Top alert notification
│   │   ├── FavoriteStopCard.js              # Floating favorite card
│   │   ├── FareCard.js                      # Fare information
│   │   ├── PlanTripFAB.js                   # Floating action button
│   │   └── Icon.js                          # Unified icon component
│   ├── hooks/
│   │   ├── useTripPlanner.js                # Trip form state, search, suggestions
│   │   ├── useRouteSelection.js             # Route toggle/select/zoom
│   │   ├── useTripVisualization.js           # Render itinerary on map
│   │   ├── useMapNavigation.js              # Programmatic camera control
│   │   ├── useMapTapPopup.js                # Reverse geocode on tap
│   │   ├── useDetourOverlays.js             # Detour rendering
│   │   ├── useDisplayedEntities.js          # Filter visible routes/stops
│   │   └── useSearchHistory.js              # Recent searches
│   ├── services/
│   │   ├── gtfsService.js                   # Parse GTFS ZIP (routes, stops, trips, shapes, calendars)
│   │   ├── realtimeService.js               # GTFS-RT protobuf (vehicle positions)
│   │   ├── tripService.js                   # Trip planning orchestrator
│   │   ├── localRouter.js                   # RAPTOR algorithm implementation
│   │   ├── walkingService.js                # Walking directions (OSMRouter)
│   │   ├── tripDelayService.js              # Enrich trips with real-time delays
│   │   ├── alertService.js                  # GTFS-RT service alerts
│   │   ├── locationIQService.js             # Hybrid geocoding (local + API)
│   │   ├── offlineCache.js                  # AsyncStorage GTFS cache (24h TTL)
│   │   └── firebase/
│   │       ├── authService.js               # Sign in/up, Google SSO
│   │       └── firestoreService.js          # User data, favorites CRUD
│   ├── utils/
│   │   ├── geometryUtils.js                 # haversineDistance, point-to-segment, corridor checks
│   │   ├── polylineUtils.js                 # decodePolyline, extractShapeSegment, findClosestPoint
│   │   ├── routeLabel.js                    # Parse/resolve vehicle route labels
│   │   └── fetchWithCORS.js                 # Fetch wrapper for proxy routing
│   ├── data/
│   │   └── barrie_addresses.json            # ~2MB local Barrie address points
│   └── styles/
│       └── commonStyles.js                  # Reusable style presets
```

---

## Design System

### Philosophy
**Friendly and approachable.** Rounded corners, soft shadows, warm green palette, Nunito typeface. The app should feel welcoming and simple — not intimidating like a power-user transit tool. Think "your helpful transit friend" not "enterprise GIS dashboard."

### Color Palette

```javascript
COLORS = {
  // Primary (Transit Green)
  primary:       '#4CAF50',
  primaryLight:  '#81C784',
  primaryDark:   '#388E3C',
  primarySubtle: '#E8F5E9',

  // Secondary (Professional Blue)
  secondary:       '#0066CC',
  secondaryLight:  '#3399FF',
  secondarySubtle: '#E6F2FF',

  // Status
  success: '#4CAF50',   warning: '#FF991F',
  error:   '#DE350B',   info:    '#0066CC',

  // Neutrals
  white:         '#FFFFFF',
  background:    '#F4F5F7',
  textPrimary:   '#172B4D',
  textSecondary: '#6B778C',
  textDisabled:  '#A5ADBA',
  border:        '#DFE1E6',

  // Special
  realtime:  '#4CAF50',  // Green dot for live data
  scheduled: '#6B778C',  // Gray for scheduled times
  delayed:   '#DE350B',  // Red for delays

  // Glass
  glassWhite: 'rgba(255, 255, 255, 0.95)',
}
```

### Spacing & Layout Tokens
```javascript
SPACING  = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 }
RADIUS   = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, xxl: 20, round: 9999 }
SHADOWS  = {
  small:  { offset: [0,2], opacity: 0.10, radius: 4,  elevation: 2 },
  medium: { offset: [0,4], opacity: 0.15, radius: 8,  elevation: 4 },
  large:  { offset: [0,8], opacity: 0.18, radius: 16, elevation: 8 },
}
```

### Typography
```javascript
FONT_FAMILY = 'Nunito'  // All weights: 400, 500, 600, 700
FONT_SIZES  = { xxs: 10, xs: 11, sm: 12, md: 14, lg: 16, xl: 18, xxl: 22, xxxl: 28, display: 34 }

// Text Styles
display:   { size: 34, weight: 700, letterSpacing: -0.5 }
title:     { size: 28, weight: 700, letterSpacing: -0.5 }
heading:   { size: 16, weight: 600 }
body:      { size: 14, weight: 400, lineHeight: 1.5 }
caption:   { size: 11, weight: 400, color: textSecondary }
label:     { size: 11, weight: 600, uppercase: true, letterSpacing: 0.8 }
button:    { size: 14, weight: 600, letterSpacing: 0.3 }
```

### Common Component Styles
- **Cards**: White, `lg` radius, `small` shadow, `lg` padding
- **Buttons**: Pill-shaped (`round` radius), 44px min height, primary green fill
- **Chips**: Pill border, 1.5px stroke, active = green fill + white text
- **Icon buttons**: 48x48, light gray background, centered icon
- **Dividers**: 1px `border` color
- **Touch targets**: Minimum 44px (accessibility standard)

### Route Colors
Each Barrie Transit route has an assigned color (Route 1 = Red `#E31837`, Route 2 = Green `#00A651`, Route 3 = Blue `#0072BC`, etc.). Store a lookup map in constants.

### Map Styling
- **Base tiles**: CartoDB Positron (light, desaturated, clean)
- **Route polylines**: 6-8px stroke, rounded caps, 0.85 opacity, route-colored
- **Stop markers**: White border circle + colored fill (primary green or accent orange)
- **Bus markers**: 40px colored circle, white bus icon, route label text, direction arrow rotated by bearing
- **Walking legs**: Dashed polyline (10,5 pattern)
- **Trip overlay**: Blue/green for transit legs, gray dashed for walking

---

## Navigation Architecture

```
TabNavigator (bottom tabs)
├── Map Tab (Stack)
│   ├── MapMain (HomeScreen)        ← Primary interface, 90% of usage
│   ├── NearbyStops
│   ├── Alerts
│   ├── TripDetails
│   ├── Navigation (turn-by-turn)
│   └── ScheduleEditor
├── Search Tab
│   └── SearchScreen
└── Profile Tab (Stack)
    ├── ProfileMain
    ├── SignIn / SignUp
    ├── Favorites
    └── Settings
```

---

## Feature Specifications

### Feature 1: The Map (HomeScreen) — The Hub

The HomeScreen IS the app. Everything radiates from a full-screen map.

**Layout (top to bottom):**
```
┌─────────────────────────────────────┐
│  TripSearchHeader (floating, z=1000) │  ← From/To fields, swap, time picker
├─────────────────────────────────────┤
│  HomeScreenControls (z=998)          │  ← Route filter chips (scrollable row)
├─────────────────────────────────────┤
│                                     │
│         Full-Screen Map             │  ← Route polylines, stops, buses
│                                     │
├─────────────────────────────────────┤
│  AlertBanner (fixed top, z=998)      │  ← Active service alert (if any)
│  MapTapPopup (floating, z=200)       │  ← Tap-to-address popup
├─────────────────────────────────────┤
│  FavoriteStopCard (bottom, z=998)    │  ← Quick-access favorite stop
│  PlanTripFAB (bottom-right, z=1000)  │  ← "Plan Trip" floating button
└─────────────────────────────────────┘
│  TripBottomSheet (swipeable)         │  ← Trip results (snaps: 10%, 38%, 85%)
│  StopBottomSheet (swipeable)         │  ← Stop arrivals (snaps: 30%, 55%, 90%)
└─────────────────────────────────────┘
```

**Map Interactions:**
- Tap route chip → toggle route visibility, zoom to bounds, show vehicles
- Tap stop marker → open StopBottomSheet with real-time arrivals
- Tap anywhere on map → reverse geocode, show address popup with "Trip to here" / "Trip from here"
- Pinch/pan/rotate → standard map gestures
- "All" chip → show all routes, clear selection

**Route Chips (HomeScreenControls):**
- Horizontal scrollable row of pill-shaped chips
- Each chip: route number + name, colored left border matching route
- Active state: filled with route color, white text
- Alert badge: small red count overlay if route has active alerts
- Long press: show alert details

### Feature 2: Trip Planning

**Search Flow:**
1. User taps PlanTripFAB → TripSearchHeader appears
2. "From" field: AddressAutocomplete (defaults to "My Location")
3. "To" field: AddressAutocomplete (destination)
4. Swap button exchanges from/to
5. Time mode toggle: "Depart Now" → "Depart At" → "Arrive By"
6. For non-now modes: date/time picker + explicit "Search" button
7. Results appear in TripBottomSheet

**AddressAutocomplete:**
- 300ms debounce on input
- Hybrid lookup: local Barrie addresses first (instant), LocationIQ API fallback (POIs, businesses)
- Max 5 suggestions
- Location bias: Barrie, Ontario bounding box
- "Current Location" button in From field (uses device GPS)

**Trip Planning Pipeline (`useTripPlanner` hook + `tripService`):**
```
Input (from, to, mode, time)
  → Validate inputs
  → Try localRouter.js (RAPTOR algorithm) FIRST
  → If RAPTOR fails → fallback to OpenTripPlanner API
  → Enrich with walking directions (OSMRouter)
  → Apply real-time delay data from vehicle positions
  → Add metadata (recommended label, fare info, tomorrow flag)
  → Return 3-5 itineraries
```

**TripResultCard (each itinerary):**
- Departure time → Arrival time (bold)
- Total duration, walking distance
- Leg icons: 🚶 Walk → 🚌 Route 1 → 🚶 Walk (colored by route)
- "Recommended" badge on best option
- Delay indicator if real-time data shows late buses
- Tap → select, highlight on map, show FareCard
- "View Details" → TripDetailsScreen
- "Start Navigation" → NavigationScreen

**RAPTOR Algorithm (`localRouter.js`):**
- Multi-round transit routing (walk → bus → transfer → bus → walk)
- Uses cached GTFS data (stops, trips, stop_times, calendars)
- Finds nearby origin/destination stops within walking radius
- Filters by active service calendar for the query date
- Returns optimal itineraries ranked by arrival time
- Works completely offline with cached GTFS data

### Feature 3: Real-Time Vehicle Tracking

**Data Source:** GTFS-RT VehiclePositions protobuf from `myridebarrie.ca/gtfs/GTFS_VehiclePositions.pb`

**Refresh:** Every 15 seconds (configurable in constants)

**Pipeline:**
1. Fetch protobuf binary
2. Decode with lightweight custom protobuf decoder (no proto3 library — bundle size)
3. Extract: vehicle_id, trip_id, latitude, longitude, bearing, speed, timestamp, delay
4. Match to GTFS trips via trip_id → resolve route_id and headsign
5. Render BusMarker for each vehicle on selected routes

**BusMarker Component:**
- 40px colored circle (route color) with 3px white border
- White bus icon SVG (12px) centered
- Route number label below icon (white, 10px bold)
- Direction arrow: SVG triangle rotated by bearing, extending beyond circle
- **Animation**: Smooth position interpolation (2000ms), pulse scale on new data (400ms)
- Shadow/elevation for depth

### Feature 4: Detour Detection (Novel Feature)

**This is genuinely unique.** The system infers active detours by analyzing real-time vehicle GPS positions against known route shapes.

**Architecture:**
- Backend process compares vehicle positions to expected route geometry
- When multiple vehicles consistently deviate from the published shape → detour detected
- Results stored in Firestore collection `activeDetours` with:
  - `skippedSegment`: polyline of the original route section being bypassed
  - `inferredDetour`: polyline of the actual path vehicles are taking
  - `confidence`: detection confidence level
  - `vehicleCount`: how many vehicles confirmed the deviation
  - `entryPoint` / `exitPoint`: where buses leave and rejoin the route
  - `detectedAt` / `lastSeen`: timestamps

**Frontend Rendering (`useDetourOverlays` hook):**
- Subscribe to Firestore `activeDetours` collection (real-time listener)
- Render skipped segment as orange/red dashed overlay on map
- Render inferred detour path as orange solid overlay
- Visual indicator on route chip when detour is active

### Feature 5: Stop Arrivals (StopBottomSheet)

**Trigger:** Tap any stop marker on the map

**Content:**
- Stop name + code badge
- Action buttons: "Trip from here" (green) / "Trip to here" (red)
- Share button, close button, favorite toggle
- Real-time arrivals list:
  - Route number (colored), headsign/direction
  - Arrival time with real-time indicator (green dot = live, gray = scheduled)
  - Delay amount if applicable (red text)
  - "No upcoming arrivals" empty state

**Data:** Combines GTFS static schedule with GTFS-RT TripUpdates for predicted times.

### Feature 6: Service Alerts

**Data Source:** GTFS-RT ServiceAlerts protobuf, refreshed every 60 seconds

**Display:**
- AlertBanner: Top-of-map floating banner for most urgent alert
- AlertsScreen: Full list of active alerts with:
  - Affected routes (colored badges)
  - Cause (DETOUR, STRIKE, CONSTRUCTION, etc.)
  - Effect (REDUCED_SERVICE, STOP_MOVED, etc.)
  - Description text, active period
- Route chips show red badge count when alerts exist
- Long-press chip to preview alert

### Feature 7: Authentication & Favorites

**Firebase Auth:**
- Email/password sign up and sign in
- Google Sign-In (native SSO flow on iOS)
- Email verification
- Profile management (display name)

**Favorites (Firestore + local fallback):**
- Favorite stops: real-time Firestore listener on `userFavorites/{uid}/stops`
- Favorite routes: same pattern for `userFavorites/{uid}/routes`
- Trip history: stored in `tripHistory/{uid}`
- **Offline**: AsyncStorage mirrors favorites, auto-merges on sign-in
- FavoriteStopCard: floating card on map for quick access to top favorite

### Feature 8: Turn-by-Turn Navigation

**NavigationScreen:**
- Step-by-step directions for selected itinerary
- Map focused on current leg (walk → board bus → walk)
- Current vehicle position shown in real-time
- Walking legs with pedestrian directions (from OSMRouter)
- Delay info updated live
- "You should arrive at [time]" with delay-adjusted estimate

### Feature 9: Offline Support

**Cached Data (AsyncStorage, 24h TTL):**
- Full GTFS static data (routes, stops, trips, shapes, stop_times, calendars)
- Barrie address database (~2MB, bundled as JSON)
- User favorites (local mirror)

**Offline Capabilities:**
- RAPTOR routing works completely offline with cached GTFS
- Address autocomplete works with local Barrie data
- Favorites accessible from AsyncStorage
- Map tiles: depends on device cache (not explicitly downloaded)
- Graceful degradation: real-time features show "last updated" or "offline" state

### Feature 10: Transit News

**Source:** Firestore collection `transitNews` (real-time subscription)
**Display:** NewsScreen with chronological news items, timestamps, rich text

---

## Data Architecture

### GTFS Static Data Pipeline
```
Source: https://www.myridebarrie.ca/gtfs/Google_transit.zip
  → Download ZIP (through CORS proxy on web)
  → Parse with JSZip
  → Extract CSVs: routes.txt, stops.txt, trips.txt, stop_times.txt, shapes.txt, calendar.txt, calendar_dates.txt
  → Handle BOM characters in CSV headers
  → Process shapes: decode → Douglas-Peucker simplification → Catmull-Rom smoothing
  → Cache in AsyncStorage (24h TTL)
  → Serve via TransitContext to all components
```

### GTFS-RT Protobuf Pipeline
```
Vehicle Positions (15s):  .../GTFS_VehiclePositions.pb  → decode → match trips → BusMarkers
Trip Updates (30s):       .../GTFS_TripUpdates.pb       → decode → stop predictions → arrivals
Service Alerts (60s):     .../GTFS_ServiceAlerts.pb     → decode → filter active → AlertBanner
```

**Important:** Use a lightweight custom protobuf decoder, NOT a full proto3 library. Decode varint, length-delimited, and fixed fields manually. This keeps the bundle size small.

### Firestore Collections
```
users/{uid}                     → profile, settings, push token
userFavorites/{uid}/stops/{id}  → favorite stops
userFavorites/{uid}/routes/{id} → favorite routes
tripHistory/{uid}               → search history
activeDetours/{id}              → real-time detour data (public read)
transitNews/{id}                → transit news items (public read)
```

### Context Providers

**TransitContext** (wraps entire app):
- Loads and caches GTFS static data on mount
- Polls vehicle positions, trip updates, alerts on intervals
- Subscribes to Firestore detours and news
- Exposes: routes, stops, trips, shapes, vehicles, alerts, detours, news, loading states

**AuthContext** (wraps entire app):
- Firebase auth state listener
- Firestore real-time listeners for favorites and history
- Exposes: user, signIn, signUp, signOut, favorites, addFavorite, removeFavorite, history

---

## Proxy Server (`proxy-server.js`)

Express.js dev server running on port 3001:

```javascript
// Routes:
GET /health                            // Health check
GET /api/autocomplete?q=...            // LocationIQ autocomplete (hides API key)
GET /api/geocode?q=...                 // LocationIQ forward geocode
GET /api/reverse-geocode?lat=&lon=...  // LocationIQ reverse geocode
GET /api/walking-directions?from=&to=  // OSMRouter walking directions
GET /proxy?url=...                     // Generic CORS proxy (allowlisted domains)

// Security:
- Rate limiting: 60 requests/min per IP
- API key stays server-side (LOCATIONIQ_API_KEY env var)
- Domain allowlist: myridebarrie.ca, barrie.ca
- Input validation: query length limits, lat/lon bounds
```

---

## Key Utilities

### `geometryUtils.js`
```javascript
haversineDistance(lat1, lon1, lat2, lon2) → meters
safeHaversineDistance(coord1, coord2) → meters (null-safe)
pointToSegmentDistance(point, segStart, segEnd) → meters
pointToPolylineDistance(point, polyline) → meters
pathsOverlap(path1, path2, threshold) → boolean
```

### `polylineUtils.js`
```javascript
decodePolyline(encoded) → [{latitude, longitude}]
findClosestPointIndex(point, polyline) → index
extractShapeSegment(shape, startIdx, endIdx) → sub-polyline
```

### Route Label Resolution
Barrie Transit routes have sub-variants (e.g., Route 8 splits into 8A and 8B). The `routeLabel.js` utility parses trip headsigns and resolves ambiguous route labels from GTFS-RT vehicle data.

---

## Animation Specifications

| Animation | Duration | Easing | Effect |
|-----------|----------|--------|--------|
| Bus position interpolation | 2000ms | linear | Smooth lat/lon transition |
| Bus pulse on new data | 400ms | ease-out | Scale 1.0 → 1.1 → 1.0 |
| Loading spinner pulse | 2000ms (loop) | bezier | Scale 1.0 → 1.3, opacity 0.8 → 0.4 |
| Skeleton shimmer | 1000ms (loop) | ease | Opacity 0.3 → 0.7 |
| Empty state bounce | 1500ms (loop) | ease-in-out | TranslateY -10 → 0 |
| Map fly-to | 500ms | cubic | Camera animation |
| Bottom sheet snap | gesture-driven | spring | Snap to 10%/38%/85% |

---

## Environment Variables

```env
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_OTP_URL=...                    # OpenTripPlanner instance URL
EXPO_PUBLIC_SENTRY_DSN=...
LOCATIONIQ_API_KEY=...                     # Server-side only (proxy)
EXPO_PUBLIC_ALLOW_DIRECT_LOCATIONIQ=false   # Bypass proxy (dev only)
```

---

## NPM Scripts

```json
{
  "start": "expo start",
  "android:dev": "expo run:android",
  "ios": "expo run:ios",
  "web": "expo start --web",
  "web:dev": "concurrently \"node proxy-server.js\" \"expo start --web\"",
  "proxy": "node proxy-server.js",
  "test": "jest"
}
```

---

## Implementation Order

Build in this sequence to maintain a working app at every step:

### Phase 1: Foundation
1. Initialize Expo project with all dependencies
2. Set up `config/theme.js` (full design token system)
3. Set up `config/constants.js` (GTFS URLs, map config, intervals, route colors)
4. Set up `config/firebase.js`
5. Create `Icon.js` component (Nunito + custom SVG icon set)
6. Build `TabNavigator.js` with all stacks and screen shells

### Phase 2: Data Layer
7. Build `gtfsService.js` (GTFS ZIP download, CSV parse, shape processing)
8. Build `realtimeService.js` (custom protobuf decoder, vehicle positions)
9. Build `alertService.js` (service alerts protobuf)
10. Build `offlineCache.js` (AsyncStorage wrapper with TTL)
11. Build `TransitContext.js` (load static, poll real-time, subscribe detours)
12. Build `proxy-server.js` (CORS proxy + LocationIQ gateway)

### Phase 3: Map & Visualization
13. Build `HomeScreen.js` + `.web.js` (full-screen map, camera, tiles)
14. Build `RoutePolyline.js` + `.web.js` (colored route shapes)
15. Build `BusMarker.js` + `.web.js` (animated vehicle markers)
16. Build `StopMarker.js` + `.web.js` (stop circles)
17. Build `HomeScreenControls.js` (route filter chips)
18. Build `MapTapPopup.js` (tap-to-address with reverse geocode)

### Phase 4: Trip Planning
19. Build `geometryUtils.js` and `polylineUtils.js`
20. Build `localRouter.js` (RAPTOR algorithm)
21. Build `tripService.js` (RAPTOR + OTP orchestration)
22. Build `locationIQService.js` (hybrid geocoding)
23. Build `walkingService.js` (OSMRouter integration)
24. Build `tripDelayService.js` (real-time delay enrichment)
25. Build `useTripPlanner.js` hook
26. Build `TripSearchHeader.js` + `.web.js`
27. Build `AddressAutocomplete.js`
28. Build `TripBottomSheet.js` + `.web.js`
29. Build `TripResultCard.js` + `FareCard.js`

### Phase 5: Stops & Arrivals
30. Build `StopBottomSheet.js` (arrivals, actions, favorite toggle)
31. Build `useDisplayedEntities.js` (filter visible stops/routes)

### Phase 6: Auth & Favorites
32. Build `authService.js` + `firestoreService.js`
33. Build `AuthContext.js` (full auth + favorites + history)
34. Build `ProfileScreen.js` (auth UI, favorites list, settings)
35. Build `FavoriteStopCard.js` (floating map card)

### Phase 7: Alerts & Detours
36. Build `AlertBanner.js` + `AlertsScreen.js`
37. Build `useDetourOverlays.js` (Firestore subscription + map rendering)
38. Build detour overlay components (orange dashed/solid lines)

### Phase 8: Navigation & Details
39. Build `TripDetailsScreen.js` (full itinerary breakdown)
40. Build `NavigationScreen.js` (turn-by-turn with live tracking)
41. Build `useTripVisualization.js` (render selected itinerary on map)

### Phase 9: Search & News
42. Build `SearchScreen.js` (search stops, routes, addresses)
43. Build `NewsScreen.js` (transit news feed)

### Phase 10: Polish
44. Loading states (skeletons, spinners, pulsing animations)
45. Error states (friendly messages, retry buttons, offline indicators)
46. Empty states (animated illustrations, helpful prompts)
47. Smooth animations (bus interpolation, bottom sheet springs)
48. Sentry error tracking integration
49. Push notification registration (native only)

---

## Quality Checklist

Before considering any feature complete:
- [ ] Works on native (iOS/Android via Expo)
- [ ] Works on web (Leaflet rendering, CSS bottom sheets)
- [ ] Shared logic lives in hooks/utils, NOT duplicated in .web.js files
- [ ] Uses design tokens from theme.js (no hardcoded colors/spacing)
- [ ] Touch targets ≥ 44px
- [ ] Loading, error, and empty states all handled
- [ ] Offline fallback exists where applicable
- [ ] No `any` types if using TypeScript (use `unknown` and narrow)
- [ ] `backgroundColor` not `background` in React Native styles
- [ ] `react-native-svg` in native files, DOM `<svg>` in .web.js files only

---

## Critical Implementation Notes

1. **Barrie Transit route variants**: Routes like 8 split into 8A/8B. Always check for `route_id` variants in GTFS data. Don't assume 1 route = 1 shape.

2. **GTFS CSV BOM handling**: The GTFS ZIP from Barrie may include BOM characters in CSV headers. Strip them during parsing.

3. **Protobuf decoder**: Build a lightweight custom decoder. Do NOT import a full protobuf library — it bloats the bundle significantly. Decode varint, length-delimited, and fixed-width fields manually.

4. **Shape smoothing pipeline**: Raw GTFS shapes → Douglas-Peucker simplification (8m tolerance) → Catmull-Rom spline interpolation. This makes route polylines look professional on the map.

5. **LocationIQ hybrid**: Search the bundled Barrie address JSON first (instant, free). Only call the LocationIQ API for queries the local data can't answer (POIs, business names, out-of-area). This saves API quota.

6. **Vehicle-to-route matching**: GTFS-RT vehicles report `trip_id`, not `route_id`. You must join against GTFS static `trips.txt` to resolve the route. Handle headsign parsing carefully — `routeLabel.js` exists for this.

7. **Bottom sheet z-index**: Map interactions and overlapping UI (FAB, bottom sheet, search header, alert banner) require careful z-index management. The bottom sheet must not block route chips but must overlay the map.

8. **500-line screen file limit**: If `HomeScreen.js` exceeds 500 lines, extract logic into hooks. The screen file should be mostly JSX rendering — all state and handlers live in hooks.
