# Navigation and Runtime Architecture Refactor Plan (Temporary)

Date: 2026-04-10  
Status: Temporary working note  
Purpose: Persist a practical refactor plan from the current systems-design review without promoting it to source-of-truth documentation.

> This file is a dated working note under `docs/plans/`. It does not override implemented code, `AGENTS.md`, `README.md`, or operational docs.

## Why this plan exists

The current changes are directionally good, but they also confirm a broader structural issue:

- navigation behavior is split across very large platform screens plus shared helpers
- itinerary-building logic is carrying too many responsibilities
- transit-specific geometry rules are leaking into generic polyline helpers
- `api-proxy/index.js` is still a multi-mode entrypoint that mixes app, runtime, and deployment concerns

This plan turns that review into an implementation-ready sequence.

---

## Progress log

### 2026-04-10 — Phase 1 continued

Completed:

- extracted shared route-line shaping into:
  - `src/features/navigation/model/buildNavigationRoutePolylines.js`
- extracted shared live-bus marker selection and shaping into:
  - `src/features/navigation/model/buildNavigationVehicleMarkers.js`
- refactored both platform screens to consume the shared helpers:
  - `src/screens/NavigationScreen.js`
  - `src/screens/NavigationScreen.web.js`
- added focused coverage for the extracted shared logic:
  - `src/__tests__/buildNavigationRoutePolylines.test.js`
  - `src/__tests__/buildNavigationVehicleMarkers.test.js`

What improved:

- route polyline progress splitting now lives in one shared place
- live bus marker matching is no longer duplicated between native and web
- both screens now do less route/vehicle shaping and more renderer-specific adaptation

Recommended resume point:

- continue Phase 1 by deciding whether the remaining screen-specific map marker adaptation should stay local or move behind a renderer adapter
- then begin Phase 2 and split `src/services/itineraryBuilder.js`

### 2026-04-10 — Phase 2 started

Completed:

- created initial itinerary-domain helper modules:
  - `src/services/itinerary/buildItinerary.js`
  - `src/services/itinerary/mergeTransitLegs.js`
  - `src/services/itinerary/buildTransitLegGeometry.js`
  - `src/services/itinerary/getIntermediateStops.js`
  - `src/services/itinerary/calculateLegDistance.js`
- reduced `src/services/itineraryBuilder.js` to a thin compatibility export
- added direct itinerary-module coverage:
  - `src/__tests__/itineraryModules.test.js`

What improved:

- itinerary-specific business rules now have clear module homes
- the legacy builder entrypoint remains stable for existing callers
- merge, geometry, stop extraction, and distance logic are now easier to test independently

Recommended resume point:

- continue Phase 2 by moving remaining leg-construction helpers out of `buildItinerary.js` if useful
- then consider Phase 3 and move waypoint-aware transit shape extraction out of `src/utils/polylineUtils.js`

### 2026-04-10 — Phase 3 started

Completed:

- moved waypoint-aware transit shape extraction into a domain module:
  - `src/services/itinerary/transitShapeUtils.js`
- updated itinerary geometry building to use the domain helper:
  - `src/services/itinerary/buildTransitLegGeometry.js`
- removed the transit-specific waypoint extractor from:
  - `src/utils/polylineUtils.js`
- split generic and domain-specific test coverage:
  - `src/__tests__/polylineUtils.test.js`
  - `src/__tests__/transitShapeUtils.test.js`

What improved:

- `polylineUtils` now stays focused on generic polyline helpers
- trip-shape progression rules are easier to discover inside the itinerary domain
- loop-route extraction behavior is still covered, but now in the correct module layer

Recommended resume point:

- continue Phase 3 by checking whether any other transit-semantics helpers still live in generic utility space
- then move to Phase 4 and split `api-proxy/index.js`

### 2026-04-10 — Phase 4 started

Completed:

- moved Express app composition into:
  - `api-proxy/app.js`
- split runtime startup helpers into:
  - `api-proxy/runtime/workers.js`
  - `api-proxy/server.js`
  - `api-proxy/functions.js`
- reduced `api-proxy/index.js` to thin compatibility/runtime glue
- added verification that app import does not start workers:
  - `api-proxy/__tests__/index.routes.test.js`

What improved:

- app composition is now separated from local server startup
- Cloud Functions wrapping is isolated from route definitions
- worker start/stop behavior is easier to reason about and test
- `index.js` remains the deployment-compatible entrypoint while owning much less logic

Verification completed:

- `npm --prefix api-proxy test` passed
- `npm run test:all` passed

Recommended resume point:

- continue Phase 4 by deciding whether to split route registration into dedicated route modules
- or stop here if the main goal was isolating app creation from runtime startup safely

### 2026-04-10 — Phase 4 continued

Completed:

- split API route registration into dedicated modules:
  - `api-proxy/routes/locationIqRoutes.js`
  - `api-proxy/routes/healthRoutes.js`
  - `api-proxy/routes/detourRoutes.js`
  - `api-proxy/routes/baselineRoutes.js`
  - `api-proxy/routes/newsRoutes.js`
- updated `api-proxy/app.js` to mount those route modules while keeping middleware and shared helpers stable

What improved:

- `app.js` now reads more like composition and less like one giant mixed-responsibility file
- route ownership is clearer by concern area
- future API changes can be made with lower risk of unrelated regressions inside one file

Verification completed:

- `npm --prefix api-proxy test` passed
- `npm run test:all` passed

Recommended resume point:

- stop here if the proxy architecture is now clean enough for current needs
- or continue by extracting middleware/config helpers out of `app.js` for an even thinner composition file

### 2026-04-10 — Phase 4 finalized cleanup pass

Completed:

- extracted proxy config/env loading into:
  - `api-proxy/config/env.js`
- extracted middleware helpers into:
  - `api-proxy/middleware/auth.js`
  - `api-proxy/middleware/cors.js`
- extracted request parsing and upstream proxy helpers into:
  - `api-proxy/lib/requestParsing.js`
  - `api-proxy/lib/locationIqProxy.js`
- reduced `api-proxy/app.js` further so it is primarily composition and wiring

What improved:

- config validation, auth, CORS, rate limiting, request parsing, and upstream proxying now have separate ownership
- `app.js` is materially easier to read and safer to change
- future backend work can target smaller modules instead of reopening one large composition file

Verification completed:

- `npm --prefix api-proxy test` passed
- `npm run test:all` passed

Recommended resume point:

- stop here unless you want to do polish-level cleanup
- if continuing, the next work would be documentation polish or very small naming/organization cleanups rather than major structural refactor

### 2026-04-10 — Phase 1 completed

Completed:

- created shared navigation feature modules:
  - `src/features/navigation/model/formatNavigationCopy.js`
  - `src/features/navigation/model/buildNavigationMapModel.js`
  - `src/features/navigation/geometry/buildWalkingLandmarkMarkers.js`
- refactored both platform screens to consume the shared map model:
  - `src/screens/NavigationScreen.js`
  - `src/screens/NavigationScreen.web.js`
- kept `src/utils/navigationMapMarkers.js` as a thin compatibility re-export
- added focused test coverage:
  - `src/__tests__/buildNavigationMapModel.test.js`
- updated existing marker tests to match the extracted shared output

What improved:

- shared walking marker and transit stop marker rules now live in one place
- rider-facing marker copy is no longer owned separately by both screens
- both platform screens now depend on the same shared navigation map model for this slice of behavior

Verification completed:

- targeted app tests for navigation/map-model area passed
- full app suite passed
- screen files parsed successfully after refactor

Verification notes:

- `npm run test:app` passed
- full app test result at completion: **45/45 suites passed, 299/299 tests passed**

Recommended resume point:

- continue Phase 1 by extracting more shared navigation map/view-model behavior out of `NavigationScreen.js` and `NavigationScreen.web.js`
- after that, begin Phase 2 and split `src/services/itineraryBuilder.js`

### Current state summary

| Phase | Status | Notes |
|---|---|---|
| Phase 1 — Shared navigation model extraction | In progress | Initial shared map model and copy extraction completed |
| Phase 2 — Itinerary builder decomposition | Not started | Next major structural cleanup after more NavigationScreen reduction |
| Phase 3 — Generic vs domain geometry split | Not started | Depends partly on Phase 2 extraction |
| Phase 4 — API proxy runtime split | Not started | Separate backend/runtime cleanup workstream |

---

## Main goals

1. Shrink `NavigationScreen.js` and `NavigationScreen.web.js`
2. Make shared navigation behavior live in one place
3. Make itinerary building orchestration-focused instead of logic-heavy
4. Separate generic geometry utilities from transit-domain geometry logic
5. Split API proxy runtime concerns so startup behavior is safer and easier to test

---

## Desired end state

### Navigation feature boundary

Both platform screens should become render-and-wire modules, not business-rule owners.

Target direction:

```text
src/features/navigation/
  model/
    buildNavigationMapModel.js
    buildNavigationStatusModel.js
    formatNavigationCopy.js
  geometry/
    buildWalkingLandmarkMarkers.js
    buildBusPreviewLine.js
  hooks/
    useBusProximity.js
```

Platform screens remain:

```text
src/screens/NavigationScreen.js
src/screens/NavigationScreen.web.js
```

But they should mostly do:

- hook orchestration
- platform-specific map rendering
- screen-level layout and styling

They should not own shared rider-facing rules.

### Itinerary builder boundary

Target direction:

```text
src/services/itinerary/
  buildItinerary.js
  mergeTransitLegs.js
  buildTransitLegGeometry.js
  getIntermediateStops.js
  calculateLegDistance.js
```

`buildItinerary.js` should coordinate, not contain every domain rule.

### Geometry boundary

Keep:

```text
src/utils/polylineUtils.js
```

for generic helpers only.

Move transit-specific ordered waypoint extraction into a transit-domain file:

```text
src/services/itinerary/transitShapeUtils.js
```

or, if reused heavily by navigation preview too:

```text
src/features/navigation/geometry/transitShapeUtils.js
```

### API proxy runtime boundary

Target direction:

```text
api-proxy/
  app.js
  server.js
  functions.js
  middleware/
    auth.js
    cors.js
    rateLimit.js
  routes/
    healthRoutes.js
    detourRoutes.js
    baselineRoutes.js
    locationIqRoutes.js
    surveyRoutes.js
  runtime/
    workers.js
```

`app.js` should compose the Express app.  
`server.js` should do local startup only.  
`functions.js` should wrap Cloud Functions / Firebase deployment only.  
`runtime/workers.js` should own worker start/stop rules.

---

## What should own what

### Screens

Own:

- rendering
- platform-specific map components
- local style and layout
- user interaction wiring

Should not own:

- shared navigation copy rules
- marker-selection rules
- bus preview decision logic
- itinerary interpretation rules

### Shared navigation model layer

Own:

- walking landmark marker construction
- boarding/alighting marker detail rules
- rider-facing navigation copy
- map annotation decisions
- preview line selection inputs and outputs

### Hooks

Own:

- polling
- live vehicle matching
- proximity state
- realtime-derived tracking state

Should not own:

- screen-specific text formatting
- platform rendering concerns

### Itinerary services

Own:

- leg construction
- merge rules
- intermediate stop extraction
- route geometry generation
- fallback geometry rules

### Generic utilities

Own:

- reusable math
- polyline encoding/decoding
- generic closest-point helpers

Should not own:

- transit trip semantics
- stop-sequence-aware routing rules

### API runtime modules

Own:

- process startup mode
- worker lifecycle
- server vs function wrapper behavior
- middleware composition

Should not own:

- unrelated route logic in the same file

---

## Recommended implementation sequence

## Phase 1 — Shared navigation model extraction

**Status:** In progress  
**Current progress:** initial shared map model, walking marker builder, and shared copy formatter are complete

### Goal

Reduce duplication and stop adding shared behavior directly to both platform screens.

### Create

```text
src/features/navigation/model/buildNavigationMapModel.js
src/features/navigation/model/formatNavigationCopy.js
src/features/navigation/geometry/buildWalkingLandmarkMarkers.js
```

### Move or consolidate

From:

- `src/utils/navigationMapMarkers.js`
- inline marker shaping in `NavigationScreen.js`
- inline marker shaping in `NavigationScreen.web.js`

Into:

- one shared map model layer

### Suggested responsibilities

#### `formatNavigationCopy.js`

Own functions like:

- boarding ETA text
- status strings such as “Bus is here”
- short rider-facing labels used in multiple renderers

#### `buildWalkingLandmarkMarkers.js`

Own:

- marker IDs
- marker types
- marker coordinates
- marker title/caption/detail

Should accept proximity state as input, not compute it.

#### `buildNavigationMapModel.js`

Own:

- combining walking markers
- transit stop markers
- bus preview line inputs
- any shared marker/popup model used by both screens

### Safe sequencing

1. Extract copy helpers first
2. Move walking marker construction next
3. Build a shared map model
4. Make native screen consume it
5. Make web screen consume the same model
6. Remove duplicated shaping logic

### Success criteria

- a shared navigation marker change touches one shared module
- both screens only adapt model output to their renderer
- no new rider-facing rule is added separately in both screens

---

## Phase 2 — Itinerary builder decomposition

### Goal

Make itinerary construction easier to reason about and safer to change.

### Create

```text
src/services/itinerary/buildItinerary.js
src/services/itinerary/mergeTransitLegs.js
src/services/itinerary/buildTransitLegGeometry.js
src/services/itinerary/getIntermediateStops.js
src/services/itinerary/calculateLegDistance.js
src/services/itinerary/transitShapeUtils.js
```

### Proposed ownership

#### `buildItinerary.js`

Own:

- sequencing of legs
- totals
- top-level itinerary object assembly

Should call helpers for everything else.

#### `mergeTransitLegs.js`

Own:

- same-route merge rules
- removal of false transfer walks
- merged leg geometry rebuild trigger

#### `buildTransitLegGeometry.js`

Own:

- shape selection
- ordered waypoint segment extraction
- fallback straight-line geometry

#### `getIntermediateStops.js`

Own:

- stop-time lookup
- extraction of in-between stops

#### `calculateLegDistance.js`

Own:

- path distance accumulation

#### `transitShapeUtils.js`

Own:

- stop-sequence-aware segment extraction
- trip-shape traversal rules

### Safe sequencing

1. Move pure helpers first with no behavior changes
2. Add file-local tests or move existing tests as needed
3. Keep `buildItinerary` exports stable during extraction
4. Only after extraction, consider deeper cleanup of merge semantics

### Success criteria

- `buildItinerary.js` becomes an orchestrator
- geometry fixes no longer require editing a giant mixed-responsibility file
- transit-domain geometry rules live outside generic utility space

---

## Phase 3 — Generic vs domain geometry split

### Goal

Prevent `polylineUtils.js` from becoming a catch-all transit logic file.

### Keep in `src/utils/polylineUtils.js`

- `decodePolyline`
- `encodePolyline`
- `findClosestPointIndex`
- `extractShapeSegment`
- other generic polyline/math helpers

### Move out

- ordered waypoint segment extraction
- any logic that assumes stop order or trip progression

### Reason

The current waypoint-aware extraction is useful, but it is not generic. It encodes transit leg semantics, not just polyline math.

### Success criteria

- a developer can look at `polylineUtils.js` and expect generic helpers only
- transit-specific geometry rules are clearly discoverable in one domain module

---

## Phase 4 — API proxy runtime split

### Goal

Reduce operational risk from one large multi-mode entrypoint.

### Create

```text
api-proxy/app.js
api-proxy/server.js
api-proxy/functions.js
api-proxy/runtime/workers.js
api-proxy/middleware/auth.js
api-proxy/middleware/cors.js
api-proxy/middleware/rateLimit.js
api-proxy/routes/locationIqRoutes.js
api-proxy/routes/healthRoutes.js
api-proxy/routes/detourRoutes.js
api-proxy/routes/baselineRoutes.js
```

### Proposed ownership

#### `app.js`

Own:

- express construction
- middleware registration
- route mounting

Should not:

- start listeners
- decide deployment mode
- start workers directly

#### `server.js`

Own:

- `app.listen`
- local process signal handling
- local worker startup and shutdown

#### `functions.js`

Own:

- Firebase / `onRequest` wrapper
- Cloud runtime worker-start decision

#### `runtime/workers.js`

Own:

- worker enablement checks
- start/stop helpers
- environment-specific worker lifecycle rules

### Safe sequencing

1. Extract middleware with stable signatures
2. Extract route modules without changing endpoint behavior
3. Extract worker lifecycle helpers
4. Add `app.js`
5. Add `server.js`
6. Add `functions.js`
7. Leave `index.js` as a temporary compatibility wrapper if needed, then reduce it

### Success criteria

- app creation can be imported in tests without side effects
- worker startup is explicit and testable
- Cloud wrapper no longer shares a giant file with route definitions

---

## Exact first-pass file moves

These are the most practical first moves, in order:

1. **Create shared navigation copy formatter**
   - new: `src/features/navigation/model/formatNavigationCopy.js`
   - move: boarding ETA detail formatting from `src/utils/navigationMapMarkers.js`

2. **Move walking marker builder into feature space**
   - new: `src/features/navigation/geometry/buildWalkingLandmarkMarkers.js`
   - keep old file as thin re-export temporarily if needed

3. **Create shared navigation map model**
   - new: `src/features/navigation/model/buildNavigationMapModel.js`
   - start with walking markers only, then expand

4. **Refactor screens to consume shared map model**
   - update: `src/screens/NavigationScreen.js`
   - update: `src/screens/NavigationScreen.web.js`

5. **Create itinerary folder and move pure helpers**
   - new: `src/services/itinerary/*`
   - old `src/services/itineraryBuilder.js` becomes thin wrapper temporarily

6. **Move waypoint-based shape extraction**
   - new: `src/services/itinerary/transitShapeUtils.js`
   - remove transit-specific function from `src/utils/polylineUtils.js`

7. **Split proxy entrypoint**
   - new files under `api-proxy/middleware/`, `api-proxy/routes/`, `api-proxy/runtime/`
   - `api-proxy/index.js` becomes thin compatibility glue or is retired

---

## Risks during refactor

### 1. Web/native behavior drift during extraction

Mitigation:

- extract shared model before doing visual cleanup
- compare both screen outputs against the same input fixtures

### 2. Hidden coupling inside `NavigationScreen*`

Mitigation:

- move one concern at a time
- preserve prop names and output shape until shared model stabilizes

### 3. Geometry regressions on loop routes

Mitigation:

- keep and extend the new waypoint-order tests
- add at least one multi-stop merged-leg case

### 4. Proxy startup regressions

Mitigation:

- keep route tests green after each extraction step
- verify import-without-start side effects
- verify standalone local startup separately

---

## Testing and verification plan

For each phase:

### Automated

- app tests for navigation utils and itinerary geometry
- API tests for proxy route behavior and startup-safe imports

### Manual

- native navigation flow
- web navigation flow
- one loop-route or near-endpoint route case
- proxy health and detour ops endpoints if proxy files are touched

### Existing tests worth preserving

- `src/__tests__/navigationMapMarkers.test.js`
- `src/__tests__/polylineUtils.test.js`
- `src/__tests__/webMapView.test.js`
- `api-proxy/__tests__/index.routes.test.js`

Add more shared-model tests before deleting duplicated screen logic.

---

## Definition of done

This refactor should be considered successful when:

1. `NavigationScreen.js` and `NavigationScreen.web.js` are materially smaller
2. Shared navigation display logic lives in one feature-level model layer
3. `buildItinerary` is orchestration-focused
4. Generic geometry utilities no longer carry transit-specific business rules
5. API proxy app creation is isolated from runtime startup behavior

---

## Biggest payoff move

If only one part gets completed first, it should be:

**Extract a shared navigation map/view-model layer and make both platform screens consume it.**

That will reduce duplication, improve testability, and lower the chance of web/native drift more than any other single step.
