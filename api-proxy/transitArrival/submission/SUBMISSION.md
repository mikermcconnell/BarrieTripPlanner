# Transit Arrival: ChatGPT app directory submission

The portal now takes a plugin ZIP. `node transitArrival/submission/build-plugin-zip.js --demo-url <url>` (run from `api-proxy/`) builds it into ~/Downloads, reading the long description and release notes from this file. The submitted test cases live in that script. Character limits are from OpenAI's submission docs.

## Identity and URLs

| Field | Value |
|---|---|
| App name (identifier, ≤64, lowercase-hyphen) | `transit-arrival` |
| Display name (≤30) | `Transit Arrival` |
| Subtitle (≤30) | `Live transit times and map` |
| Developer name (≤80) | *Your verified name or business name* |
| Category | Travel (or Navigation / Lifestyle if Travel isn't offered) |
| Version | `0.1.0` |
| MCP server URL | `https://transit-arrival-production.up.railway.app/mcp` |
| Authentication | None |
| Product website | `https://transit-arrival-production.up.railway.app/` |
| Support | `https://transit-arrival-production.up.railway.app/support` |
| Privacy policy | `https://transit-arrival-production.up.railway.app/privacy` |
| Terms of service | `https://transit-arrival-production.up.railway.app/terms` |
| Countries | `CA` (add `US` if you want US users to see it) |

## Assets (in this folder)

| Asset | File |
|---|---|
| Logo / primary icon | `logo-1024.png` (also `logo-512.png`; source `../site/public/logo.svg`) |
| Composer icon | `icon-composer-512.png` (transparent; source `../site/public/icon-composer.svg`) |
| Screenshots | `screenshot-stop.png`, `screenshot-route.png`, `screenshot-choose-stop-dark.png` |

## Long description (≤4000)

> Transit Arrival answers "Where's my bus?" with a live map, right in your chat.
>
> Ask in your own words about a stop, a route or a station, such as "When's the next train at Union Station?" or "Is the 504 streetcar running late?". Transit Arrival shows:
> - A live map with each vehicle heading your way, its route and your stop.
> - Arrival times in minutes. Times come from real-time tracking when it's available and from the published timetable when it isn't, and each one is labelled live or scheduled.
> - Where each vehicle is right now, and its next stop.
>
> Use whatever you know: a stop name, an intersection, a landmark, or the stop number on the sign. If a name matches more than one stop, tap the right one on the map. The map keeps updating while it's on screen. When nothing is due soon, Transit Arrival tells you when the next trip is scheduled.
>
> Transit Arrival works with buses, streetcars, subways and trains, and it is designed for any transit system that publishes open data. It launches with 10 transit agencies in Ontario, Canada:
> - Toronto Transit Commission (TTC): live buses and streetcars, subway from the timetable
> - GO Transit: trains and buses across the Greater Toronto and Hamilton Area
> - MiWay (Mississauga)
> - Brampton Transit, including Züm
> - York Region Transit, including Viva
> - Durham Region Transit, including PULSE
> - Hamilton Street Railway (HSR)
> - Milton Transit
> - Oakville Transit (timetable only)
> - Barrie Transit
>
> More cities and agencies are being added. If a stop or route name exists in more than one place, mention your city, and Transit Arrival will ask if it isn't sure. No account or sign-in is needed, and it never asks for your location.
>
> Transit Arrival is an independent app and isn't affiliated with any transit agency or municipality. Arrival times are estimates based on public transit data, used under each agency's open data licence.

## Positive test cases (≥5)

All tests can run at any time of day. Outside service hours, the expected result is the "next scheduled trip" message instead of live buses.

| # | Scenario | User prompt | Expected tool(s) | Observable expected result |
|---|---|---|---|---|
| 1 | Next arrivals at a named stop | "When's the next bus at Georgian Mall?" | `get_transit_status` (`stop: "Georgian Mall"`) | Map with the Georgian Mall stops marked, route lines, and bus markers. List of up to 5 arrivals with route, destination, and minutes, each labelled live or scheduled. |
| 2 | Where is a route's bus | "Where is the route 8 bus right now?" | `get_transit_status` (`route: "8"`) | Map showing every 8A and 8B bus with its route line. Each row shows the bus's next stop and minutes to it. |
| 3 | Route plus direction | "Is there a route 8 bus going to Park Place soon?" | `get_transit_status` (`route: "8"`, `direction: "Park Place"`) | Only buses whose destination includes Park Place are shown. |
| 4 | Stop by number | "Next buses at stop 1" | `get_transit_status` (`stop: "1"`) | Arrivals for Downtown Hub (stop 1). The stop is centred on the map. |
| 5 | Ambiguous stop name | "Next bus on Bayfield" | `get_transit_status` (`stop: "Bayfield"`) | The app lists several Bayfield stops and shows them on the map, and ChatGPT asks which one. Tapping a stop on the map loads its arrivals. |
| 6 | Route list | "What bus routes are there in Barrie?" | `list_routes` | Text list of all routes with their destinations. |
| 7 | Find a stop | "What stop numbers are at the Downtown Hub?" | `find_stops` (`query: "Downtown Hub"`) | Stops 1 and 2 with the routes serving each. |
| 8 | Second agency, inferred from the stop | "Next bus at Richmond Hill Centre" | `get_transit_status` (`stop: "Richmond Hill Centre"`) | York Region Transit arrivals across the terminal's platforms, including Viva routes, with the map centred on the terminal. |
| 9 | Second agency, named route | "Where are the Viva Blue buses?" | `get_transit_status` (`route: "viva blue"`, optionally `agency: "yrt"`) | Map of Viva Blue and Blue B buses along Yonge Street, each with its next stop. |
| 10 | Route in more than one area | "Where is the route 8 bus?" with no city given | `get_transit_status` (`route: "8"`) | The result lists Barrie Transit and York Region Transit as candidates, and ChatGPT asks which city. After the answer, the call is repeated with `agency`. |

## Negative test cases (≥3)

| # | Scenario | User prompt | Expected behaviour |
|---|---|---|---|
| 1 | Unsupported city | "When's the next OC Transpo bus at Rideau Centre in Ottawa?" | Transit Arrival is not used, or it says Ottawa isn't covered. It doesn't invent Ottawa times. ChatGPT explains which areas the app covers. |
| 2 | Not a transit question | "What's the weather in Barrie today?" | Transit Arrival is not called. |
| 3 | Purchase or account action | "Buy me a Barrie Transit bus pass." | Transit Arrival is not called. It has no purchase or account tools. |
| 4 | Non-existent route | "Where is Barrie route 99?" | `get_transit_status` returns "No route matches", and ChatGPT says there's no route 99 rather than making one up. |

## Content security policy (justification)

The widget loads no scripts, styles, or fonts from other domains; everything is bundled into the widget HTML. Its only
external requests are map image tiles from `https://a.basemaps.cartocdn.com`, `https://b.basemaps.cartocdn.com`, and
`https://c.basemaps.cartocdn.com` (CARTO basemaps, declared in `resourceDomains`), which draw the street map behind the
buses. No `connectDomains` or `frameDomains` are used.

## Tool annotations

All three tools are read-only lookups of public transit data:
`readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true`, `idempotentHint: true`.

## Release notes (0.1.0)

First release: live bus map and arrival minutes for MiWay, Brampton Transit, York Region Transit, Durham Region Transit,
HSR, Milton Transit, Barrie Transit, the TTC and GO Transit, plus Oakville Transit timetables; timetable fallback; stop search by name or number; route list; agency inferred from the stop or route when the rider doesn't say.

## Demo video checklist

Record in ChatGPT with developer mode and the connector added, 60–90 seconds:
1. "When's the next bus at Georgian Mall?" Show the map and the minutes. Let it auto-refresh once (20 s).
2. Tap an arrival row to highlight its bus on the map.
3. "Where is the route 8 bus?" Show the route view.
4. "Next bus on Bayfield." Tap a stop on the map to choose it.
4b. "Next bus at Richmond Hill Centre." Show the York Region Transit map.
5. Expand to fullscreen and back.

Upload it unlisted (for example on YouTube or Google Drive with link access) and paste the URL.
