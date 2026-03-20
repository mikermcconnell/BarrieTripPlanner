# ORCHESTRATOR.md

This file is the living memory for BTTP. Use it when the thread may be compacted or when you need a fast, durable snapshot of the repo’s shape, conventions, and known risks.

It is a companion to `AGENTS.md`, not a replacement for it.

## How to use this file

- Read this file after `AGENTS.md`, `README.md`, and the repo-specific docs called out there.
- Treat it as a stable summary of current reality, not a roadmap.
- Prefer implemented code over older plans when they conflict.
- If something here becomes stale, update this file along with the code change that caused the drift.

## Read order / source of truth

Follow the repo-local hierarchy:

1. `AGENTS.md` — repo entrypoint and context boundaries
2. `README.md` — product surface, setup, and day-to-day commands
3. `docs/API-PROXY-OPERATIONS.md` — backend deployment, auth, and detour worker operations
4. `docs/AUTO-DETOUR-DETECTION.md` — detour behavior, geometry, and rider-facing detour UX
5. `docs/plans/` and archived docs — background only unless a task explicitly revives them

## Current architecture summary

### App / frontend

- The app is an Expo + React Native project with native MapLibre and web MapLibre GL JS.
- Main app bootstrap lives in `App.js`.
- `App.js` wires startup checks, font loading, onboarding gating, error handling, and the top-level provider stack.
- The main provider chain is:
  - `GestureHandlerRootView`
  - `ThemeProvider`
  - `SafeAreaProvider`
  - `ErrorBoundary`
  - `AuthProvider`
  - `TransitProvider`
  - `NavigationContainer`
  - `TabNavigator`
- The main navigation surface is a 3-tab layout:
  - Map
  - Search
  - Profile
- The biggest frontend orchestration surfaces are:
  - `src/screens/HomeScreen.js`
  - `src/screens/HomeScreen.web.js`
  - `src/screens/NavigationScreen.js`
  - `src/screens/NavigationScreen.web.js`

### Backend / runtime

- The repo has two different backend/proxy systems.

#### 1) Local dev proxy

- `proxy-server.js`
- Used for local web development and proxying browser-only fetches.
- Provides:
  - `/proxy?url=...`
  - geocoding and walking-direction endpoints
  - health endpoints
- It is dev-oriented and permissive compared with the deployable backend.

#### 2) Deployable backend

- `api-proxy/`
- Standalone Express server and Firebase Functions HTTP export.
- Handles:
  - API auth
  - geocoding / reverse geocoding / walking directions
  - survey routes
  - detour status, debug, logs, rollout health, and baseline routes
  - news status
- The backend runtime and deployment model are documented in `docs/API-PROXY-OPERATIONS.md`.

### Major module boundaries and entry points

- `App.js` — app bootstrap
- `src/navigation/TabNavigator.js` — top-level tab and stack navigation
- `src/context/TransitContext.js` — static GTFS, realtime, alerts, detours, news, routing data, diagnostics
- `src/context/AuthContext.js` — Firebase auth, favorites, trip history, local fallback behavior
- `src/context/ThemeContext.js` — theme preference state, though most UI currently reads tokens directly from `src/config/theme.js`
- `src/services/` — GTFS, routing, geocoding, walking, realtime, proxy auth, and other feature services
- `src/hooks/` — most feature logic lives here
- `api-proxy/index.js` — deployable backend entry point
- `proxy-server.js` — local development proxy entry point

## Conventions and patterns

### Provider / context boundaries

- Global app state is intentionally split across contexts rather than buried inside screens.
- `TransitContext` is the main transit data layer.
- `AuthContext` owns auth-related app state and user data.
- Screens should usually consume context and hooks, not duplicate shared data logic.

### `.web.js` override pattern

- Shared modules use `.js` by default.
- Web-specific behavior is implemented in `.web.js` files where needed.
- The web map layer uses compatibility components so shared hooks can work across native and web.

### Hooks / services pattern

- Big screens should stay orchestration-heavy and push reusable logic into hooks and services.
- Feature logic is usually expected to live in:
  - `src/hooks/*`
  - `src/services/*`
- This is the preferred place for route planning, viewport logic, overlays, polling, and other domain behavior.

### Testing layout

- App tests live under `src/**/__tests__`
- Backend tests live under `api-proxy/__tests__`
- Root Jest and backend Jest are separate test surfaces, but the root test run can still discover backend tests
- Tests are mostly unit / integration style with mocked network, Firebase, time, and storage dependencies

## Known fragile / non-obvious areas

- There are two proxy/backend systems, and they are not interchangeable:
  - local dev proxy supports `/proxy`
  - deployable backend focuses on `/api/*`
- Background worker loops are in-process and appear to rely on process lifetime. That is fine in a single instance, but could be risky if the backend is scaled in multiple instances. This is an inference from the code structure.
- `HomeScreen*` and `NavigationScreen*` are large orchestration files and likely the most delicate frontend surfaces.
- Theme context exists, but most UI currently imports static theme tokens directly.
- Some data paths are duplicated, especially around alerts and transit state.
- GTFS parsing and GTFS-RT decoding are hand-rolled, which keeps dependencies light but makes feed-shape changes more brittle.
- Some docs and comments show migration drift; always prefer the implemented code over stale wording.

## Future subagent working rules

- Start with the repo entry docs before making assumptions.
- Prefer implemented code over historical plans.
- Keep changes tightly scoped to the task.
- When the user has asked for sub-agent or delegated execution, implementation tasks should usually be delegated to sub-agents rather than handled entirely in the main thread. If higher-priority instructions limit sub-agent use, follow those limits.
- Verify the work before reporting back.
- Note the current working tree state before assuming the repo is clean; this repo has already been observed in a dirty state during inspection.
- If you need to update this file, keep it concise and factual.

## Current verified baseline

Latest repo inspection in this thread established the following baseline:

- App stack: Expo SDK 54, React Native 0.81, Firebase, native MapLibre, web MapLibre GL JS
- Main bootstrap: `App.js`
- Main navigation: `src/navigation/TabNavigator.js`
- Major app data layer: `src/context/TransitContext.js`
- Major auth layer: `src/context/AuthContext.js`
- Backend split:
  - `proxy-server.js` for local dev proxying
  - `api-proxy/` for deployable backend behavior
- Test / parity verification status at the time of inspection:
  - root tests: 47 suites passed, 2 failed
  - `api-proxy` tests: 8 suites passed, 1 failed
  - platform parity check: completed with 4 warnings and a zero exit code
- The repo was already dirty during inspection; this file was added without touching other files.
