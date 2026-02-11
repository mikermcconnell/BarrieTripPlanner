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

## Code Organization Rules

### Share Logic, Not Copy It
- **Pure functions** (math, formatting, validation) go in `src/utils/`. Check if one exists before writing inline.
- **Feature state** (3+ related `useState` calls) goes in a custom hook in `src/hooks/`. Both `.js` and `.web.js` import the same hook.
- **Never paste logic into a `.web.js` file.** Extract shared code first, then import in both platform files. Only rendering code should differ.

### What Goes Where
| `src/utils/` | `src/hooks/` | Screen files (`.js` / `.web.js`) |
|---|---|---|
| Pure functions | State + handlers | Platform-specific rendering |
| Data transforms | Side effects | Map components (MapView vs Leaflet) |
| Math (haversine, decode) | Feature logic bundles | Coordinate format conversion |

### Key Shared Modules
- `src/utils/geometryUtils.js` — `haversineDistance` (meters), `safeHaversineDistance` (null-safe). For km, use `haversineDistance(...) / 1000`.
- `src/utils/polylineUtils.js` — `decodePolyline`, `findClosestPointIndex`, `extractShapeSegment`
- `src/hooks/useRouteSelection.js` — route toggle/select/zoom (supports single + multi-select)
- `src/hooks/useTripVisualization.js` — polyline segments, markers, vehicle matching from itineraries
- `src/hooks/useMapTapPopup.js` — tap-to-get-address popup state and handlers

### Guardrails
- **500-line screen limit:** If a screen file exceeds 500 lines, extract hooks.
- **No speculative exports:** Don't build components/exports until something imports them. Delete unused exports immediately.
- **No inline haversine/polyline:** Always import from the shared utils. Never write a local copy.

## Development Environment
- Proxy server needed for GTFS download (CORS): `node proxy-server.js`
- Web dev: `npm run web:dev` (starts proxy + expo web)
- Port 8081 for Metro bundler
- Tests: `npm test` (Jest)
