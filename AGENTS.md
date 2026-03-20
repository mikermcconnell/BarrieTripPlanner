# BTTP Agent Guide

This file is the repo-local entrypoint for agents and maintainers.

## Read Order

1. Read this file first.
2. Read [README.md](README.md) for the current product surface, environment setup, and day-to-day commands.
3. Read [docs/API-PROXY-OPERATIONS.md](docs/API-PROXY-OPERATIONS.md) for backend deployment, auth, and detour-worker operations.
4. Read [docs/AUTO-DETOUR-DETECTION.md](docs/AUTO-DETOUR-DETECTION.md) only when working on detour behavior, geometry, or rider-facing detour UX.
5. Read files under [docs/plans/](docs/plans/) only when you need dated working notes or cleanup history. They are not default source-of-truth context.

## Source Of Truth

- Repo load order and context boundaries: this file
- Current app setup, scripts, and product surface: [README.md](README.md)
- Backend runtime and deployment model for `api-proxy/`: [docs/API-PROXY-OPERATIONS.md](docs/API-PROXY-OPERATIONS.md)
- Detour feature reference and domain behavior: [docs/AUTO-DETOUR-DETECTION.md](docs/AUTO-DETOUR-DETECTION.md)

## Non-Default Context

Treat these as archival, brainstorming, or tool-specific supplements unless the task explicitly calls for them:

- [docs/archive/ONE_SHOT_PROMPT.md](docs/archive/ONE_SHOT_PROMPT.md)
- [docs/archive/PROJECT_PLAN.md](docs/archive/PROJECT_PLAN.md)
- [docs/archive/IMPLEMENTATION_PLAN.md](docs/archive/IMPLEMENTATION_PLAN.md)
- [docs/archive/FEATURE_IMPROVEMENT_PLAN.md](docs/archive/FEATURE_IMPROVEMENT_PLAN.md)
- [CLAUDE.md](CLAUDE.md)
- [docs/archive/README.md](docs/archive/README.md)
- dated notes under [docs/plans/](docs/plans/)

These files may still contain useful background, but they do not override the current repo reality.

## Current Reality Snapshot

- App stack: Expo SDK 54, React Native 0.81, Firebase, native MapLibre, web MapLibre GL JS
- Native local development uses the dev-client / Android scripts in `package.json`; do not assume Expo Go is the main path
- Web development uses `npm run web:dev` because GTFS and geocoding flows require the proxy
- Core rider surface:
  - map
  - stop and route search
  - arrivals
  - trip planning
  - navigation
  - alerts
  - favorites
- Supporting flows:
  - onboarding
  - profile and auth utilities
  - settings
  - transit news
  - surveys

## Interpretation Rules

- Prefer implemented code over historical planning prose when they conflict.
- Prefer the narrowest doc that owns the concern.
- Do not treat dated plans as active requirements unless they are explicitly revived by the task.
