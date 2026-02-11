# Barrie Transit Trip Planner - Project Plan

## Project Vision

A friendly, approachable mobile app for Barrie Transit riders featuring real-time bus tracking, next bus arrivals, and trip planning. The app uses a clean, modern design inspired by BudgetMe.ca with Google Maps-style trip planning UX.

**Key Principle:** Simple, well-commented code that can be maintained by a non-developer using Claude Code.

---

## Requirements Summary

| Aspect | Decision |
|--------|----------|
| **App Name** | Barrie Transit Trip Planner |
| **Platforms** | iOS and Android (React Native + Expo) |
| **Audience** | Public (App Store / Play Store) |
| **Design Style** | BudgetMe.ca - friendly, clean, rounded cards |
| **Accent Color** | Green (like BudgetMe) |
| **Mapping API** | Google Maps |
| **User Accounts** | Full accounts (favorites, history, alerts) |
| **Language** | English only (MVP) |
| **Accessibility** | AODA Compliant |
| **Offline Support** | Cache schedules for offline viewing |
| **Notifications** | Smart timing based on walk distance |
| **Expected Users** | ~100 daily active users |
| **Maintainer** | You + Claude Code |

---

## Design System (BudgetMe-Inspired)

### Visual Style
- **Background:** Clean white (#FFFFFF)
- **Cards:** Rounded corners (12-16px), subtle shadows
- **Primary Color:** Green (#4CAF50 or similar)
- **Text:** Dark gray (#333333), clear hierarchy
- **Buttons:** Pill-shaped, green for primary actions
- **Icons:** Simple, colorful, friendly

### UI Components
- **Route badges:** Pill-shaped with route color
- **Time displays:** Large, readable numbers
- **Stop markers:** Rounded, color-coded
- **Bus icons:** Friendly, animated on map

### Screens
1. **Home (Map-first):** Full-screen map with floating search bar
2. **Stop Detail:** Bottom sheet showing arrivals
3. **Trip Planner:** Search bar → Route cards below map
4. **Step-by-step:** Full directions with active guidance
5. **Favorites:** Card grid of saved stops/routes
6. **Alerts:** Banner notifications + affected routes highlighted

---

## Core Features (MVP Priority Order)

### 1. Live Bus Map (First Priority)
- Real-time bus icons showing position on route
- Tap bus → see route name, destination, next stops
- Route lines in distinct colors
- Stop markers along routes
- Auto-refresh every 15-30 seconds
- Smooth animation of bus movement

### 2. Next Bus Arrivals (Second Priority)
- "Near My Location" - nearby stops with arrival times
- Search by stop name, ID, or address
- Bottom sheet slides up when tapping a stop
- Real-time indicator (signal icon) vs scheduled
- Distance to stop displayed
- Shows next day schedule when service ends

### 3. Trip Planning (Third Priority)
- **Entry:** Search bar for destination, current location as default origin
- **Time Options:** "Leave Now", "Depart At", "Arrive By" picker
- **Results:** Scrollable cards below map (Google Maps style)
- **Each Card Shows:** Total time, departure, walking time, transfers
- **Details:** Full step-by-step with "Get off at next stop" alerts
- **Smart Reminders:** Calculate based on walk time to stop

### 4. User Accounts
- Email/password or Google sign-in
- Save favorite stops and routes
- Trip history
- Personalized alerts for favorite routes
- Home/Work shortcuts
- Sync across devices

### 5. Notifications & Alerts
- Service alerts: Banner at top + map overlay
- Trip reminders: Smart timing (walk time + buffer)
- "Get off next stop" during active trip
- Delay notifications for favorited routes

---

## Data Sources

| Feed | URL | Updates |
|------|-----|---------|
| Static GTFS | `http://www.myridebarrie.ca/gtfs/Google_transit.zip` | Weekly |
| Vehicle Positions | `http://www.myridebarrie.ca/gtfs/GTFS_VehiclePositions.pb` | Every 15 sec |
| Trip Updates | `http://www.myridebarrie.ca/gtfs/GTFS_TripUpdates.pb` | Every 15 sec |
| Service Alerts | `http://www.myridebarrie.ca/gtfs/GTFS_ServiceAlerts.pb` | As needed |

---

## Technology Stack (Chosen for Simplicity)

### Mobile App
```
Framework:      React Native + Expo (simplest cross-platform option)
Maps:           react-native-maps (Google Maps)
Navigation:     React Navigation (standard, well-documented)
State:          React Context + useState (simple, no Redux complexity)
Styling:        StyleSheet (built-in, no extra libraries)
```

### Backend (Simple Architecture)
```
Platform:       Firebase (all-in-one, minimal setup)
Database:       Firestore (simple document storage)
Auth:           Firebase Auth (built-in)
Notifications:  Firebase Cloud Messaging
Hosting:        Firebase Functions (serverless)
```

### Trip Planning
```
Engine:         OpenTripPlanner (open-source, GTFS-native)
Hosting:        Simple cloud VM or container
```

### Mapping API
```
Provider:       Google Maps
Cost:           ~$0-25/month at 100 DAU
Free Tier:      28,000 loads + $200 credit/month
```

### Why These Choices?
- **Expo:** Handles 90% of mobile complexity automatically
- **Firebase:** One platform for auth, database, notifications
- **React Context:** Simpler than Redux, enough for this app
- **Google Maps:** Best documentation, free at our scale
- **Extensive documentation:** All these tools have great docs

---

## Code Philosophy

### Principles
1. **Readable over clever** - Verbose but clear code
2. **Standard patterns** - Use common, documented approaches
3. **Minimal abstractions** - Avoid over-engineering
4. **Extensive comments** - Every function explained
5. **Flat structure** - Avoid deep nesting

### File Organization (Simple & Flat)
```
src/
├── screens/           # One file per screen
│   ├── HomeScreen.js
│   ├── StopDetailScreen.js
│   ├── TripPlannerScreen.js
│   └── ...
├── components/        # Reusable UI pieces
│   ├── BusIcon.js
│   ├── RouteCard.js
│   ├── StopMarker.js
│   └── ...
├── services/          # Data fetching
│   ├── gtfsService.js      # Fetch transit data
│   ├── locationService.js  # GPS handling
│   └── tripService.js      # Trip planning
├── utils/             # Helper functions
│   ├── timeUtils.js
│   └── distanceUtils.js
├── config/            # Settings
│   └── constants.js
└── App.js             # Entry point
```

### Comment Style
```javascript
/**
 * BusIcon Component
 *
 * Shows a bus icon on the map at the given position.
 * The icon rotates to show the direction the bus is heading.
 *
 * HOW IT WORKS:
 * 1. Takes latitude, longitude, and bearing from props
 * 2. Renders a custom marker on the map
 * 3. Rotates the icon based on bearing (0-360 degrees)
 *
 * PROPS:
 * - latitude: number - The bus's current latitude
 * - longitude: number - The bus's current longitude
 * - bearing: number - Direction bus is facing (0=North, 90=East)
 * - routeColor: string - Color for this route (e.g., "#FF5733")
 */
```

---

## Development Phases

### Phase 1: Project Setup & Basic Map
**Goal:** Get a map on screen showing bus positions

1. Initialize Expo project in current folder
2. Set up basic navigation (3 tabs: Map, Search, Profile)
3. Add Google Maps to home screen
4. Fetch and parse GTFS static data (routes, stops)
5. Display route lines on map
6. Fetch real-time vehicle positions
7. Show bus icons on map

**Test:** Open app, see map with moving bus icons

### Phase 2: Stop & Arrival Information
**Goal:** Tap a stop, see when buses arrive

1. Add stop markers to map
2. Implement bottom sheet for stop details
3. Fetch real-time arrival predictions
4. Display arrival times with real-time indicators
5. Add "Near Me" functionality
6. Add stop search

**Test:** Tap any stop, see accurate arrival times

### Phase 3: Trip Planning
**Goal:** Plan a trip from A to B

1. Deploy OpenTripPlanner with Barrie GTFS
2. Add destination search bar
3. Implement route cards UI
4. Add departure/arrival time picker
5. Create step-by-step directions view
6. Add active trip tracking

**Test:** Search destination, get route options, follow directions

### Phase 4: User Accounts & Favorites
**Goal:** Save favorites, get personalized experience

1. Set up Firebase Auth
2. Create sign-up/sign-in screens
3. Implement favorites (stops, routes)
4. Add trip history
5. Sync across devices

**Test:** Sign in, save favorite, see it on another device

### Phase 5: Notifications & Alerts
**Goal:** Push notifications for alerts and reminders

1. Set up Firebase Cloud Messaging
2. Implement service alert banners
3. Add trip reminder notifications
4. Add "get off next stop" alerts
5. Smart timing calculation

**Test:** Set trip reminder, receive notification

### Phase 6: Polish & Launch
**Goal:** Ready for App Store

1. AODA accessibility audit
2. Offline schedule caching
3. Analytics integration
4. In-app feedback system
5. Performance optimization
6. App Store submission

---

## Future Features (Post-MVP)

### Auto-Detour Detection (Implemented, Ongoing Refinement)
**Current behavior:**
1. Compare real-time bus GPS to expected route shapes (including route shape variants)
2. If bus is off-route beyond threshold, track off-route breadcrumbs
3. If 2+ vehicles deviate similarly, classify as auto-detected detour
4. Show detour path on map with confidence level and route segment context
5. Correlate auto-detected detours with official GTFS service alerts when available

**Current complexity:** Moderate-high (geometric + real-time correlation)

### Predictive Delays
**How it works:**
1. Collect historical delay patterns
2. Factor in time of day, weather, events
3. Use ML to predict delays before they happen
4. Alert users proactively

**Complexity:** High (requires ML infrastructure)

### Fare Payment Integration
**Architecture ready for:**
- Link to Presto app/website
- Future in-app fare purchase

---

## Testing Strategy

- **Full network coverage:** Test all routes
- **Testing locations:** Throughout Barrie
- **Real-time validation:** Compare app times to actual arrivals
- **Accessibility testing:** VoiceOver/TalkBack testing
- **Offline testing:** Airplane mode functionality

---

## Success Metrics

- App Store rating ≥ 4.0 stars
- Real-time accuracy within 30 seconds
- Trip planning results within 3 seconds
- AODA compliant (WCAG 2.1 AA)
- Clean, maintainable codebase

---

## Questions Resolved

| Question | Decision |
|----------|----------|
| Offline support? | Yes - cache schedules |
| Fare payment? | Future consideration (architecture ready) |
| Languages? | English only for MVP |
| GO Transit integration? | Barrie Transit only |
| User accounts? | Yes - full accounts |
| Analytics? | Full usage tracking |
| In-app feedback? | Yes |
| Off-hours display? | Show next day schedule |
| Stop tap action? | Bottom sheet with arrivals |
| Trip origin? | Current location default |
| Route options display? | Cards below map |
| Future trips? | Yes - time picker |
| Detour detection? | Fully automatic (future) |
| Notifications timing? | Smart (walk time based) |
| Active guidance? | Yes - "get off next stop" |
