# Barrie Transit Trip Planner

## Platform Rules
This is a cross-platform app (React Native + Web via Expo). ALWAYS update BOTH native files AND their `.web.js` counterparts when making changes. Never assume the user is testing on native — check for web versions of every file you edit.

Known platform file pairs to watch:
- `src/screens/HomeScreen.js` / `HomeScreen.web.js`
- `src/components/TripBottomSheet.js` / `TripBottomSheet.web.js`
- `src/components/BusMarker.js` / `BusMarker.web.js`
- Any map, route, or stop components

Before making UI changes, check with `Glob` for `.web.js` counterparts of every file you plan to edit.

## Post-Edit Verification
After installing new packages or modifying package.json, ALWAYS run `npm install` before testing. After any code changes, verify no build errors before reporting completion. Run `npm test` if tests exist for the modified area.

## UI Changes Approach
When implementing UI changes, confirm which platform (web vs native) the user is actively testing on FIRST. Prefer inline/incremental UI changes over modal approaches unless explicitly requested. For map-related work, verify z-index layering. Use `backgroundColor` not `background` in React Native styles. Use `react-native-svg` (`<Svg>`, `<Path>`) in native files — DOM `<svg>` is only valid in `.web.js` files.

## Navigation & Routing
The app uses React Navigation with this structure:
- **Tab Navigator:** `Map`, `Search`, `Profile`
- **Map Stack:** `MapMain`, `NearbyStops`, `Alerts`, `TripDetails`, `ScheduleEditor`
- **Profile Stack:** `ProfileMain`, `SignIn`, `SignUp`, `Favorites`, `Settings`

ALWAYS verify route names against `src/navigation/TabNavigator.js` before using them in navigation calls. The main map screen is `MapMain`, NOT `Main` or `Home`.

## GTFS & Transit Data
Barrie Transit routes may have sub-variants (e.g., Route 8 splits into 8A and 8B). When debugging route display or trip pairing issues, always check for route_id variants in the GTFS data first. Be careful with round-trip pairing — trips must be temporally adjacent, not just directionally opposite.

## Development Environment
- Proxy server needed for GTFS download (CORS): `node proxy-server.js`
- Web dev: `npm run web:dev` (starts proxy + expo web)
- Port 8081 for Metro bundler
- Tests: `npm test` (Jest)
