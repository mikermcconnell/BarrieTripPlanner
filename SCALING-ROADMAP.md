# Scaling Roadmap — Eliminating API Fees & Production Readiness

Status as of 2026-02-10. Items 1 is complete; items 2-5 are recommendations.

---

## 1. LocationIQ API Key Protection (DONE)

**What was done:**
- Merged LocationIQ proxy routes into `proxy-server.js` (single dev server)
- Client code (`locationIQService.js`, `walkingService.js`) now routes through proxy when `EXPO_PUBLIC_API_PROXY_URL` is set
- API key stays server-side — never sent from browser
- Direct-call fallback preserved for native app builds (no proxy needed)
- Fixed bug in `api-proxy/index.js`: walking directions was calling `directions/driving` instead of `directions/walking`

**Files changed:**
- `proxy-server.js` — Added `/api/*` LocationIQ proxy routes + `.env` reading
- `src/config/constants.js` — Added `PROXY_URL` to `LOCATIONIQ_CONFIG`
- `src/services/locationIQService.js` — Proxy-first for autocomplete, geocode, reverse geocode
- `src/services/walkingService.js` — Proxy-first for walking directions
- `.env` / `.env.example` — Added `EXPO_PUBLIC_API_PROXY_URL`
- `api-proxy/index.js` — Fixed `directions/driving` → `directions/walking`

**Still needed for production:**
- Deploy `api-proxy/index.js` (Express version with rate limiting) to Vercel/Railway/Fly.io
- Set `EXPO_PUBLIC_API_PROXY_URL` to the deployed URL
- Remove `EXPO_PUBLIC_LOCATIONIQ_API_KEY` from production `.env` (proxy handles it)
- Add `LOCATIONIQ_API_KEY` as a server-side environment variable on the proxy host

---

## 2. Replace or Reduce LocationIQ Walking Directions

**The problem:** Each trip plan triggers 2-6 walking direction API calls (one per walk leg, across 3 itineraries). At 5,000 free calls/day, ~800-2,500 trip searches would exhaust the quota.

**Option A: Self-hosted OSRM (Recommended)**
- [OSRM](https://project-osrm.org/) is the same routing engine LocationIQ uses under the hood
- Free, open-source, runs on a small VPS ($5-10/month)
- Ontario walking graph fits in ~1GB RAM
- Setup: download Ontario OSM extract → `osrm-extract` → `osrm-contract` → run `osrm-routed`
- Replace `walkingService.js` calls with `http://your-osrm:5000/route/v1/walking/{coords}`
- Response format is identical to LocationIQ (both use OSRM), so parsing code stays the same
- Unlimited requests, no API key needed

**Option B: Valhalla (Alternative)**
- [Valhalla](https://github.com/valhalla/valhalla) is another open-source router
- Slightly more complex setup but supports multimodal routing
- Could eventually replace both walking directions AND the RAPTOR router

**Option C: Stay on LocationIQ, upgrade plan**
- $49/month for 50,000 requests/day
- Easiest path but recurring cost
- May still hit limits with growth

**Option D: Client-side walking estimation (no API)**
- Use the haversine * 1.3 buffer estimate already in `getFallbackDirections()`
- Lose turn-by-turn instructions and accurate polyline
- Could be acceptable for trip preview; only fetch real directions when user starts navigation

**Recommendation:** Start with Option D (remove walking API calls for preview, only fetch on navigation start) to eliminate the cost immediately. Then deploy OSRM (Option A) when you want accurate walking paths back.

**UPDATE: Phase 1 (Option D) is DONE.** Trip preview uses haversine estimates (zero API calls). Walking directions are fetched only when the user opens NavigationScreen. Files changed:
- `src/hooks/useTripPlanner.js` — `enrichWalking: false`
- `src/screens/TripPlannerScreen.js` — `enrichWalking: false`
- `src/screens/NavigationScreen.js` — enriches on mount via `enrichItineraryWithWalking()`
- `src/screens/NavigationScreen.web.js` — same enrichment on mount

---

## 3. Firebase Plan & Scaling Strategy

**Current state:** Spark (free) plan — 50k Firestore reads/day, 20k writes/day, 1GB storage.

**What to do:**

1. **Upgrade to Blaze plan now** (before launch)
   - Still has the same free tier (you don't pay until you exceed it)
   - Pay-as-you-go beyond free limits: ~$0.06/100k reads, ~$0.18/100k writes
   - Prevents hard cutoff when you exceed free limits

2. **Optimize Firestore usage to stay in free tier longer:**
   - **Trip history:** Batch writes — store trip searches as a daily summary doc instead of one doc per search
   - **Favorites:** Already low-volume, no concern
   - **User profiles:** Already low-volume, no concern
   - **Avoid real-time listeners on large collections** — use one-time reads where possible

3. **Cost projection:**
   - 1,000 daily users, each planning ~3 trips: ~3,000 writes + ~10,000 reads = well within free tier
   - 10,000 daily users: ~30k writes + ~100k reads = ~$0.15/day ($4.50/month)
   - Firebase Auth is free and unlimited for email/password

4. **Alternative if costs grow:** Migrate user data to Supabase (Postgres, generous free tier, open-source)

**Recommendation:** Upgrade to Blaze plan (no cost change, just removes hard limits) and batch trip history writes. Firebase costs should be negligible even at 10k daily users.

---

## 4. Map Tiles for Production

**Current state:** Using OpenStreetMap tile servers directly (`tile.openstreetmap.org`). OSM's [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) requires proper attribution and prohibits heavy commercial use.

**Options:**

**Option A: Protomaps (Recommended)**
- Self-hosted vector tiles from a single PMTiles file
- Ontario extract: ~2GB file, hosted on any static file host (S3, Cloudflare R3, etc.)
- Zero API calls — tiles served as static files
- Uses MapLibre GL JS (replaces Leaflet) for vector rendering
- Cost: just file hosting (~$1-3/month on Cloudflare R3)
- Beautiful customizable map styles

**Option B: Stadia Maps**
- Free tier: 200,000 tile requests/month (credits-based)
- Drop-in replacement for OSM tiles (just change the URL)
- No code changes needed beyond the tile URL
- Good for moderate traffic; paid plan at $150/month for more

**Option C: Self-hosted tile server**
- Run [OpenMapTiles](https://openmaptiles.org/) on a VPS
- More complex setup but unlimited requests
- Ontario vector tiles: ~3GB, needs ~4GB RAM server

**Option D: Mapbox**
- Free tier: 200,000 tile loads/month
- Great SDK but costs scale quickly ($0.60/1,000 loads after free tier)
- Lock-in risk with proprietary SDK

**Recommendation:** Protomaps (Option A) gives you unlimited tiles for pennies/month. It requires switching from Leaflet to MapLibre GL JS, which is a moderate code change but worth it for zero tile costs. If you want the quickest fix, Stadia Maps (Option B) is a URL swap.

---

## 5. CORS Proxy for Production

**The problem:** Web version needs a CORS proxy to fetch GTFS feeds from `myridebarrie.ca`. Dev uses `proxy-server.js` locally; production can't rely on free public proxies (`allorigins.win`, `corsproxy.io`).

**Options:**

**Option A: Serverless function on same host as API proxy (Recommended)**
- Deploy the CORS proxy as a Vercel/Netlify Edge Function alongside the LocationIQ proxy
- Vercel free tier: 100GB bandwidth, 100k function invocations/month
- Add the `/proxy` route from `proxy-server.js` to the deployed api-proxy
- Single deployment handles both LocationIQ proxying and GTFS CORS proxying

**Option B: Cloudflare Worker**
- Free tier: 100,000 requests/day
- Sub-50ms latency (edge network)
- Simple setup: ~20 lines of code
- Example: `addEventListener('fetch', event => { ... fetch(targetUrl) ... })`

**Option C: Cache GTFS feeds server-side**
- Instead of proxying every request, fetch GTFS data on a schedule (every 15-30 seconds for vehicle positions) and serve cached results
- Reduces upstream requests and adds reliability
- Could store in Redis or in-memory on a small VPS
- More complex but better architecture for scale

**Option D: Move GTFS processing to native only**
- If you go mobile-only, native apps don't have CORS restrictions
- Eliminates the need for a proxy entirely
- Limits your audience to app store users

**Recommendation:** Option A — deploy the existing proxy-server.js logic as a Vercel serverless function. It already has the CORS proxy + LocationIQ proxy routes. Vercel's free tier easily handles a transit app. If traffic grows, upgrade to Option C (cached GTFS) for reliability.

---

## Summary: Total Monthly Cost at Scale

| Component | Current | After Changes | At 10k Users/Day |
|-----------|---------|---------------|-------------------|
| LocationIQ | Free (5k/day, exposed key) | Free (key hidden via proxy) | $0 (use OSRM) or $49/mo |
| Firebase | Free (Spark) | Free (Blaze, same limits) | ~$5/month |
| Map Tiles | Free (OSM, policy risk) | Protomaps: ~$2/month | ~$3/month |
| CORS Proxy | Free public proxies | Vercel free tier | $0-20/month |
| OSRM (walking) | N/A | $5-10/month VPS | $10/month |
| **Total** | **$0 (fragile)** | **~$7-12/month** | **~$18-38/month** |

The app's architecture (local RAPTOR router, local geocoding, bundled address data) already does the heavy lifting client-side. With these changes, you can scale to tens of thousands of users for under $40/month.
