# Inline Route Labels on Polylines

**Date:** 2026-03-03
**Status:** Approved

## Problem

Route lines on the map lack identification. Users can see colored lines but can't tell which route they belong to without tapping a bus marker. Small inline labels along the lines would solve this without adding visual clutter.

## Design

### Visual Treatment

- **Text:** Route number only (e.g., "8", "2A"), ~10-11px bold font
- **Color:** Same color as the polyline
- **Readability:** White text halo/outline (2px) for legibility against the map
- **Spacing:** Repeat every ~250-300px along the line
- **Opacity:** Muted (~0.7-0.8), secondary to bus markers and the line itself
- **Rotation:** Follows line direction, always oriented left-to-right

### Scope

Labels appear on **all** route polylines:
- Live route display (toggled routes from route list)
- Trip planning itinerary polylines
- Walking legs are excluded (no route number)

### Native Implementation (MapLibreGL)

Add a `SymbolLayer` to `RoutePolyline.js` with:
- `symbolPlacement: 'line'` — places text along the line geometry
- `textField: routeLabel` — the route number string
- `symbolSpacing: 250` — pixels between labels
- `textSize: 11`, `textFont: ['bold']`
- `textColor: polyline color`, `textHaloColor: white`, `textHaloWidth: 2`
- `textOpacity: 0.75`
- `textRotationAlignment: 'map'` — rotates with the line

This uses MapLibre's built-in symbol placement engine (GPU-accelerated, no custom logic).

### Web Implementation (Leaflet)

Place lightweight `DivIcon` markers at calculated intervals along each polyline:
- Compute evenly-spaced points from the coordinate array (~every 300px at current zoom)
- Create small text labels positioned at those points
- Rotate each label to match the line bearing at that point
- Style: same color as line, white text-shadow for halo, 0.75 opacity

### Data Flow

Both platforms already have `routeId` available at the polyline rendering layer:
- **Live routes:** `useDisplayedEntities` provides `routeId` per shape
- **Trip planning:** `useTripVisualization` provides leg data with route info

Thread a `routeLabel` prop through to the polyline components. For trip legs, extract the route short name from the itinerary leg data.

## Files to Change

| File | Change |
|---|---|
| `src/components/RoutePolyline.js` | Add `routeLabel` prop, add `SymbolLayer` |
| `src/components/WebMapView.js` | Add route label `DivIcon` markers along polylines |
| `src/screens/HomeScreen.js` | Pass `routeLabel` to `RoutePolyline` in live + trip contexts |
| `src/screens/HomeScreen.web.js` | Pass `routeLabel` to web polylines in live + trip contexts |
| `src/hooks/useTripVisualization.js` | Include route short name in `tripRouteCoordinates` output |

## Dependencies

No new packages required. MapLibreGL `SymbolLayer` and Leaflet `DivIcon` are already available.
