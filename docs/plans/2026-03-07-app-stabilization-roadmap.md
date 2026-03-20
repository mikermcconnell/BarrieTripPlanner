# App Stabilization Roadmap

Date: 2026-03-07
Status: Proposed follow-on roadmap
Owner: Codex

> Non-default context. This is a dated maintainability roadmap, not the top-level repo contract.
> Read `AGENTS.md`, `README.md`, and `2026-03-07-phase-0-3-deliverables.md` first.

## Objective

Improve the app's long-term maintainability without doing a full rewrite.

This roadmap assumes:

- the current app is worth continuing
- the domain logic and test suite are assets to preserve
- the main problem is architectural sprawl, not missing functionality

## Assessment Summary

The app already contains meaningful product and engineering value:

- real-time vehicles, GTFS parsing, and local routing
- detour detection and backend publishing
- auth, favorites, alerts, notifications, news, and surveys
- CI coverage and a large passing test suite

The main long-run risks are:

- very large, multi-responsibility screens and contexts
- web/native drift across duplicated `.js` and `.web.js` implementations
- overlapping or legacy flows still present in the codebase
- config and secret handling that should be stricter
- client/backend boundaries that are not yet clean enough

## Guiding Principles

- Do not rewrite domain logic that already works and is covered by tests.
- Prefer staged refactors that preserve behavior.
- Reduce platform duplication before adding major new features.
- Make production configuration strict and explicit.
- Treat navigation reliability and trip-planning trust as core product quality.

## Non-Goals

- No full greenfield rebuild.
- No major visual redesign as a first step.
- No broad new feature expansion until the app shell is more maintainable.
- No unnecessary migration away from Expo/React Native unless a specific constraint demands it.

## Phase 0: Baseline And Safety

Target window: Week 1

### Goals

- establish a clean operational baseline
- remove ambiguity around secrets, config, and active product scope

### Work

1. Audit repository hygiene.
   - remove or ignore residual temp artifacts, generated files, and operational leftovers from the repo root
   - confirm which secrets are intentionally local-only and which values must move to environment configuration

2. Tighten startup and environment validation.
   - remove the invalid Firebase fallback path in `src/config/firebase.js`
   - replace silent degradation with a clear startup failure state for misconfigured production builds
   - move hardcoded auth provider config, including Google client IDs, into validated configuration

3. Review Firestore/public data boundaries.
   - confirm whether `activeDetours`, `detourHistory`, `transitNews`, and related public documents are intentionally world-readable
   - document the reasoning and adjust rules if the data should be app-authenticated instead

4. Freeze current product scope.
   - decide the core v1 surface:
     - map
     - stop and route search
     - arrivals
     - trip planning
     - navigation
     - alerts
     - favorites
   - classify news, surveys, and other secondary flows as supporting features

### Deliverables

- a cleaned-up ignore/artifact policy
- stricter config handling
- a documented v1 feature list
- a short security/config follow-up list

### Exit Criteria

- production config failures are explicit and reproducible
- no critical secrets/config values are hardcoded in app logic
- the team has a written answer to what is core vs optional

## Phase 1: Product Surface Cleanup

Target window: Week 2

### Goals

- reduce product and code-path ambiguity
- remove or quarantine dead and overlapping flows

### Work

1. Inventory routes, screens, and entry points.
   - identify screens that are active, legacy, experimental, or orphaned
   - specifically verify whether standalone flows like `TripPlannerScreen` are still part of the intended product

2. Remove or demote duplicate flows.
   - if a screen is superseded by the integrated map/trip flow, remove it from active ownership
   - if it must stay temporarily, document that status clearly

3. Separate core and secondary navigation.
   - keep the primary app shell focused on the transit journey
   - ensure surveys, news, and profile utilities do not shape the main architecture more than necessary

4. Align docs with the real app.
   - update README and internal planning docs to match the actual feature set and intended ownership

### Deliverables

- a route/screen inventory
- deprecated-flow decisions
- updated docs reflecting the real product surface

### Exit Criteria

- no unclear ownership for major screens
- no known legacy screens left in an ambiguous state
- README and navigation structure broadly match reality

## Phase 2: Structural Refactor Of Core Screens

Target window: Weeks 3-5

### Goals

- break up oversized screens and context responsibilities
- make core trip and map behavior easier to change safely

### Priority Targets

- `src/screens/HomeScreen.js`
- `src/screens/HomeScreen.web.js`
- `src/screens/NavigationScreen.js`
- `src/screens/NavigationScreen.web.js`
- `src/context/TransitContext.js`
- `src/services/tripService.js`

### Work

1. Extract controller hooks from large screens.
   - move orchestration logic into focused hooks for:
     - map state
     - trip planning state
     - route selection
     - overlays and detours
     - navigation progression

2. Thin the screen components.
   - screen files should primarily assemble UI and platform-specific rendering
   - avoid keeping data loading, trip orchestration, and map interaction logic mixed together

3. Shrink `TransitContext`.
   - separate static GTFS concerns from realtime concerns more explicitly
   - consider whether some state belongs in screen-level hooks rather than a global provider

4. Standardize error handling.
   - route operational errors through `logger` and consistent UI surfaces
   - reduce scattered direct `console.error` usage in app code

5. Preserve tests while refactoring.
   - add targeted tests around newly extracted hooks or helpers
   - keep behavior-preserving refactors small and verifiable

### Deliverables

- smaller screen files
- extracted controller hooks with clearer ownership
- reduced context complexity
- better error-handling consistency

### Exit Criteria

- Home and Navigation are materially smaller and easier to reason about
- shared business logic is outside platform renderers
- refactors are covered by existing and targeted new tests

## Phase 3: Platform Boundary Cleanup

Target window: Weeks 6-7

### Goals

- reduce web/native drift without forcing a rewrite
- define exactly what should be shared vs platform-specific

### Work

1. Classify each `.js` / `.web.js` pair.
   - shared logic
   - shared UI contract but different renderer
   - unnecessary duplication

2. Keep platform splits only where they are justified.
   - map rendering
   - sheet/popup mechanics
   - platform-only location or gesture behavior

3. Move shared behavior below the rendering layer.
   - business rules, selection logic, itinerary transforms, overlay decisions, and navigation state should live in shared hooks/services

4. Use the parity check as a controlled backlog.
   - address unintentional drift
   - explicitly document intentional divergence

### Deliverables

- a platform-boundary matrix
- reduced duplicate logic across web/native pairs
- parity warnings either fixed or documented as intentional

### Exit Criteria

- web/native duplication is mostly rendering-level, not business-logic-level
- the parity report is understandable and actionable

## Phase 4: Reliability Features And Trust Gaps

Target window: Weeks 8-9

### Goals

- close the most important user-facing reliability gaps

### Work

1. Implement off-route recalculation for navigation.
   - complete the current TODO path in navigation when a rider deviates from the walking route

2. Make trip-planning behavior explicit.
   - document and simplify the fallback order between local routing, backend routing, mock/dev behavior, and walking enrichment
   - reduce hidden fallback behavior where possible

3. Improve observability.
   - ensure important failures are measurable in logs/Sentry
   - add targeted diagnostics around routing failures, stale data, and backend availability

4. Validate performance on real devices.
   - focus on Home and Navigation interactions under realistic data volume

### Deliverables

- rerouting support
- clearer trip-planning fallback model
- better operational diagnostics

### Exit Criteria

- the app handles off-route situations credibly
- routing failures are easier to diagnose
- core flows remain stable under device testing

## Phase 5: Backend And Data Boundary Hardening

Target window: Weeks 10-11

### Goals

- reduce coupling between the app and backend service
- make long-run deployment and maintenance simpler

### Work

1. Decouple backend packaging.
   - remove unnecessary coupling like `file:..` app dependency usage in `api-proxy/package.json` if it is not essential

2. Clarify backend authority.
   - decide which responsibilities belong server-side long term:
     - geocoding proxy
     - detour detection and publishing
     - survey/news administration
     - possible future authoritative trip-planning endpoints

3. Standardize auth expectations across client and backend.
   - clearly separate public data access, authenticated app access, and admin-only operations

4. Document deployment and operational model.
   - required secrets
   - scheduled jobs
   - health checks
   - rollback considerations

### Deliverables

- clearer backend ownership boundaries
- reduced package coupling
- deployment/ops documentation

### Exit Criteria

- backend responsibilities are intentional and documented
- deployment does not rely on hidden repo coupling

## Phase 6: Resume Feature Delivery

Target window: Week 12 onward

### Goals

- return to feature work on a cleaner foundation

### Good Candidates After Cleanup

- navigation polish and rider guidance improvements
- more robust alert and detour UX
- favorites/history quality-of-life improvements
- performance tuning for dense map states
- optional secondary features once core flows are stable

### Rule For New Features

No large new feature should reintroduce:

- giant multi-responsibility screens
- hidden config requirements
- platform-specific business logic duplication
- backend/client responsibility confusion

## Recommended Execution Order

1. Phase 0: Baseline And Safety
2. Phase 1: Product Surface Cleanup
3. Phase 2: Structural Refactor Of Core Screens
4. Phase 3: Platform Boundary Cleanup
5. Phase 4: Reliability Features And Trust Gaps
6. Phase 5: Backend And Data Boundary Hardening
7. Phase 6: Resume Feature Delivery

## Success Metrics

Track progress with a small set of concrete measures:

- reduced file size and responsibility concentration in Home and Navigation
- fewer platform parity warnings
- zero hardcoded production auth/config values in app logic
- explicit startup failure for invalid production config
- off-route recalculation implemented
- stable CI and green test suite throughout refactors

## Immediate Next Actions

If work starts now, the first implementation pass should be:

1. tighten config and startup behavior
2. audit/remove dead or overlapping flows
3. split Home and Navigation into controller hooks plus thinner renderers
4. implement rerouting

That sequence gives the best long-run return without discarding the existing product and test investment.
