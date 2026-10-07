# Transit Arrival — ChatGPT app (MCP server)

Live vehicle locations and real-time arrival minutes for several transit agencies, exposed to
ChatGPT as an MCP server (Apps SDK). Branding lives in `config.js`; covered agencies live in `agencies.json`.

## Agencies and cost
Each agency is one entry in `agencies.json` (id, name, region, aliases, time zone, static GTFS URL, GTFS-RT
vehicle-positions and trip-updates URLs, licence, attribution, example prompts). Adding an agency is a registry entry,
not code. Check its licence first.

Static GTFS is kept on disk, not in memory, so RAM stays roughly flat as agencies are added:
- `feedStore.js` streams each agency's zip into `<DATA_DIR>/<id>.sqlite` (stops, routes, trips, stop times indexed
  by stop, calendars, shapes simplified to ~5 m). Queries read only the rows they need.
- `<DATA_DIR>/stops-index.sqlite` is a cross-agency trigram index used to infer the agency when the rider doesn't
  say (`network.js`). If several agencies match, the result lists `agencyCandidates` / `stopCandidates` and the
  model asks.
- At startup, and then hourly, the server rebuilds any feed not checked in 20 hours, one agency at a time. Unchanged
  zips (ETag, Last-Modified, or SHA-256) are skipped.
- Realtime feeds are fetched only while someone is asking about that agency (cached 15 s), so idle agencies cost
  nothing.

Eight agencies (Barrie, YRT, MiWay, Brampton, Durham, HSR, Milton, Oakville) build in about 90 s total into ~115 MB of SQLite. RSS sits
around 140 MB idle and peaks near 230 MB while several agencies are being queried.

Adding an agency: check its licence, confirm its GTFS-RT trip ids match the static feed's `trips.txt` (Burlington's
published zip ran a season ahead of its live feed), then add an `agencies.json` entry with a few aliases and examples.
If a newly published zip doesn't cover today yet, the current timetable is kept until it does.
Stops sharing a GTFS `parent_station` (terminals) are answered as one place.
- Omit `tripUpdatesUrl`/`vehiclePositionsUrl` for agencies with no live data (Oakville); answers come from the timetable
  with a note saying so.
- Set `sharedRealtimeFeed: true` when one GTFS-RT feed covers several agencies (Metrolinx's tmix.se hosting, used by
  Milton, Orillia, Simcoe County LINX and others); only trips in that agency's timetable are used.
- Search tokens must start a word of the stop name, so "milton" doesn't match "Hamilton".

## Tools
| Tool | Purpose |
|---|---|
| `get_transit_status` | `stop` → next arrivals; `route` → where its vehicles are; both → filtered arrivals. Optional `direction` and `agency`. |
| `find_stops` | Stops by name, intersection, landmark, or stop number. (No location input: ChatGPT's guidelines bar apps from asking for precise location in tool inputs.) |
| `list_routes` | An agency's routes with destinations; without `agency`, the covered agencies. |

Every tool takes an optional `agency` (id, name, or city alias from `agencies.json`).

`get_transit_status` renders the **live map widget** (`widget/map.html`, an MCP Apps
`text/html;profile=mcp-app` resource). Each result has three parts:
- `content`: a short text summary for the model
- `structuredContent`: arrivals and vehicles, visible to both the model and the widget
- `_meta.map`: route geometry for the widget only, kept out of the model's context

The widget inlines Leaflet, so the only external requests are CARTO map tiles. It talks to the host over the
MCP Apps `postMessage` bridge (falling back to `window.openai`) and does the following:
- refreshes every 20 s while visible
- lets the rider tap a stop when a name is ambiguous, and tap a row to highlight its bus
- follows the host's light/dark theme and can expand to fullscreen

If you change `widget/map.html` in a way that matters to hosts, bump the `map-vN` segment of `WIDGET_URI` in `widget.js`
(hosts cache by URI), and move the old URI into `LEGACY_WIDGET_URIS`. ChatGPT keeps requesting the cached URI until
the connector is refreshed, and shows "Failed to fetch template" if it's gone.

## Public website
The same service serves the pages required for app directory review: `/` (product page), `/support`, `/privacy`,
`/terms`, plus `/logo.svg`. Content lives in `site/pages.js` and static files in `site/public/`. **Keep the privacy
policy in step with what the server does.** It currently states that tool inputs aren't stored and that IPs are held in
memory for under a minute (rate limiting). If you add logging or analytics, update it.

Submission copy, test cases, and assets are in `submission/` (see `submission/SUBMISSION.md`).

## Run locally
```bash
cd api-proxy
npm install
npm run transit-arrival:start        # http://localhost:8787/mcp, health at /health
npx jest __tests__/transitArrival.test.js
```
Preview the widget the way ChatGPT renders it:
```bash
TRANSIT_ARRIVAL_DEV_HOST=true npm run transit-arrival:start
# open http://localhost:8787/dev?stop=Georgian%20Mall   (also ?route=8&dark=1&narrow=1)
```
Inspect the raw protocol: `npx @modelcontextprotocol/inspector` → Streamable HTTP → `http://localhost:8787/mcp`.

## Deploy (Railway)
Production: Railway project **Transit Arrival**, service `transit-arrival`, deploying from GitHub.
URL: `https://transit-arrival-production.up.railway.app/mcp`.

Service settings (already applied; listed here in case it needs recreating). They live on the Railway service
itself, because Railway has deprecated `railway.json`:
1. Source: this repo, branch `master`, watch pattern `/api-proxy/**`. **Root Directory** `api-proxy`.
2. **Start command** `npm run transit-arrival:start`. Without it Railway runs `npm start`, which is the main proxy, and
   that crashes for lack of its own env vars.
3. **Healthcheck path** `/health`, restart on failure.
4. A public domain.

Monitoring: `.github/workflows/transit-arrival-uptime.yml` runs every 15 minutes. It checks `/health`, the tool list,
the widget, and a live query. A failed run emails the repo owner.

Environment variables:
| Variable | Required | Purpose |
|---|---|---|
| `CARTO_BASEMAP_API_KEY` (or `EXPO_PUBLIC_CARTO_BASEMAP_KEY`) | **yes** | Map tiles. Without it tiles show "API KEY REQUIRED". Use a key registered for this app: CARTO's terms forbid sharing a key across projects. |
| `TRANSIT_ARRIVAL_RATE_LIMIT_PER_MIN` | no | Abuse ceiling for `/mcp` (default 1500/min/IP; ChatGPT shares egress IPs). |
| `TRANSIT_ARRIVAL_OPERATOR_NAME`, `TRANSIT_ARRIVAL_SUPPORT_EMAIL` | **yes** | Operator name and contact shown on the website, privacy policy, and terms. The server warns at startup if they're unset. |
| `TRANSIT_ARRIVAL_DEV_HOST` | no | `true` serves the `/dev` preview host. Leave unset in production. |
| `TRANSIT_ARRIVAL_DATA_DIR` | recommended | Where feed databases live (default `transitArrival/.data`). Point it at a Railway volume so feeds survive redeploys; without one they're rebuilt at each boot (~30 s). |

`PORT` is provided by Railway. Transit feeds are public.

## Try it in ChatGPT
Enable developer mode (Settings → Apps & Connectors → Advanced), create a connector
pointing at `https://<domain>/mcp` with no authentication, then ask
"When is the next bus at Georgian Mall?" The exact menu names change often, so check
OpenAI's Apps SDK docs if they don't match.

## Data notes
- Live arrival minutes come from the GTFS-RT TripUpdates feed. Trips with no live prediction yet (not started, or the
  feed is down or more than 5 minutes old) are filled in from the GTFS timetable. Those are marked `realtime: false`
  and shown as "Scheduled". Any trip present in the live feed, including cancelled trips, is never shown from the
  timetable, so the two sources can't contradict each other.
- When nothing is due within 90 minutes, the result names the next scheduled trip (up to 36 hours ahead).
  Service calendars and holiday exceptions use the detour code's `isServiceActive`.
- Stops that share a name (both sides of a street, or a terminal's numbered platforms and bays) are merged into one place.
- A bare number is treated as a stop number and only matches stop codes.
- Route names are shown without zero padding (YRT `008` → `8`). A bare route matches exact names first, then
  single-letter variants (`8` → `8A`, `8B`, but not `80`), then long names (`viva blue`).
- Uses the built-in `node:sqlite` (Node 22.13+), so there's no native dependency.
- The TripUpdates decoder is a CommonJS port of `src/services/arrivalService.js`; keep them in sync.
