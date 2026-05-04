# Route Line Labels Design

Date: 2026-05-04

## Goal

Add balanced square route labels directly on map route lines when riders zoom in far enough. The feature should make it easier to identify routes on the map without making the map feel crowded.

## Chosen Direction

Use the balanced city-map style:

- At normal zoom, route lines stay clean with no badges.
- Around zoom 14 and higher, one square route badge appears per visible route.
- At closer zooms, long routes may show a second badge if spacing allows.
- Badges use the route color, white border, strong contrast text, and a subtle shadow or halo.

## Rider Experience

### Default Map

- Below zoom 13.5: no general route labels.
- Zoom 13.5 to 14: show labels only for selected or hovered routes.
- Zoom 14 and higher: show one label for each visible route where there is enough room.
- Zoom 15 and higher: allow a second label on long routes, only when it does not collide with another label.

### Selection and Focus

- Selected routes get first priority for labels.
- Hovered routes on web get second priority.
- Other visible routes get labels only after selected and hovered labels have been placed.
- During detour focus mode, labels should stay conservative so detour information remains the visual priority.
- During trip preview mode, labels should not compete with trip route badges already used for itinerary legs.

## Visual Design

Route badges should look like small transit shields:

- Shape: square with slightly rounded corners.
- Size: about 28 to 32 px, depending on route number length.
- Background: route color.
- Text: route short name, such as `1`, `4`, `8A`, `12B`.
- Text color: chosen for contrast, usually white unless the route color is too light.
- Border: white, 2 to 3 px.
- Shadow or halo: subtle, enough to separate from roads and map labels.

The badge should sit on or just above the route line, not in a separate legend area.

## Label Placement Rules

Create computed label points for each route instead of relying on repeated text along the full line.

For each visible route:

1. Find candidate points along the route shape.
2. Prefer longer, straighter visible segments.
3. Avoid route endpoints where markers, stops, or map controls may compete.
4. Avoid placing a label too close to another route label.
5. Keep the same label point stable during small pans or zoom changes to prevent jitter.

If two labels collide:

1. Keep selected route labels first.
2. Keep hovered route labels second.
3. Keep routes with stronger current visibility next.
4. Drop the lower-priority label rather than overlapping.

## Architecture

### Shared Utility

Add a utility for route label placement. It should be platform-neutral so native and web can share the same label decisions.

Suggested responsibilities:

- Accept visible route shapes, current zoom, selection state, hover state, and route short names.
- Return label marker objects with route id, label text, color, coordinate, priority, and display state.
- Apply collision rules using a simple approximate screen/grid threshold.

### Native Map

Render route labels as `MapLibreGL.MarkerView` badges or symbol layers, depending on performance during testing.

Preferred starting point:

- Use `MarkerView` for square badges because it gives full control over style and matches existing trip route badge rendering.
- Keep the count limited to avoid Android performance issues.

### Web Map

Render route labels as `WebHtmlMarker` badges.

Use the same computed label marker list as native so behavior stays consistent.

## States and Edge Cases

- If route color is missing, use the app primary color.
- If route short name is missing, do not show a label for that route.
- If too many routes are visible at once, cap the number of labels and prioritize selected/hovered routes.
- If a label cannot be placed without collision, skip it quietly.
- If map zoom is unknown, do not show general labels.
- Labels should not block route tapping. If they are tappable, tapping should select the route; otherwise pointer events should pass through where possible.

## Performance Requirements

- Avoid recomputing placement on every tiny zoom change. Reuse the existing rounded zoom step pattern.
- Limit visible labels, especially on Android.
- Memoize label computations based on visible shapes, selection state, hover state, and rounded zoom.
- Keep marker count low at zoom 14 and increase only modestly at zoom 15+.

## Testing Plan

Add focused tests for the placement utility:

- No labels below the zoom threshold.
- Selected route labels appear earlier than general labels.
- One label per visible route at zoom 14+.
- Long routes can receive a second label at zoom 15+.
- Colliding labels are filtered by priority.
- Missing route short names are skipped.

Add component regression tests where practical:

- Native route layer receives label markers at the right zoom.
- Web route layer renders badge markers at the right zoom.
- Trip preview mode does not show general route labels.

## Out of Scope

- Full route name labels.
- Labels at every stop.
- Editing route label positions manually.
- Replacing existing bus markers or trip preview route badges.
- A settings toggle in the first version.

## Recommended First Version

Ship a conservative version first:

- General labels start at zoom 14.
- Selected or hovered route labels start at zoom 13.5.
- Maximum one label per route.
- Maximum total label count per screen.
- No labels during trip preview.

After testing, add second labels for long routes at zoom 15+ if the map still feels clean.
