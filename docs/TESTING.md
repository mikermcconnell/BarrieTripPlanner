# Testing Guide

This file documents the practical testing setup for BTTP.

Read `AGENTS.md`, `README.md`, and `docs/API-PROXY-OPERATIONS.md` first. This guide complements them; it does not override them.

For live auto-detour validation, use [`AUTO-DETOUR-QA-CHECKLIST.md`](./AUTO-DETOUR-QA-CHECKLIST.md).

## Current test surfaces

BTTP has two separate automated test surfaces:

1. **App tests** — run from the repo root with Jest
   - cover app utilities, hooks, services, and selected component behavior
   - live under `src/**/__tests__` and `src/utils/__tests__`

2. **API proxy tests** — run from `api-proxy/`
   - cover backend helpers and `/api/*` route behavior
   - live under `api-proxy/__tests__`

The root Jest config intentionally ignores `api-proxy/` so the app and backend suites stay isolated.

## Commands

From the repo root:

```bash
npm test
```

Runs the **app** test suite.

```bash
npm run test:app
```

Runs the same app suite explicitly.

```bash
npm run test:api
```

Runs the standalone `api-proxy` test suite.

```bash
npm run test:all
```

Runs both suites, app first and API second.

## Recommended test pyramid for this repo

### 1) Unit tests — highest volume

Use unit tests for logic that is easy to isolate and expensive to break:

- route and trip building
- arrival calculations
- navigation view-model logic
- detour geometry and summaries
- map viewport calculations
- route labels, line styling, and utility transforms
- auth and proxy request option helpers

These tests should stay fast, deterministic, and independent of live feeds.

### 2) Integration-style tests — targeted

Use focused integration tests where multiple modules must work together:

- trip planning orchestration
- detour overlays and detour integration behavior
- backend health and diagnostics flows
- API route validation and filter parsing

Prefer mocked fetch, mocked Firebase, and fixed time inputs.

### 3) Component / screen behavior tests — selective

Add component or screen tests only where they protect meaningful rider behavior:

- alert surfaces
- detour banners / legends
- map interaction adapters
- high-risk state-dependent UI summaries

Avoid brittle snapshot-heavy tests for large orchestration screens unless there is a specific regression to guard.

### 4) Manual smoke checks — required for release confidence

Automated tests do not replace real workflow checks for:

- web map load via `npm run web:dev`
- Android dev-client launch via `npm run android:dev`
- trip planning end-to-end with proxied data
- live arrivals rendering
- favorites visibility and navigation handoff
- alerts and detour presentation on real screens

## What to mock by default

Prefer mocks, fixtures, or emulators for:

- GTFS and GTFS-RT feeds
- Firebase auth / admin clients
- LocationIQ
- browser-only or device-only APIs
- timers, dates, and animation frames when asserting time-based logic

Do **not** make live network calls part of normal automated test runs.

## Higher-level smoke / e2e recommendation

BTTP does **not** currently need a heavy e2e stack by default.

Recommended next step when the team wants higher confidence:

- keep Jest as the main automated safety net
- add a **small** smoke layer only for the most important rider flows:
  - open app to map
  - search for a stop or route
  - open arrivals for a stop
  - plan a trip
  - start navigation

If an e2e tool is added later, keep scope narrow:

- one mobile smoke path
- one web smoke path
- mocked or controlled backend inputs whenever possible

## Manual verification checklist

For meaningful transit changes, manually verify:

1. **Main flow**
   - load the app and confirm the main screen renders
2. **Realistic case**
   - plan a normal trip and inspect arrivals / route details
3. **Edge case**
   - no alerts, multiple alerts, or a delayed trip
4. **Regression check**
   - confirm map interactions and search still work
5. **Plausibility**
   - outputs look believable for Barrie Transit, not just technically valid

## Current priorities for added coverage

When adding tests, prefer these gaps first:

- alerts
- arrivals
- favorites behavior
- rider-facing search edge cases
- API route parsing and auth boundaries
- any bug fix in `HomeScreen*`, `NavigationScreen*`, or the proxy auth layer
