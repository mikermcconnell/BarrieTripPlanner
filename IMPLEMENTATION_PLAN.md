# Barrie Transit Trip Planner - Implementation Plan

## Approach: Expo Go + EAS Build (Option 1)

**Strategy:** Develop with Expo Go for instant testing on physical device. Use EAS Build only when native features require it (Phase 5+).

**Starting Point:** Phase 0 + 1 combined (Project Setup + Basic Map with Buses)

---

## Pre-Setup Requirements

Before starting, ensure you have:
- [x] Google Maps API key *(confirmed)*
- [x] Node.js 18+ installed (v22.17.0)
- [ ] Expo Go app installed on your phone (iOS App Store / Google Play)
- [ ] Expo account created at https://expo.dev

---

## Phase 0+1: Project Setup & Map with Buses (STARTING HERE)

### Step 0.1: Create Expo Project
```bash
npx create-expo-app@latest . --template blank
```

### Step 0.2: Install Core Dependencies
```bash
npx expo install react-native-maps expo-location expo-constants
npx expo install @react-navigation/native @react-navigation/bottom-tabs
npx expo install react-native-screens react-native-safe-area-context
npx expo install react-native-gesture-handler react-native-reanimated
npx expo install @gorhom/bottom-sheet
npx expo install expo-dev-client
```

### Step 0.3: Configure app.json
Add Google Maps API key and basic app config.

### Step 0.4: Create Folder Structure
```
src/
├── screens/
├── components/
├── services/
├── utils/
├── config/
└── context/
```

### Step 0.5: Verify Setup
Run `npx expo start` and scan QR with Expo Go app.

**Test Criteria:** App opens on phone showing "Welcome" text.

---

## Phase 1: Basic Map with Bus Positions

### Files to Create:
- `src/screens/HomeScreen.js` - Main map screen
- `src/screens/SearchScreen.js` - Stop search placeholder
- `src/screens/ProfileScreen.js` - Profile placeholder
- `src/components/BusMarker.js` - Bus icon on map
- `src/components/RoutePolyline.js` - Route line on map
- `src/services/gtfsService.js` - Fetch GTFS data
- `src/services/realtimeService.js` - Fetch vehicle positions
- `src/config/constants.js` - API URLs, colors
- `src/config/theme.js` - BudgetMe-inspired styling
- `src/navigation/TabNavigator.js` - Bottom tabs

### Implementation Steps:

1. **Set up navigation** - 3-tab layout (Map, Search, Profile)
2. **Add Google Map** to HomeScreen with Barrie centered
3. **Create GTFS parser** - Fetch and parse static GTFS (routes.txt, stops.txt, shapes.txt)
4. **Draw route lines** - Parse shapes.txt, render colored polylines
5. **Fetch vehicle positions** - Parse protobuf from GTFS-RT feed
6. **Display bus markers** - Custom bus icons with rotation based on bearing
7. **Auto-refresh** - Poll vehicle positions every 15 seconds

### Data Flow:
```
GTFS Static (weekly) → Parse → Store routes/stops/shapes in state
GTFS-RT (15 sec) → Parse protobuf → Update bus positions on map
```

### Key Technical Decisions:
- Use `expo-location` for user location
- Parse protobuf with `protobufjs` library
- Store GTFS static data in React Context (simple, no Redux)

**Test Criteria:** Open app, see Barrie map with colored route lines and bus icons that move every 15 seconds.

---

## Phase 2: Stop Information & Arrivals

### Files to Create:
- `src/components/StopMarker.js` - Stop dots on map
- `src/components/StopBottomSheet.js` - Slide-up arrival info
- `src/components/ArrivalRow.js` - Single arrival time display
- `src/services/arrivalService.js` - Calculate arrival predictions
- `src/screens/NearbyStopsScreen.js` - Stops near user

### Implementation Steps:

1. **Add stop markers** - Small dots at each stop location
2. **Implement bottom sheet** - Tap stop → sheet slides up
3. **Parse trip updates** - Get real-time arrival predictions from GTFS-RT
4. **Display arrivals** - Show route, destination, minutes until arrival
5. **Real-time indicator** - Signal icon for live vs scheduled times
6. **Near me feature** - List stops sorted by distance
7. **Stop search** - Search by name or stop ID

### Bottom Sheet Content:
```
[Stop Name]
[Stop ID: 1234]

Route 1 - Downtown        3 min  [live icon]
Route 1 - Downtown       18 min  [scheduled]
Route 8 - South End      12 min  [live icon]
```

**Test Criteria:** Tap any stop on map, see accurate arrival times that update.

---

## Phase 3: Trip Planning

### Files to Create:
- `src/screens/TripPlannerScreen.js` - Main trip planning UI
- `src/screens/TripDetailsScreen.js` - Step-by-step directions
- `src/components/TripCard.js` - Route option card
- `src/components/TripStep.js` - Single instruction step
- `src/components/TimePicker.js` - Depart at / Arrive by
- `src/services/tripService.js` - OpenTripPlanner API calls

### Backend Requirement:
- Deploy OpenTripPlanner instance with Barrie GTFS
- Options: Railway.app, Render.com, or DigitalOcean droplet
- OTP provides trip planning API out of the box

### Implementation Steps:

1. **Deploy OTP backend** - Load Barrie GTFS into OpenTripPlanner
2. **Create search UI** - Origin/destination inputs, time picker
3. **Fetch trip options** - Call OTP API with parameters
4. **Display route cards** - Total time, transfers, walk time
5. **Step-by-step view** - Walking legs, bus legs, transfer points
6. **Show trip on map** - Highlight the selected route

### Trip Card Design:
```
┌─────────────────────────────────┐
│  32 min total                   │
│  Leave 2:15 PM → Arrive 2:47 PM │
│  [Walk 5 min] → [Bus 1] → [Walk 3 min]
└─────────────────────────────────┘
```

**Test Criteria:** Enter destination, see route options, tap one to see step-by-step directions.

---

## Phase 4: User Accounts & Favorites

### Files to Create:
- `src/screens/SignInScreen.js` - Login UI
- `src/screens/SignUpScreen.js` - Registration UI
- `src/screens/FavoritesScreen.js` - Saved stops/routes
- `src/context/AuthContext.js` - Auth state management
- `src/services/authService.js` - Firebase Auth calls
- `src/services/userService.js` - Firestore user data

### Firebase Setup:
1. Create Firebase project
2. Enable Authentication (Email + Google)
3. Create Firestore database
4. Add Firebase config to app

### Implementation Steps:

1. **Set up Firebase** - Add firebase config, initialize
2. **Create auth screens** - Sign in, sign up, forgot password
3. **Implement auth flow** - Email/password + Google sign-in
4. **Favorites storage** - Save stops and routes to Firestore
5. **Trip history** - Log completed trip searches
6. **Sync favorites** - Load on sign-in, sync across devices

**Test Criteria:** Sign in, save a favorite stop, sign out, sign back in, see favorite still there.

---

## Phase 5: Notifications & Alerts (Requires EAS Build)

**Note:** This phase requires push notifications, which need a custom dev client via EAS Build.

### EAS Setup:
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --profile development --platform android
```

### Files to Create:
- `src/services/notificationService.js` - FCM handling
- `src/components/AlertBanner.js` - Service alert display
- `src/screens/AlertsScreen.js` - Full alert list

### Implementation Steps:

1. **Build dev client** - One-time EAS build for push notifications
2. **Set up FCM** - Firebase Cloud Messaging configuration
3. **Service alerts** - Fetch and display GTFS-RT service alerts
4. **Trip reminders** - Schedule local notifications
5. **Get off alerts** - Proximity-based "next stop" alerts
6. **Smart timing** - Calculate walk time + buffer

**Test Criteria:** Set a trip reminder, receive notification at calculated time.

---

## Phase 6: Polish & Launch

### Tasks:
1. **Accessibility audit** - VoiceOver/TalkBack testing, AODA compliance
2. **Offline caching** - Store schedules in AsyncStorage
3. **Error handling** - Graceful failures, retry logic
4. **Loading states** - Skeletons, spinners
5. **Performance** - Optimize re-renders, lazy loading
6. **App icons & splash** - Branded assets
7. **Production build** - EAS Build for stores
8. **Store submission** - App Store + Play Store

---

## Testing Strategy (Expo Go)

### Daily Development Testing:
1. Run `npx expo start`
2. Scan QR code with Expo Go on phone
3. Test features with live reload

### Location Testing:
- Use Expo Go's location simulation
- Or test on-site in Barrie with real GPS

### Real-Time Data Testing:
- Compare app arrival times to actual bus arrivals
- Verify bus positions match reality

---

## Key Files Summary

| File | Purpose |
|------|---------|
| `app.json` | Expo configuration, API keys |
| `App.js` | Entry point, providers |
| `src/navigation/TabNavigator.js` | Bottom tab navigation |
| `src/screens/HomeScreen.js` | Main map view |
| `src/services/gtfsService.js` | GTFS data fetching/parsing |
| `src/services/realtimeService.js` | Real-time vehicle positions |
| `src/config/theme.js` | BudgetMe-inspired colors/styles |
| `src/context/TransitContext.js` | Global transit data state |

---

## Verification Plan

After each phase, verify:

1. **Phase 0:** `npx expo start` works, app opens in Expo Go
2. **Phase 1:** Map shows, buses move, routes display
3. **Phase 2:** Tap stop → see arrivals, search works
4. **Phase 3:** Trip planning returns valid routes
5. **Phase 4:** Auth works, favorites persist
6. **Phase 5:** Notifications received on device
7. **Phase 6:** Production build installs and runs

---

## Progress Tracking

- [x] Phase 0+1: Project Setup & Map with Buses (COMPLETE)
- [x] Phase 2: Stop Information & Arrivals (COMPLETE)
- [x] Phase 3: Trip Planning (COMPLETE - uses mock data, OTP backend needed)
- [x] Phase 4: User Accounts & Favorites (COMPLETE - uses AsyncStorage, Firebase optional)
- [x] Phase 5: Notifications & Alerts (COMPLETE)
  - Created notificationService.js for push notifications
  - Created alertService.js for GTFS-RT service alerts
  - Created AlertBanner.js component
  - Created AlertsScreen.js for full alert list
- [x] Phase 6: Polish & Launch (COMPLETE)
  - Created ErrorBoundary.js for error handling
  - Created LoadingSkeleton.js for loading states
  - Created offlineCache.js for offline data persistence
  - Created SettingsScreen.js for app preferences
  - Integrated offline support into TransitContext
  - Added alert banner to HomeScreen

---

## Phase 7: Enterprise Polish (NEW - Recommended)
**Goal:** Elevate UI/UX to a 10/10 premium experience

### Tasks:
1. **Custom Map Style**
   - Implement custom JSON map style (desaturated roads, simplified POIs)
   - Ensure high contrast for transit routes against the map

2. **Visual Enhancements**
   - **Glassmorphism:** Use `expo-blur` for floating elements (Search bar, Status pill)
   - **Typography:** Integrate a premium font family (e.g., Inter)
   - **Micro-interactions:** Add touch scaling to buttons

3. **Motion & Feedback**
   - **Bus Animation:** Implement smooth marker interpolation (no jumping buses)
   - **Haptics:** Add tactile feedback using `expo-haptics`
   - **Skeleton Loading:** Replace spinners with shimmer placeholders

4. **Refactoring**
   - Break down `HomeScreen.js` into smaller components (`MapControl`, `TransitMap`)
   - Optimize performance (reduce re-renders)

### Files to Modify/Create:
- `src/config/mapStyle.js` (New)
- `src/components/GlassContainer.js` (New)
- `src/hooks/useAnimatedMarker.js` (New)
