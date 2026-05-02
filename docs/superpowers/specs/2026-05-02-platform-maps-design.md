# Platform Maps Feature Design

Date: 2026-05-02
Status: Approved design for implementation planning

## Goal

When a rider selects a major hub stop from the map or search, the app should offer a clear way to view that hub's platform map without exposing the full combined PDF.

The City of Barrie PDF remains the source of truth:
https://www.barrie.ca/Transit-Platform-Maps.pdf

## Supported platform maps

The combined PDF has five pages. Each supported hub maps to one page:

| Hub | PDF page | Example matching stops |
| --- | ---: | --- |
| Barrie Allandale Transit Terminal | 1 | 9003, 9004, 9005, 9006, 9012, 9013 |
| Downtown Hub | 2 | 1, 2 |
| Park Place Terminal | 3 | 777 |
| Barrie South GO | 4 | 725 |
| Georgian College | 5 | 327, 328, 329, 330, 331, 335 |

Matching is hub-based: if the selected stop is one of the platform stops that belongs to a hub, the rider sees that hub's platform map.

## Rider experience

1. Rider selects a stop from the map or search.
2. If the stop belongs to a supported hub, the stop details sheet shows a featured card:
   - Title: `Platform map available`
   - Body: short helper text such as `Find your bus platform at Georgian College.`
   - Button: `Open platform map`
3. Tapping the button opens a full-screen in-app modal.
4. The modal shows only the selected hub's platform map page.
5. The modal includes:
   - hub name
   - close button
   - zoomable/pannable map image
   - small source link: `Source: City of Barrie` / `Open source PDF`

Stops without a platform map do not show the card.

## App architecture

Add a small platform map config module that defines:

- stable hub ID
- display name
- source PDF URL
- PDF page number
- matching GTFS stop IDs/codes

Use the same lookup in both map and search flows by deriving the platform map from the selected stop object before rendering `StopBottomSheet`.

Main app changes:

- `StopBottomSheet`: render the featured card when a platform map exists for the selected stop.
- New `PlatformMapViewerModal`: full-screen modal for viewing the selected hub map.
- New service/helper: build the platform map API URL and expose source PDF fallback metadata.
- Optional analytics events:
  - platform map card shown
  - platform map opened
  - platform map load failed

## Backend architecture

Add an API proxy route:

`GET /api/platform-maps/:hubId`

The endpoint should:

1. validate `hubId` against the same supported-hub configuration
2. fetch the City of Barrie combined PDF from the canonical URL
3. extract or render only the configured page
4. cache the rendered result
5. return a single image response suitable for the in-app viewer

Recommended response shape:

- content type: `image/png` or `image/webp`
- cache headers for short-lived client/proxy caching
- error JSON for invalid hub IDs or source/render failures

The endpoint should never pass through arbitrary URLs or page numbers from the client. The client only chooses a known `hubId`.

## Caching and source-of-truth behavior

The Barrie PDF is the canonical source. The backend cache is only a performance layer.

Recommended cache behavior:

- in-memory cache per hub for local/dev and single-instance deployments
- cache key includes hub ID, page number, and source PDF URL
- reasonable refresh window, such as 24 hours
- manual restart or cache expiry picks up source PDF changes

If the PDF source is unavailable and a cached image exists, serve the cached image. If no cache exists, return a load failure so the app can show retry and source PDF fallback.

## Error handling

App behavior:

- loading state while the map image loads
- retry button if the map image fails
- source PDF fallback link if loading keeps failing
- no platform card for unsupported stops

Backend behavior:

- `404` for unknown hub IDs
- `502` for source PDF fetch failures with no usable cache
- `500` for render/extraction failures with no usable cache
- do not expose stack traces or internal paths in rider-facing responses

## Accessibility and usability

- Card and modal buttons need clear accessibility labels.
- Modal close button must be reachable by screen readers.
- Image should have descriptive alternate text such as `Platform map for Georgian College`.
- Zoom/pan should not block closing the modal.
- The map should fit to screen on first load, then allow zooming for detail.

## Testing plan

App tests:

- stop-to-hub matching returns the expected hub for known stop codes/IDs
- unsupported stops return no platform map
- stop sheet shows the card only for mapped stops
- opening the card displays the modal for the correct hub
- modal shows retry/fallback state on image load failure

Backend tests:

- valid hub returns an image response
- invalid hub returns `404`
- endpoint uses configured page numbers instead of client-supplied page values
- source fetch failure uses cached image when available
- source fetch failure without cache returns a safe error

Manual smoke test:

- select Georgian College from search and confirm only page 5 appears
- select a Georgian College stop from the map and confirm the same viewer appears
- select a regular stop and confirm no platform map card appears
- repeat for Allandale, Downtown Hub, Park Place, and Barrie South GO

## Out of scope for first release

- Offline bundled maps
- User-editable platform maps
- Deep linking directly to a platform map
- Replacing the City PDF as source of truth
- Showing platform maps for unsupported stops
