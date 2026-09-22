# Arrival destination fallback

Implemented against Android internal build 1.0.12 (31), commit c081740.

## Scope and safety

When a live trip ID is absent from the timetable, arrivals may resolve a destination from the same route's ordered remaining stops. This is destination-only: do not reuse this match for trip identity, arrival times, vehicle tracking, or trip planning.

- Retain all published stop-pattern/headsign variants, including blank headsigns.
- Require at least three distinct stops in increasing live stop-sequence order.
- Require a consecutive match ending at the scheduled terminal.
- Every compatible pattern must agree on the destination; a compatible continuation, blank label, loop ambiguity, or conflicting label fails closed.
- Added/replacement/unscheduled trips are not inferred. Missing legacy cache patterns simply leave the destination unresolved until timetable refresh.
- Existing direct trip-ID labels take priority. Existing loading, refresh, and error reporting remain for unresolved destinations.
- The shared native/web ArrivalRow continues displaying Destination unavailable when unresolved.

The pattern index is derived from public GTFS data and cached locally with existing timetable mappings. No Firestore document shape, query, authorization, write, index, or Storage access changes; Firebase rules and deployment are not applicable.

## Evidence

Public feeds captured 2026-09-20 23:49:51 UTC: 56 live trips, zero exact ID matches among 1,717 scheduled trips. Replaying the captured feeds against the change resolved 10 of 23 arrivals at stop 2, retaining every live timing/identity field. The exact alert trip cc83688f-2fbd-425c-99f7-793d0b132d65 resolves to RVH/YONGE to Georgian College. Thirteen arrivals remain unresolved; this is intentionally not a route-name guess.

The regression fixture stores that public trip update and ALL static route 8A variants from the same capture. It contains no rider data.

Focused verification: arrivalDestination, arrivalService, useStopArrivals, offlineCache.startup, gtfsService.fetch, and ArrivalRow tests. Includes cache write/read-back, hook wiring, ambiguity and stale-feed rejection, exact alert replay, and unchanged timing.

No device/browser session, production build, release, or provider-side correction performed. The replay proves local behavior on captured feed data, not deployed behavior or the timetable contents of the affected phone. Feed-provider trip-ID reconciliation is still the permanent upstream fix.
