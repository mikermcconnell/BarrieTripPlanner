# Rider-trust fixes and validation

Date: 2026-09-20
Status: Implemented locally; not deployed or device-certified.

## Fixed behavior

1. **Service-day identity:** local routing retains each candidate's service date, compares candidates on absolute time, and builds after-midnight legs on the correct calendar date. Boarding/alighting stop sequences and through-service exit-trip identity survive itinerary construction.
2. **Live-data eligibility:** trip updates retain feed/update timestamps and trip dates. Matching requires fresh evidence and the correct service day. Updates without dates are restricted to nearby current-day trips. Stale, missing, future-dated or failed-refresh evidence falls back to scheduled times rather than retaining a live label.
3. **Absolute predictions:** valid event timestamps take precedence over delay offsets. Missing delay is not silently interpreted as an on-time prediction.
4. **Transfer feasibility:** boarding departure and alighting arrival predictions are applied separately, including repeated stops and through-services. Cancelled trips and skipped required stops cannot start navigation. Explicit NO_DATA stops reset delay propagation.
5. **Requested-time feasibility:** the original departure/arrival boundary is retained through walking enrichment, live updates and cached searches. Impossible options are excluded before preview/history callbacks; navigation uses the same time/transfer checks. More candidates are enriched before display truncation, allowing a later departure or earlier arrival option to replace an infeasible one. If none remain, the rider gets a no-route error rather than an impossible recommendation.

## Evidence

- Full app suite: **227 suites / 1,346 tests passed**.
- `src/__tests__/riderTrustRegression.test.js`: midnight date regression, real protobuf metadata parsing, stale/wrong-day/future/undated evidence, timestamp-only predictions, separate exit-stop predictions, repeated stop visits, through-service updates, cancellation/skip/NO_DATA, walking bounds and malformed headers.
- `src/__tests__/riderTrustRoutingIntegration.test.js`: real local router + walking + trip-service integration; later/earlier feasible alternatives, unreachable last bus, cached-request bounds, live deadline checks and failed-refresh fallback.
- `src/__tests__/tripPlannerRegression.test.js`: shared native/web hook excludes impossible options before preview/history, and exposes a no-route error when no feasible option remains.
- Existing local-router, itinerary, live-data, navigation and Firebase-rule tests also passed as part of the full suite.
- Focused diff whitespace validation passed. Pre-existing tracked changes were compared with the pre-patch diff and were unchanged.

Run the focused checks from the repository root:

```powershell
.\node_modules\.bin\jest.cmd --runInBand --runTestsByPath src/__tests__/riderTrustRegression.test.js src/__tests__/riderTrustRoutingIntegration.test.js src/__tests__/tripPlannerRegression.test.js src/__tests__/tripDelayService.test.js src/__tests__/localRouter.test.js src/__tests__/itineraryModules.test.js src/__tests__/tripNavigationSafety.test.js src/__tests__/navigationRecalculationService.test.js
```

## Boundaries and release follow-up

- Tests use controlled feeds and walking responses; they do not certify live provider behavior, browser rendering or Android/device behavior.
- No build, deployment, Firebase write, rules deployment or production mutation was performed.
- Firebase review: `tripHistoryFirestoreService` stores endpoints and a fixed duration/transfers/walkDistance summary, not the new itinerary fields. Firestore document shapes, auth, collections, queries and write behavior are unchanged. No Firestore/Storage rule or index changes are required for this patch.
- Before release, exercise the five scenarios on web and Android using controlled data, then check normal live-feed trips. Include offline fallback, an after-midnight trip and a missed transfer.
- Default live-update freshness is five minutes with one minute of future clock-skew tolerance. Undated updates require the scheduled trip to be within six hours of now on the current service date; older/ambiguous evidence is deliberately not called live. Absolute predictions more than six hours from schedule are rejected as implausible for these local trips.
- Candidate search remains bounded by the existing routing candidate pool; this patch does not promise exhaustive route discovery or continuous live replanning during an already-started journey.

## Follow-up fixes (2026-09-20)

- Navigation preparation refreshes trip predictions after preparing walking directions. Failed feed refreshes discard old live predictions. The final start check uses the current clock plus the access-walk duration, not only the original search time; walking-only journeys are unchanged. This is a start-of-journey check, not a mid-journey expiry rule.
- Local routing, cross-day candidate ordering and itinerary construction share the GTFS noon-minus-12-hours service-day anchor. The request instant is converted into each service day's elapsed seconds, including previous-day services. Explicit instants in the repeated autumn hour remain distinct.
- Transit legs retain separate boarding/arrival prediction availability. Trip cards label arrival or departure status; arrival-only predictions and late arrivals no longer produce an unqualified on-time badge. Legacy cached legs without endpoint availability do not assert on-time status.
- Regression coverage includes aged previews, refresh failure, delayed-but-reachable buses, insufficient access-walk time, both DST transition dates, over-24-hour GTFS times, repeated autumn hours, and both trip-card layouts.
- These fields remain transient itinerary state; no Firestore document shapes, auth, queries, indexes or Storage rules change. No deployment is included.

Follow-up verification: **228 suites / 1,373 tests passed** (full app suite), including the detour cadence stress checks and both trip-card layouts. `git diff --check` passed. All 84 pre-existing tracked diffs outside this turn's edit scope were unchanged. Browser/Android and production checks were not rerun; automated component checks are not device sign-off. Detour scoring passes regressions but still fails production readiness; see `docs/detour-ground-truth/README.md` for the missing real-trace evidence and historical Route 12B result.
