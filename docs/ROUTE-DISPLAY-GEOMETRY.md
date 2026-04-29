# Route display geometry

The app should not rely on raw GTFS shapes as the final visual layer. GTFS remains the source of truth for service, trip planning, and stop order, but map rendering can use a separate display-geometry asset.

## Files

- `assets/route-display-geometry.json` — generated, road-matched route display shapes.
- `assets/route-display-overrides.json` — manual corrections by `shape_id`.
- `scripts/generate-route-display-geometry.js` — generator that reads MyRide GTFS and attempts map matching.
- `src/utils/routeDisplayGeometry.js` — app-side loader/fallback logic.

## Intended pipeline

```text
GTFS shapes.txt
→ map-match each shape to a road network
→ validate drift from original GTFS
→ apply manual overrides
→ save route-display-geometry.json
→ app renders display geometry
→ trip planning still uses raw GTFS
```

## Running it

```bash
npm run generate:route-display-geometry
```

Useful environment variables:

```bash
ROUTE_DISPLAY_MATCH_URL=https://your-osrm-or-valhalla-match-service/match/v1/driving
ROUTE_DISPLAY_MATCH_RADIUS_METERS=35
ROUTE_DISPLAY_MATCH_TIMEOUT_MS=15000
ROUTE_DISPLAY_MAX_MATCH_POINTS=95
```

## Provider note

The public OSRM demo server is not reliable enough for production generation. It rate-limits and times out on multi-shape jobs. For production-quality geometry, use a controlled provider:

- self-hosted Valhalla/OSRM, preferred
- GraphHopper/Mapbox paid API
- manual GeoJSON overrides for hard sections

## Fallback behavior

If no generated or manual display geometry exists for a shape, the app renders the original GTFS shape. This keeps the app safe while the display layer is improved route-by-route.
