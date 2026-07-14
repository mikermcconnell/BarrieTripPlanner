# Android Main Map Friendly Refinement — Implementation and Spec Plan

Date: July 10, 2026
Status: Implemented and runtime-verified; release build blocked by native linker
Primary executor: Sol Medium or another implementation-focused model
Scope owner: Native Android `HomeScreen` map experience

## 1. Purpose

Refine the Android main map so it feels calm, friendly, trustworthy, and production-ready while preserving the existing rider workflows.

The screen must remain map-first. Live buses are the primary signal. Route geometry, hubs, notices, search, filters, and navigation must support the map rather than compete with it.

This plan covers all recommendations from the July 10 Android frontend review:

1. Reduce default map clutter.
2. Redesign live bus markers and direction treatment.
3. Simplify the top search and status area.
4. Correct bottom navigation height and safe-area handling.
5. Consolidate the route rail and location control.
6. Normalize the primary icon language.
7. Make notices compact and expandable.
8. Improve bus motion performance and stale-data behavior.
9. Add bus selection with a compact information card.
10. Add production-grade accessibility, regression coverage, and release verification.

## 2. Finishing Contract

Do not call this work complete until all of the following are true:

- The default all-routes map is visibly calmer than the July 10 baseline.
- A selected-route view remains vivid and clearly focused.
- Live buses are legible at every supported zoom tier.
- Nearby buses combine only at city-wide context zoom; individual buses return by normal corridor zoom.
- Bus direction is integrated into the marker rather than shown as a detached black triangle.
- A bus can be selected without breaking map pan or zoom gestures.
- The top search area is one surface, not a search card over a second large translucent backdrop.
- The route rail and location action read as one bottom control tray.
- Route chips and all other primary actions have at least 44 dp touch targets.
- Bottom navigation clears both gesture navigation and three-button Android navigation without excessive blank space.
- Active, planned, and holiday notices use the same compact visual grammar.
- The all-routes animation path performs materially better than the current per-bus React animation path.
- TalkBack labels, selected states, and stale/offline states are understandable.
- Existing stop, detour, trip-planning, saved-place, route-selection, and navigation flows still work.
- The app test suite passes.
- A current release APK builds and the final screen is verified in the release build, not only in the dev client.

## 3. Source of Truth and Required Reading

Read these before editing:

1. `AGENTS.md`
2. `README.md`
3. `docs/TESTING.md`
4. `docs/AUTO-DETOUR-DETECTION.md` when changing detour-visible map behavior
5. `docs/plans/2026-03-13-home-screen-route-line-visual-rules.md`

The March route-line document remains useful background, with one deliberate refinement in this plan:

- Individual buses must remain visible at normal operating zooms.
- At city-wide context zoom only, MapLibre clustering may combine buses that cannot be read separately.
- Selecting a cluster zooms in so every bus can be reached.

## 4. Baseline Observed on July 10

Review environment:

- Android emulator: 1080 × 2400
- Production APK: `builds/BTTP-1.0.6-16-production.apk`, built June 28, 2026
- Live fleet observed: 32 vehicles
- Default state: all routes visible
- Comparison state: route 400 selected, two active buses

Observed strengths:

- Clear map-first product model
- Strong route colours
- Good selected-route emphasis
- Outfit typography already loaded
- Friendly rounded surfaces and blue/green palette
- Existing route-family selection is easy to understand

Observed problems:

- Every route line renders at full opacity in the default state.
- Bus markers, detached direction arrows, hub labels, route lines, and controls collide.
- The top backdrop is 118 dp high even when only the search row is needed.
- The bottom tab bar adds a 56 dp fallback inset plus a 10 dp lift, producing excessive empty space on gesture navigation.
- Route chips are 38 dp high, below the 44 dp target.
- The last route chip is intentionally clipped behind a fade and the location button.
- The primary icon family is visually heavier and more cartoon-like than the rest of the map chrome.
- Android animates each bus through an independent `requestAnimationFrame` and React state loop.

Measured emulator frame data, for directional comparison only:

| State | New janky frames | Median frame | 90th percentile |
| --- | ---: | ---: | ---: |
| All routes / full fleet | 3.17% | 29 ms | 36 ms |
| Route 400 selected | 0.33% | 25 ms | 31 ms |

Do not treat emulator numbers as real-device guarantees. Use them as a repeatable before/after benchmark.

## 5. Product and Scope Boundaries

### In scope

- Native Android `HomeScreen`
- Native map layers and live-vehicle rendering
- Native bottom tabs
- Native home notices
- Primary navigation, search, route-filter, location, and map-status icon treatments
- Related utilities, design tokens, and tests

### Out of scope

- Backend, proxy, Firebase, GTFS, or detour-detection logic
- Trip-planning and navigation-screen redesigns
- A broad app-wide icon replacement
- A web home-screen redesign
- Changing route colours supplied by GTFS or current route configuration
- Hiding live buses at normal corridor or detail zoom
- Adding decorative animation

### Do not break

- Map pan, pinch zoom, and tap gestures
- Stop selection and stop sheets
- Saved-place annotations
- Detour overlays, closed stops, planned impacts, and detour sheets
- Route family selection semantics
- Trip preview and trip-planning mode
- Current-location behavior
- Android system-navigation clearance
- Web behavior in shared components

## 6. Target Visual Direction

**Warm operational map:** a neutral, bright map framed by crisp white controls, restrained blue accents, readable route colours, minimal shadow, strong selected states, and no decorative glass effects.

Apply the Friendly Design Theme as follows:

- White or lightly tinted surfaces with visible borders
- Generous but controlled rounding
- Strong blue active states
- Green only for healthy/live status
- Amber only for notices and review attention
- Soft slate framing for inactive content
- One clear primary action per area
- Quiet map chrome
- No gradients except a functional scroll-edge fade
- No detached floating controls when they can be grouped

## 7. Target Screen Structure

From top to bottom in the normal map state:

1. Android status bar over the map.
2. One compact search/status surface.
3. At most one compact notice strip below search.
4. Full map canvas.
5. One bottom map-control tray containing route families and location.
6. One compact bottom tab bar above the Android system navigation area.

Remove the separate top chrome backdrop. The map should remain visually present around the search surface.

## 8. Design Tokens for This Work

Put Android home-map-specific values in one exported object rather than scattering literals through `HomeScreen.js`. Prefer a new file such as `src/config/homeMapTheme.js`.

Suggested starting tokens:

```js
export const HOME_MAP_THEME = {
  topMargin: 8,
  sideMargin: 8,
  controlGap: 8,
  searchHeight: 58,
  searchRadius: 22,
  noticeCollapsedMinHeight: 44,
  bottomTrayMinHeight: 52,
  bottomTrayRadius: 26,
  routeChipHeight: 44,
  routeChipMinWidth: 48,
  locationButtonSize: 44,
  tabContentHeight: 64,
  busMarkerDiameter: 34,
  busMarkerSelectedDiameter: 40,
  busMarkerHitTarget: 44,
  busClusterDiameter: 36,
  contextZoomMax: 13.0,
  corridorZoomMax: 14.2,
  routeOpacityContext: 0.42,
  routeOpacityCorridor: 0.50,
  routeOpacityDetail: 0.58,
  routeOpacitySelected: 0.96,
  routeOpacityMuted: 0.18,
};
```

These are starting values, not excuses to skip visual verification. Adjust only with screenshots from the Android emulator.

Surface styling:

- Surface fill: `rgba(255,255,255,0.97)`
- Primary border: `COLORS.border` or a slightly blue-tinted equivalent
- Shadow: `SHADOWS.small`; avoid `SHADOWS.large` on routine controls
- Main text: `COLORS.textPrimary`
- Secondary text: `COLORS.textSecondary`
- Active blue: `COLORS.primary`
- Healthy/live green: `COLORS.success`
- Selected surface tint: `COLORS.primarySubtle`

## 9. Interaction and State Specification

### 9.1 All routes, context zoom below 13.0

- Show simplified family/representative route geometry.
- Route opacity: about 0.42.
- No route-line labels.
- No route-line arrows.
- No white outlines unless needed for contrast over water or major roads.
- Use MapLibre point clustering for overlapping live buses.
- Cluster radius target: 28–34 screen pixels.
- Cluster maximum zoom: 12.9.
- Cluster marker shows the bus count and uses a blue-tinted neutral treatment, not a route colour.
- Tapping a cluster zooms to its expansion level and keeps the cluster centred.
- Major hub labels may appear; minor hub labels must remain hidden.

### 9.2 All routes, corridor zoom 13.0–14.2

- Expand all bus clusters into individual bus markers.
- Route opacity: about 0.50.
- No default route-line labels or arrows.
- Show major hub labels and only non-colliding minor hub labels.
- Individual bus markers use the compact integrated direction treatment.

### 9.3 All routes, detail zoom 14.2 and above

- Route opacity may increase to about 0.58.
- Keep default route-line labels off.
- Keep default route-line arrows off.
- Show individual buses.
- Allow more minor hub labels if they do not collide.
- Stops follow existing visibility rules.

### 9.4 One route family selected

- Render only the selected route geometry, matching current behavior.
- Selected line opacity: about 0.96 with a restrained white outline.
- Selected chip uses the route colour as a full fill.
- Status copy: `{route label} · {count} buses`; do not use a second redundant green dot.
- Individual buses remain visible at every zoom.
- Route labels may appear at zoom 13.4 and above.
- Route arrows may appear at zoom 14.0 and above only when they remain readable.

### 9.5 Multiple routes selected

- Show selected routes explicitly.
- Suppress arrows.
- Allow line labels only when two or fewer routes are selected and zoom is at least 13.6.
- Use one status summary such as `2 routes · 5 buses`.

### 9.6 Bus selected

- The selected bus gains a 3 dp white halo and a subtle blue outer ring.
- Do not pulse the marker.
- Keep the selected bus above other vehicle layers.
- Show a compact `VehicleQuickCard` above the bottom map-control tray.
- Card contents:
  - route-colour badge and route label
  - `To {headsign}` when a useful headsign exists
  - otherwise the resolved route name
  - freshness copy such as `Updated 12 sec ago`
  - stale warning when appropriate
  - close action with a 44 dp target
- Tapping empty map space closes the card.
- Changing route selection closes the card if that vehicle is no longer displayed.
- A vehicle disappearing from the feed closes the card after the next successful feed update.

### 9.7 Stale or offline live data

- Stop movement when the feed or vehicle timestamp is stale.
- Suggested stale threshold: use the existing feed-health result where possible; otherwise 90 seconds for a vehicle position.
- Stale markers use about 0.58 opacity and no direction animation.
- Search status reads `Updates delayed` or `Offline`, not `Live`.
- The quick card states how old the position is.
- Do not remove route geometry when live data is unavailable.

### 9.8 Notices

- Show only one primary notice strip at a time in the normal map state.
- Priority: active rider-impacting detour, planned detour/official impact, holiday notice.
- Collapsed height: at least 44 dp and normally no more than 52 dp.
- Collapsed content: icon, short label/title, up to two route badges, expand chevron, optional dismiss action.
- Expanded content may use the existing detail components or sheets.
- Dismiss and expand controls must each have 44 dp hit areas.
- Notices must not be nested inside the search card.

## 10. Component and Data Architecture

Avoid adding more rendering responsibility to the 4,000+ line `HomeScreen.js`.

Recommended components:

- `src/components/home-map/HomeMapTopChrome.js`
  - search field
  - consolidated transit status
  - optional notice slot
- `src/components/home-map/HomeMapVehicleLayer.js`
  - one GeoJSON source for fleet vehicles
  - clustering at context zoom
  - marker body, direction, text, stale, and selected layers
  - vehicle press handling
- `src/components/home-map/VehicleQuickCard.js`
  - selected bus summary
- `src/components/home-map/MapBottomControlTray.js`
  - route-family scroll rail
  - fixed location action
- `src/utils/homeVehicleFeatures.js`
  - converts vehicles to deterministic GeoJSON features
  - resolves label, colour, bearing, freshness, and selected state
- `src/utils/homeVehicleInterpolation.js`
  - one animation controller for the visible fleet
  - no React hook per bus

Keep `HomeScreen.js` responsible for state orchestration only:

- selected routes
- selected vehicle ID
- map zoom/region
- map and sheet mode
- notice selection
- trip-planning mode

### Vehicle feature shape

Each GeoJSON point should include only stable, render-relevant properties:

```js
{
  id,
  routeId,
  routeLabel,
  routeColor,
  bearing,
  headsign,
  timestamp,
  isStale,
  isSelected,
}
```

Do not put full trip or route objects inside GeoJSON properties.

## 11. Bus Marker Visual Specification

Replace the current Android `MarkerView` capsule plus detached `BusDirectionArrow` with MapLibre layers.

Recommended layer order:

1. Invisible 44 dp hit layer
2. Selected outer ring
3. Direction pointer
4. White marker border
5. Route-colour marker body
6. Route label
7. Cluster count layer

Marker requirements:

- Default body diameter: 34 dp
- Selected body diameter: 40 dp
- White border: 2 dp default, 3 dp selected
- Route label: visually equivalent to 12–13 dp, bold
- Allow three-character labels such as `400` without truncation
- Direction pointer: 8–10 dp, touches the body, rotates with bearing
- Direction pointer uses near-black or a darkened route colour with a thin white edge
- No gap between pointer and body
- No glossy highlight, gleam, or update pulse
- Selected marker uses scale/halo only as a persistent state, not an animation

If MapLibre text cannot match Outfit exactly, prefer a legible system sans-serif over returning to per-bus React views.

## 12. Motion and Performance Specification

Current problem:

- `useAnimatedBusPosition` creates an independent animation loop and React state update for every bus.
- Android renders each bus as its own `MarkerView`.

Target:

- One animation controller for the visible fleet.
- One batched GeoJSON source update rather than dozens of React view updates.
- Interpolate from the current rendered position to the next feed position over approximately 90–95% of the observed feed interval.
- Use a near-linear or gentle ease-out curve. Do not use ease-in/ease-out that makes a bus repeatedly accelerate and brake at every feed update.
- Cap visual updates at 20–30 frames per second if 60 fps source updates do not improve perceived quality.
- Cancel animation when the screen loses focus, the app backgrounds, the map is not mounted, or data is stale.
- Honour reduced-motion settings by shortening interpolation and removing nonessential transitions.
- Keep the selected-route and trip-preview behavior correct.

Performance acceptance on the BTTP emulator with at least 25 live vehicles:

- New janky frames at or below 3% during a 15-second stationary all-routes sample.
- 90th percentile frame time at or below 32 ms.
- No visible marker teleport at normal feed updates.
- Map pan begins promptly while buses are moving.
- Selected-route performance must not regress.

Use exact same emulator, zoom, fleet state, and sample duration for before/after comparison.

## 13. Top Chrome Specification

### Search surface

- One white surface, 58 dp target height.
- 8 dp side margin.
- 22 dp radius.
- One visible border.
- Small shadow only.
- Remove `topChromeBackdrop`, `topChromeBackdropCompact`, and `topChromeBackdropWithDetours`.
- Preserve address autocomplete behavior and suggestions.
- Search icon sits in a 32 dp pale-blue circle.
- Placeholder remains `Where to?`.

### Status area

Consolidate `SystemHealthChip` and `StatusBadge` into one status tray.

Normal states:

- Healthy, no route selected: green dot + `Live`
- Route selected: `Live` plus `{route} · {count} buses` in one joined tray
- Loading: `Updating…`
- Delayed/stale: amber dot + `Updates delayed`
- Offline: grey dot + `Offline`

Do not show two green dots for the same state.

## 14. Bottom Map-Control Tray Specification

Replace the separate `RouteChipRail` and floating `mapUtilityControls` with one component.

Layout:

- Absolute above the bottom tab bar with safe spacing.
- Left and right margin: 8 dp.
- Minimum height: 52 dp.
- White 97% surface, 1 dp border, small shadow.
- Route-family chips scroll horizontally.
- Location button stays fixed at the right edge inside the same tray.
- The route list receives enough right padding that no chip sits under the location button.
- A functional edge fade may indicate more routes, but it must not make the final visible label unreadable.

Route chip:

- Height: 44 dp.
- Minimum width: 48 dp.
- Inactive: white/transparent within tray, no individual shadow, route-colour dot or narrow internal indicator.
- Active: full route colour, white text.
- `All` active: primary blue, white text.
- Detour indicator: small amber dot with accessible route-detour state.
- Accessibility state uses `selected: true/false`.

Location action:

- 44 × 44 dp.
- Pale-blue idle background.
- Primary-blue icon.
- Loading state uses a spinner or opacity, not repeated tapping.
- Label: `Center on my location`.

## 15. Bottom Tab Bar and Android Safe Area

Current behavior to replace:

- `height: 72 + bottomInset`
- `bottomInset` forced to at least 56 dp
- `marginBottom: 10` on Android

Target:

- Tab content height: 64 dp.
- Total height: `64 + actual safe bottom inset`.
- Bottom padding: actual safe bottom inset.
- No additional bottom margin/lift on the tab bar itself.
- Keep a small Android lift only for floating map controls when genuinely required.

Update `src/utils/androidNavigationBar.js`:

- Prefer `react-native-safe-area-context` bottom inset.
- Otherwise use the measured screen/window/status-bar delta.
- Use a conservative fallback only when both values are zero.
- Do not force 56 dp on gesture-navigation devices.
- Cover gesture navigation and three-button navigation in tests.

Target fallback starting point: 24 dp, subject to emulator verification.

Tab icon treatment:

- 24–26 dp flat two-tone or outline icons.
- Consistent 2 dp visual stroke.
- Active icon sits on a pale-blue rounded rectangle.
- Keep the active top indicator only if it adds clarity after the height reduction; otherwise remove it.
- Labels remain visible.
- Do not replace saved-place, onboarding, or profile illustration icons in this workstream.

## 16. Hub Label Collision Rules

`BusHubOverlay` currently uses wide `MarkerView` frames that overlap live buses.

Target behavior:

- Context zoom: show major hubs only.
- Corridor zoom: show major hubs and selected relevant minor hubs.
- Detail zoom: allow minor hubs.
- Selected bus and selected route markers take visual priority over hub labels.
- Reduce major hub label max width from 210 dp toward 170–180 dp.
- Reduce frame width/height so invisible marker frames do not reserve excessive space.
- Prefer MapLibre symbol placement with collision handling if practical.
- If retaining `MarkerView`, hide labels by zoom and keep only the small hub dot when density is high.

Do not remove hub accessibility names.

## 17. Primary Icon Normalization

Do not rewrite `CartoonIcons.js` broadly.

Create or use a small flat icon set for:

- bottom tabs
- search
- current location
- notice chevrons/dismiss
- map utility controls

Requirements:

- same view box and optical size
- one outline weight
- no glossy highlights
- no heavy black contour
- at most two colours per icon
- route and status colour remains semantic, not decorative

The friendly look should feel warm, not childish.

## 18. Implementation Sequence

Complete each phase, run its focused tests, and visually verify it before continuing. Do not combine all work into one unreviewable change.

### Phase 0 — Protect the baseline and make dev screenshots representative

Files:

- `src/screens/HomeScreen.js`
- `.env.example`
- relevant source tests

Tasks:

1. Preserve all unrelated working-tree changes.
2. Capture baseline all-routes and selected-route screenshots.
3. Record baseline `gfxinfo` using the same 15-second method.
4. Gate `DevMapControlPad` behind both `__DEV__` and `EXPO_PUBLIC_SHOW_DEV_MAP_CONTROLS=true`.
5. Default that flag to false in `.env.example`.

Acceptance:

- Normal `npm run android:dev` visually matches production chrome.
- QA pad remains available when explicitly enabled.

### Phase 1 — Introduce home-map tokens and calm route geometry

Files:

- new `src/config/homeMapTheme.js`
- `src/config/mapLineStyles.js`
- `src/screens/HomeScreen.js`
- `src/utils/homeRouteLineVisuals.js`
- related tests

Tasks:

1. Move home-map visual thresholds and dimensions into tokens.
2. Apply zoom-dependent route opacity in all-routes mode.
3. Remove all-routes arrows.
4. Keep selected route geometry vivid.
5. Preserve detour focus and route-family simplification.
6. Add direct unit tests for each visual state and zoom tier.

Acceptance:

- All-routes screenshot is visibly calmer.
- Route 400 selection still produces a strong cyan route focus.
- Detour mode still shows the required geometry.

### Phase 2 — Correct Android bottom spacing and tabs

Files:

- `src/utils/androidNavigationBar.js`
- `src/navigation/TabNavigator.js`
- `src/__tests__/androidNavigationBar.test.js`
- new or updated tab-bar tests

Tasks:

1. Remove the forced 56 dp inset for gesture-navigation devices.
2. Remove the extra tab-bar bottom lift.
3. Implement 64 dp content height plus actual inset.
4. Normalize primary tab icons.
5. Verify gesture and three-button navigation.

Acceptance:

- No content is covered by Android navigation.
- Excess blank space below tab labels is removed.
- Map, Search, and Profile remain at least 44 dp targets.

### Phase 3 — Build the consolidated bottom map-control tray

Files:

- new `src/components/home-map/MapBottomControlTray.js`
- `src/components/RouteChipRail.js` or replace it cleanly
- `src/screens/HomeScreen.js`
- `src/utils/homeChromeVisibility.js`
- route-rail and reduced-chrome tests

Tasks:

1. Group route chips and location control.
2. Raise chip height to 44 dp.
3. Remove individual inactive chip shadows.
4. Replace coloured left borders with a small internal colour cue.
5. Keep the location action fixed.
6. Ensure route labels never sit under the location action or edge fade.
7. Preserve current hide/show rules in trip planning and sheets.

Acceptance:

- Tray reads as one control family.
- Every route family remains reachable by horizontal scroll.
- Final visible chip is readable.

### Phase 4 — Simplify search, status, and notices

Files:

- new `src/components/home-map/HomeMapTopChrome.js`
- `src/screens/HomeScreen.js`
- `src/components/SystemHealthChip.js`
- `src/components/StatusBadge.js`
- `src/components/DetourAlertStrip.js`
- `src/components/OfficialImpactStrip.js`
- `src/components/HolidayServiceBanner.js`
- relevant tests

Tasks:

1. Remove the top chrome backdrop.
2. Keep one compact search surface.
3. Consolidate health and route summary status.
4. Normalize notices into the compact collapsed grammar.
5. Ensure only the highest-priority normal-map notice is shown.
6. Preserve existing detail sheets and detour navigation.

Acceptance:

- Search is the clear top action.
- No redundant live dots.
- Notice state does not consume an excessive portion of the map.

### Phase 5 — Build batched vehicle features and marker layers

Files:

- new `src/components/home-map/HomeMapVehicleLayer.js`
- new `src/utils/homeVehicleFeatures.js`
- `src/screens/HomeScreen.js`
- `src/components/BusMarker.js` only where still needed outside the Android home fleet
- `src/components/BusDirectionArrow.js` only where still needed elsewhere
- vehicle-layer tests

Tasks:

1. Convert visible vehicles to one GeoJSON feature collection.
2. Render fleet markers through MapLibre layers.
3. Add integrated direction treatment.
4. Add context-zoom clustering.
5. Implement cluster press-to-zoom.
6. Preserve existing trip-preview markers separately.
7. Do not remove `BusMarker` if navigation, trip preview, iOS, or web still uses it.

Acceptance:

- Default Android fleet no longer creates one React `MarkerView` per bus.
- No detached black arrows remain on the main Android map.
- Three-character route labels remain legible.
- Clusters disappear by zoom 13.0.

### Phase 6 — Centralize vehicle interpolation and stale handling

Files:

- new `src/utils/homeVehicleInterpolation.js`
- `src/components/home-map/HomeMapVehicleLayer.js`
- `src/config/constants.js`
- existing and new animation tests

Tasks:

1. Replace per-bus animation loops with one visible-fleet controller.
2. Remove the update pulse.
3. Use interval-aware near-linear interpolation.
4. Stop stale/offline animation.
5. Pause when the screen is unfocused or the app backgrounds.
6. Benchmark 20, 30, and 60 fps source update caps; keep the lowest rate that looks smooth.

Acceptance:

- Meets the performance targets in Section 12.
- Movement looks continuous without repeated acceleration/braking.
- No teleport when a new feed arrives under normal conditions.

### Phase 7 — Add bus selection and quick card

Files:

- new `src/components/home-map/VehicleQuickCard.js`
- `src/components/home-map/HomeMapVehicleLayer.js`
- `src/screens/HomeScreen.js`
- new vehicle selection/freshness utilities and tests

Tasks:

1. Add map-layer press handling.
2. Track `selectedVehicleId`, not the full mutable vehicle object.
3. Add selected marker state.
4. Add quick card above the bottom control tray.
5. Implement close, map-tap dismissal, route-change cleanup, and disappeared-vehicle cleanup.
6. Add TalkBack labels and selected state.

Acceptance:

- Bus selection does not block map gestures.
- Quick card never overlaps tabs or system navigation.
- Stale positions are clearly described.

### Phase 8 — Refine hub labels and primary icons

Files:

- `src/components/BusHubOverlay.js`
- `src/config/busHubs.js`
- new flat primary icon component or icon variant
- `src/navigation/TabNavigator.js`
- top/bottom map chrome components
- related tests

Tasks:

1. Apply zoom-based hub-label density.
2. Reduce label/frame footprint.
3. Prevent hub labels from outranking selected bus/route markers.
4. Finish primary icon normalization.

Acceptance:

- Dense hubs no longer form unreadable stacks.
- Primary chrome uses one coherent icon language.

### Phase 9 — Full verification, release build, and documentation

Tasks:

1. Run focused tests after each phase.
2. Run full app tests.
3. Run web parity checks for shared-component regressions.
4. Run Android dev smoke test.
5. Run Android release build.
6. Capture final all-routes, route-selected, bus-selected, notice, stale/offline, and trip-planning screenshots.
7. Repeat `gfxinfo` benchmark.
8. Update this plan with results or create a dated completion note.

Known build blocker observed July 10:

- `npm run android:stable` failed while linking `react-native-screens` for `arm64-v8a` with missing C++ runtime symbols.
- Treat this as a release-readiness blocker.
- Do not claim production completion until the release build succeeds.
- Diagnose it separately from UI behavior; do not make speculative UI changes to work around it.

## 19. Test Plan

### Unit and source tests

Add or update coverage for:

- zoom-tier route opacity and arrow rules
- cluster maximum zoom and press-to-expand behavior
- vehicle GeoJSON property mapping
- stable vehicle feature IDs
- selected and stale vehicle feature states
- freshness formatting
- one fleet animation controller rather than one hook per bus
- reduced-motion behavior
- route chip 44 dp height
- route chip selected accessibility state
- location control 44 dp size
- gesture and three-button safe-bottom calculations
- notice priority and compact state
- selected vehicle cleanup
- dev QA pad flag

Suggested files:

- `src/__tests__/homeRouteLineVisuals.test.js`
- `src/__tests__/homeVehicleFeatures.test.js`
- `src/__tests__/homeVehicleInterpolation.test.js`
- `src/__tests__/HomeMapVehicleLayer.test.js`
- `src/__tests__/VehicleQuickCard.test.js`
- `src/__tests__/routeChipRail.test.js`
- `src/__tests__/androidNavigationBar.test.js`
- `src/__tests__/homeReducedMapChrome.source.test.js`
- `src/__tests__/homeScreenPerformance.test.js`
- `src/__tests__/nativeMapTouchTargets.test.js`

Update old assertions that intentionally require passive, non-selectable bus `MarkerView`s. Replace them with assertions that selection occurs through MapLibre source-layer events rather than React touchables inside markers.

### Focused commands

```powershell
npx jest src/__tests__/homeRouteLineVisuals.test.js --runInBand
npx jest src/__tests__/homeVehicleFeatures.test.js --runInBand
npx jest src/__tests__/homeVehicleInterpolation.test.js --runInBand
npx jest src/__tests__/routeChipRail.test.js --runInBand
npx jest src/__tests__/androidNavigationBar.test.js --runInBand
npx jest src/__tests__/homeScreenPerformance.test.js --runInBand
```

### Full commands

```powershell
npm test
npm run check:parity
npm run android:dev
npm run android:stable
```

Use `npm run android:dev:launch` for subsequent emulator relaunches while Metro remains active.

### Manual Android matrix

| Scenario | Required check |
| --- | --- |
| First load | Startup opens to a usable map; top and bottom chrome do not jump |
| All routes, context zoom | Calm lines, readable clusters, no arrows |
| All routes, corridor zoom | Individual buses visible, no hub collisions |
| Route 400 selected | Cyan route focus, two buses, clear selected chip/status |
| Branch family selected | Correct A/B family behavior remains |
| Multiple routes | No arrows, restrained labels |
| Bus selected | Marker halo and quick card show correct route/headsign/freshness |
| Empty map tap | Quick card closes |
| Cluster tap | Map zooms and individual buses become available |
| Planned notice | Compact strip, route badges, expand and dismiss work |
| Active detour | Rider-critical information remains prominent and map focus works |
| Holiday notice | Same compact grammar, details still open |
| Stale feed | Movement stops and delayed status is clear |
| Offline | Route context remains; status says offline |
| Location denied | Existing helpful error remains; tray stays stable |
| Gesture navigation | Tabs and tray clear system bar without large blank area |
| Three-button navigation | Tabs and tray remain above buttons |
| Large text | Search, status, notices, quick card, and tabs do not clip |
| TalkBack | Controls have roles, labels, values, and selected states |
| Trip planning | Existing header, preview, and bottom sheet remain intact |
| Stop selection | Stop sheet still opens and map gestures work |

## 20. Accessibility Requirements

- All actionable controls: minimum 44 × 44 dp.
- Route chip: `accessibilityRole="button"` and `accessibilityState={{ selected }}`.
- Vehicle source press result must announce route, headsign, and freshness through the quick card.
- Cluster label: `{count} buses nearby. Double tap to zoom in.`
- Selected bus card close action: `Close bus details`.
- Live, delayed, stale, and offline states must not rely on colour alone.
- Text must remain readable at Android font scale 1.3.
- Keep contrast at WCAG AA equivalent for text and essential icons.
- Reduced motion removes update pulse and shortens nonessential transitions.

## 21. Rollback and Risk Controls

Highest-risk areas:

1. Batched vehicle rendering and MapLibre press behavior
2. Android safe-area calculation across navigation modes
3. Detour and trip-preview layer ordering
4. Shared components accidentally changing web

Controls:

- Keep phases small and separately reviewable.
- Preserve old `BusMarker` for non-home-map uses until final verification.
- If needed during development, use a temporary internal feature flag for the batched Android vehicle layer; remove the flag after release verification.
- Do not delete old animation code until the new layer passes performance and interaction tests.
- Keep route and detour view-model logic separate from visual components.
- Verify layer indexes explicitly so buses stay above route lines and below critical callouts where intended.
- Never reset or overwrite unrelated uncommitted work.

## 22. Files Expected to Change

Likely changes:

- `.env.example`
- `src/config/constants.js`
- `src/config/mapLineStyles.js`
- `src/config/theme.js`
- `src/config/homeMapTheme.js` — new
- `src/navigation/TabNavigator.js`
- `src/screens/HomeScreen.js`
- `src/utils/androidNavigationBar.js`
- `src/utils/homeChromeVisibility.js`
- `src/utils/homeRouteLineVisuals.js`
- `src/utils/homeVehicleFeatures.js` — new
- `src/utils/homeVehicleInterpolation.js` — new
- `src/components/RouteChipRail.js`
- `src/components/BusHubOverlay.js`
- `src/components/DetourAlertStrip.js`
- `src/components/OfficialImpactStrip.js`
- `src/components/HolidayServiceBanner.js`
- `src/components/home-map/HomeMapTopChrome.js` — new
- `src/components/home-map/HomeMapVehicleLayer.js` — new
- `src/components/home-map/MapBottomControlTray.js` — new
- `src/components/home-map/VehicleQuickCard.js` — new
- focused tests listed in Section 19

Files that should not be removed without proving they are unused elsewhere:

- `src/components/BusMarker.js`
- `src/components/BusDirectionArrow.js`
- `src/hooks/useAnimatedBusPosition.js`
- web-specific home/map components

## 23. Handoff Instructions for Sol Medium

Use this exact operating approach:

1. Read the required files in Section 3.
2. Inspect current code before trusting this dated plan.
3. Check `git status` and preserve all unrelated changes.
4. Work one phase at a time.
5. Add or update tests in the same phase as behavior changes.
6. Run focused tests before moving to the next phase.
7. Launch the Android emulator and visually inspect every visual phase.
8. Use screenshots, UI bounds, and frame data rather than guessing.
9. Do not broaden the work to web or unrelated screens.
10. Do not mark the work complete with a failing release build.

When reporting progress, use this format:

- Phase completed
- Files changed
- Visual result
- Tests run and result
- Remaining risks or blockers

## 24. Final Acceptance Summary

The finished screen should feel like a polished Barrie Transit product:

- map first
- friendly but not childish
- colourful but not noisy
- operational but not dense
- clear at a glance
- smooth with a full live fleet
- safe on Android gesture and button navigation
- understandable in healthy, delayed, stale, offline, detour, and selected-route states

The strongest visual test is simple: the all-routes view should feel as composed as the current route-400 focus view, without removing the network context riders need.

## 25. Implementation Results — July 10, 2026

Implemented:

- calmer zoom-based route styling and no all-route arrows
- compact search/status/notice hierarchy with one prioritized rider notice
- Android-safe tab and bottom-control spacing
- consolidated route/location control tray and 44 dp route chips
- one clustered MapLibre fleet source with shared interpolation, stale handling, selection halo, and quick card
- zoom-tier hub labels with smaller marker frames
- flat Android primary icons for map, search, profile, and map search
- TalkBack labels and selected/disabled states for the new controls

Verification completed:

- Babel transformed all changed front-end files
- app suite: 183 suites and 1,067 tests passed
- platform parity check completed with only the repo's documented platform-specific warnings
- Android dev-client smoke test passed with 31 live vehicles
- visually checked all-routes clustering, route 400 focus, notice priority, hub density, tab/system-bar spacing, and selected-route colour
- fixed two issues found only at runtime: unsupported `textSortKey` and white route outlines covering selected route colours

Open release blocker:

- `npm run android:stable` still fails in native C++ linking with missing C++ runtime symbols, now also visible in `react-native-worklets` in addition to the previously observed `react-native-screens` failure.
- This blocker is outside the map UI changes. Do not mark the release production-ready until the native toolchain/dependency issue is resolved and the release APK passes the manual matrix.
