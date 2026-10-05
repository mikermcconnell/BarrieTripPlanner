# Transit Arrival — ChatGPT app (MCP server)

Live vehicle locations and real-time arrival minutes for Barrie Transit, exposed to
ChatGPT as an MCP server (Apps SDK). Branding lives in `config.js`.

## Tools
| Tool | Purpose |
|---|---|
| `get_transit_status` | `stop` → next arrivals; `route` → where its vehicles are; both → filtered arrivals. Optional `direction`. |
| `find_stops` | Stops by name, intersection, landmark, or stop number. (No location input: ChatGPT's guidelines bar apps from asking for precise location in tool inputs.) |
| `list_routes` | All routes with destinations. |

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
(hosts cache by URI).

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

Service settings (already applied; listed here in case it needs recreating):
1. Source: this repo; **Root Directory** `api-proxy`.
2. **Config file path** `/api-proxy/transitArrival/railway.json`, which sets the start command
   (`npm run transit-arrival:start`) and the `/health` check. Without it Railway runs `npm start`, which is the main
   proxy, and that crashes for lack of its own env vars.
3. A public domain.

Monitoring: `.github/workflows/transit-arrival-uptime.yml` runs every 15 minutes. It checks `/health`, the tool list,
the widget, and a live query. A failed run emails the repo owner.

Environment variables:
| Variable | Required | Purpose |
|---|---|---|
| `CARTO_BASEMAP_API_KEY` (or `EXPO_PUBLIC_CARTO_BASEMAP_KEY`) | **yes** | Map tiles. Without it tiles show "API KEY REQUIRED". Use the same key as the app. |
| `TRANSIT_ARRIVAL_RATE_LIMIT_PER_MIN` | no | Abuse ceiling for `/mcp` (default 1500/min/IP; ChatGPT shares egress IPs). |
| `TRANSIT_ARRIVAL_DEV_HOST` | no | `true` serves the `/dev` preview host. Leave unset in production. |

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
- Stops that share a name (both sides of a street) are merged into one place.
- The TripUpdates decoder is a CommonJS port of `src/services/arrivalService.js`; keep them in sync.
