# Phase 0-3 Deliverables

Date: 2026-03-07
Status: Completed
Owner: Codex

## Phase 0: Baseline And Safety

### Repo Hygiene Policy

- Local secrets are local-only and ignored: `.env*` except `.env.example`
- Ephemeral workspace artifacts are ignored: `.tmp*`, `.claude/worktrees/`
- Standalone temp logs, emulator captures, and scratch bundles should be removed after use instead of checked in

### Runtime Config Baseline

- Startup validation now lives in `src/config/runtimeConfig.js`
- Production-like builds fail closed when required Firebase or proxy env vars are missing
- Firebase no longer initializes with an invalid fallback config
- Native Google sign-in no longer uses a hardcoded client ID; it reads validated env configuration instead

### Public Firestore Boundary Review

Current public-read collections are intentionally world-readable:

- `activeDetours/*`
- `detourHistory/*`
- `transitNews/*`
- `publicDetoursActive/*`
- `publicSystem/*`

Rationale:

- detours, alerts, and rider updates must work for signed-out riders and public web clients
- notification deep links and shared operational feeds should not depend on app auth
- writes remain denied to clients; backend/Admin SDK remains the write authority

Auth-required data remains scoped to signed-in users:

- `users/*`
- `favoriteStops/*`
- `favoriteRoutes/*`
- `tripHistory/*`
- `savedTrips/*`

### Core v1 Feature Surface

Core:

- map
- stop and route search
- arrivals
- trip planning
- navigation
- alerts
- favorites

Supporting:

- onboarding
- profile/account utilities
- settings
- transit news
- surveys and survey results

### Security / Config Follow-Up

- add production deployment docs for required `EXPO_PUBLIC_*` and backend secrets
- decide whether Google sign-in should remain optional or become a production-required env
- audit any remaining root scratch files and generated design artifacts before release packaging

## Phase 1: Product Surface Cleanup

### Active Route Inventory

| Route / screen | Status | Ownership |
| --- | --- | --- |
| `Map` / `MapMain` (`HomeScreen`) | core active | main rider journey shell |
| `Search` | core active | stop/route lookup entry |
| `TripDetails` | core active | itinerary review |
| `Navigation` | core active | active trip execution |
| `Alerts` | core active | service reliability |
| `Favorites` | core active | rider utility in v1 |
| `Profile` / `ProfileMain` | supporting active | account + utility container |
| `OnboardingScreen` | supporting active | pre-shell first-run flow |
| `SignIn`, `SignUp`, `Settings` | supporting active | account management |
| `News`, `Survey`, `SurveyResults` | supporting active | secondary engagement flows |
| `NearbyStops` | legacy/orphaned | removed from repo after deprecation |
| `TripPlannerScreen` | legacy/orphaned | removed; superseded by integrated Home -> TripDetails -> Navigation flow |

### Decisions

- `TripPlannerScreen` is no longer part of the product surface
- `NearbyStops` is no longer mounted as an active route and its orphaned screen implementation has been removed
- `News` and `Survey` remain available only as supporting flows under `Profile`

## Phase 2: Structural Refactor Of Core Screens

### Shared Controller Refactors Landed

- `src/hooks/useTripPreviewViewport.js`
  - owns itinerary auto-fit / reset-on-blur behavior shared by `HomeScreen.js` and `HomeScreen.web.js`
- `src/utils/itineraryViewport.js`
  - centralizes itinerary coordinate collection and bounds derivation
- `src/hooks/useNavigationTripViewModel.js`
  - centralizes renderer-agnostic navigation state derived from the current itinerary leg
- `src/utils/navigationTripViewModel.js`
  - holds tested pure helpers for next-leg previews, final destination, and remaining-distance math
- `src/hooks/useNavigationLocation.web.js`
  - moves browser geolocation out of `NavigationScreen.web.js` and restores a clean platform file boundary

### Error Handling Alignment

- `useTripPlanner` now routes search failures through `logger`
- Firebase news subscription warnings/errors now route through `logger`
- native navigation location startup errors now route through `logger`

## Phase 3: Platform Boundary Cleanup

### Shared vs Platform-Specific Boundary

| Area | Shared below renderer | Platform-specific |
| --- | --- | --- |
| trip preview viewport logic | itinerary coordinate collection, one-shot auto-fit controller | map camera implementation and padding values |
| navigation trip state | next transit leg, transfer preview text, remaining distance, final destination | native MapLibre camera vs web map imperative API |
| navigation location | shared hook contract | Expo location on native, browser geolocation on web |
| map rendering | none | marker/polyline renderer implementations |
| sheets / overlays | data selection and detour computations | native bottom-sheet mechanics vs web modal interactions |

### Documented Intentional Divergences

The parity allowlist in `scripts/check-platform-parity.js` now marks renderer-only differences as intentional for:

- `BusMarker`
- `DetourDetailsSheet`
- `DirectionArrows`
- `RoutePolyline`
- `StopMarker`
- `TripSearchHeader`
- `ZoneInfoSheet`
- `ZoneOverlay`
- `HomeScreen`
- `NavigationScreen`

The parity report should now be treated as backlog signal, not noise.
