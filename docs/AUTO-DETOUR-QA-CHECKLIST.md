# Auto-Detour QA Checklist

Use this checklist during live auto-detour validation. The goal is to confirm the backend detects, updates, renders, and clears detours correctly without leaving stale rider-facing detours.

Before fixing a meaningful detour issue, capture it in [`AUTO-DETOUR-VALIDATION-MATRIX.md`](./AUTO-DETOUR-VALIDATION-MATRIX.md) or update the matching scenario row. The QA checklist proves current behavior; the matrix preserves what was learned.

## 0. Issue Capture / Change Control

- [ ] Identify the matching scenario in `AUTO-DETOUR-VALIDATION-MATRIX.md`, or add a new one.
- [ ] Record what happened, what should have happened, affected route(s), date/time, and evidence.
- [ ] Classify the issue: detection, geometry, clearing, route family, publishing/history, frontend rendering, or baseline/operations.
- [ ] Confirm whether the expected behavior is already documented in `AUTO-DETOUR-DETECTION.md`.
- [ ] Confirm whether the fix needs automated regression coverage, manual validation, or both.
- [ ] Before closing the issue, update the matrix with root cause, fix, tests, docs, and remaining risk.

## 1. Pre-Test Setup

- [ ] Confirm you are testing the expected environment: local, staging, or production.
- [ ] Confirm `EXPO_PUBLIC_ENABLE_AUTO_DETOURS=true` for the app build being tested.
- [ ] Confirm the detour worker is enabled:
  - [ ] `DETOUR_WORKER_ENABLED=true`
  - [ ] worker mode is known: `interval`, `manual`, or `scheduled`
- [ ] Confirm Firebase Admin credentials are configured for worker publishing.
- [ ] Confirm baseline is safe:
  - [ ] `DETOUR_REQUIRE_SAFE_BASELINE=true`
  - [ ] `/api/baseline-status` reports a trusted baseline.
- [ ] Confirm active detours require normal-route GPS proof to clear or become hidden solely because of lifecycle state.
- [ ] Confirm road matching is configured if testing rider-facing detour paths:
  - [ ] `DETOUR_ROAD_MATCHING_ENABLED=true`
  - [ ] OSRM base URL is reachable.

## 2. Current Live State Check

- [ ] Query `activeDetours`.
- [ ] Record active detour route IDs.
- [ ] For each active detour, record:
  - [ ] `state`
  - [ ] `detectedAt`
  - [ ] `lastSeenAt`
  - [ ] `lastEvidenceAt`
  - [ ] `latestGpsEvidenceAt`
  - [ ] `geometryLastEvidenceAt`
  - [ ] `vehicleCount`
  - [ ] `uniqueVehicleCount`
  - [ ] `currentVehicleCount`
  - [ ] `riderVisible`
  - [ ] `alertVisible`
  - [ ] `alertVisibilityReason`
  - [ ] `riderVisibilityReason`
  - [ ] `riderPublishGates` for detour, rider alert, likely path, skipped stops, and clear proof reasons
  - [ ] `staleForReview`
  - [ ] `evidencePointCount`
  - [ ] `roadMatchSource`
  - [ ] `likelyDetourPolyline` point count
  - [ ] `detourPathSuppressedReason`, if present
- [ ] Query `persistentDetoursAuto` and `persistentDetourGeometriesAuto` for long-running detours.
- [ ] Confirm global learned geometry is only used after the route has a published/persistent route record; it must not publish a one-vehicle candidate by itself.
  - [ ] `skippedSegmentPolyline` point count
  - [ ] `sharedDetourEventId`
  - [ ] `sharedRouteIds`
  - [ ] `eventPrimaryRouteId`
- [ ] Check recent `detourHistory` events for those routes.
- [ ] Flag stale active detours for review; they may remain active until normal-route GPS proves service has resumed.

## 3. Worker Tick / Publishing Check

- [ ] Run or wait for one worker tick.
- [ ] Confirm the tick processed current vehicles.
- [ ] Confirm the tick completed without errors.
- [ ] Confirm Firestore writes happened when expected.
- [ ] Confirm cleared docs are not recreated unless fresh off-route evidence returns.
- [ ] Confirm current active detours remain stable across multiple ticks.

## 4. Detection Check

When a suspected detour exists:

- [ ] Confirm buses are repeatedly off their baseline route shape.
- [ ] Confirm detection waits for consecutive off-route readings.
- [ ] Confirm one-off GPS noise does not create a detour.
- [ ] For short detours, confirm a first off-route point creates candidate evidence but does not create rider UI by itself.
- [ ] Confirm the three required off-route pings can accumulate across two same-route trips/vehicles; they do not all need to be from one trip.
- [ ] Confirm one trip with three off-route pings stays candidate-only when two unique trips/vehicles are required.
- [ ] Confirm the same trip is not counted twice when the AVL/vehicle ID changes mid-trip.
- [ ] If trip IDs are missing, confirm one-point unstable vehicle IDs stay backend candidate/diagnostic only.
- [ ] Confirm explicit non-revenue/deadhead, cancelled, or deleted trip evidence does not create a rider-visible detour.
- [ ] Confirm a second unique same-route trip/vehicle can confirm the same short candidate once the same corridor has at least three matching off-route pings.
- [ ] For missed-detour reviews, check the latest per-vehicle projection diagnostic: distance from shape, classification, shape ID, and threshold used.
- [ ] Confirm `DETOUR_DETECTED` is written to `detourHistory`.
- [ ] Confirm `activeDetours/{routeId}` appears.
- [ ] Confirm the route ID is correct.
- [ ] For branch routes, confirm route family behavior:
  - [ ] `8A` and `8B` are handled as family routes where appropriate.
  - [ ] a selected base route like `8` can surface active `8A/8B` detours.
  - [ ] one stale branch does not keep the whole family falsely active.

## 5. Geometry / Road Matching Check

For each active detour:

- [ ] Orange dashed line shows the closed regular route segment.
- [ ] Purple/route-colour line shows the likely open detour path.
- [ ] The likely detour path follows roads.
- [ ] The likely detour path does not snap back onto the closed route segment.
- [ ] Weird spurs, loops, or unnecessary deviations are not shown.
- [ ] Same-stop turnarounds are not shown as detours when no closed route segment is identified.
- [ ] Paths with no entry stop, no exit stop, no skipped route segment, and no skipped/affected stops are not shown as detours.
- [ ] Long out-and-back paths are not shown when the identified closed segment span is tiny and no skipped route segment exists.
- [ ] Short GPS-confirmed detours with no skipped stops remain public when geometry is safe, but show only route/corridor-level messaging and no closed-stop notification.
- [ ] Entry and exit points make sense.
- [ ] Multiple independent detour sections are separate, not merged into one giant section.
- [ ] If road matching fails, untrusted raw off-road GPS lines are not shown to riders.
- [ ] If `canShowDetourPath=true` and road matching has not produced a `likelyDetourPolyline`, the trusted `inferredDetourPolyline` can still appear as the alternate path.
- [ ] If a segment has `canShowDetourPath=false` with `detourPathSuppressedReason=road-match-closed-overlap`, the app does not draw a stale top-level `likelyDetourPolyline` or `inferredDetourPolyline` for that segment.
- [ ] A newly road-matched `likelyDetourPolyline` is continuous through the safe entry/rejoin handoff, with no visible gap and no material interior overlap on the closed route segment.
- [ ] A trusted V2 inferred path with a short boundary gap is continuous at entry and rejoin; a gap over 150m is not bridged with a straight line and is flagged for better geometry or road matching.
- [ ] A final inferred/likely path that remains more than 150m from either service boundary is suppressed with `detourPathSuppressedReason=detour-boundary-gap`; an explicit `serviceRejoinPoint` is accepted as the exit target.
- [ ] If there is no trustworthy skipped segment or detour path, a confirmed event publishes `alertVisible=true`, `riderVisible=false`, and `canShowDetourPath=false`; the rider UI shows an alert without unsafe map or stop details.
- [ ] After a trustworthy path becomes rider-visible, it remains visible on between-bus ticks with `currentVehicleCount=0`; it does not alternate to `stale-mixed-evidence` unless newer evidence proves the geometry unsafe.

## 6. Map Rendering Check — Regular Tab

- [ ] The route still appears in regular route browsing.
- [ ] Detoured/closed sections are shown as orange dashed overlays.
- [ ] The closed section is not shown as a normal active route line.
- [ ] The user can tell service is not running on the closed section.
- [ ] Bus stop markers render above route lines.
- [ ] Bus markers remain visible and readable.
- [ ] Switching away and back does not recreate stale regular route lines.

## 7. Map Rendering Check — Detours Tab

- [ ] Detours tab shows all active detours.
- [ ] One physical closure affecting multiple routes appears as one event card with multiple route chips.
- [ ] Shared event cards do not merge the route lines or route-specific map overlays.
- [ ] Normal route line is hidden or de-emphasized on closed detoured sections.
- [ ] Orange dashed closed sections remain visible.
- [ ] Likely detour path remains visible and road-following.
- [ ] Bus stop markers render above all route/detour lines.
- [ ] Open/closed stops are visually understandable.
- [ ] Legend appears only when helpful and does not block critical map content.
- [ ] No auto-zoom happens when simply entering detour view.
- [ ] Focused camera padding keeps the full closed and detour paths clear of the search bar, alert strip, focus controls, and bottom navigation.
- [ ] Vehicle markers do not cover the detour-path label; labels suppress or move when there is not enough room.
- [ ] The collapsed alert uses a readable location and affected-stop count; raw stop codes remain available in details.

## 8. Tab Switching Regression Check

Repeat several times:

- [ ] Regular → Detours.
- [ ] Detours → Regular.
- [ ] Regular → Detours again.
- [ ] Confirm stale regular route lines do not repopulate over closed detour sections.
- [ ] Confirm detour overlays do not disappear.
- [ ] Confirm bus stops stay above route lines.
- [ ] Confirm map performance remains acceptable.

## 9. Details Sheet / Rider Information Check

- [ ] Detour banner lists the correct affected route(s).
- [ ] If multiple routes share the same physical closure, they appear on one event card.
- [ ] If two detours are nearby but have different physical closure geometry, they stay as separate event cards.
- [ ] Tapping the banner opens the correct detour details.
- [ ] Details sheet shows:
  - [ ] route ID
  - [ ] current state
  - [ ] affected/closed stops
  - [ ] open stops where service continues/resumes
  - [ ] detected time or useful timing
- [ ] Affected stops match the map.
- [ ] Route variants and opposite directions are not mixed incorrectly.
- [ ] Text is understandable to riders.

## 10. Clearing Check — Normal Clear

When buses return to route:

- [ ] Vehicles are back within the on-route clear threshold.
- [ ] Clear does not happen before the minimum active/grace window.
- [ ] For geometry-backed detours, clear requires normal-route GPS traversal through the affected segment.
- [ ] Confirm clearing is not just a fixed ping count; one on-route GPS point alone does not clear.
- [ ] Confirm at least two useful same-bus on-route GPS samples show route-progress movement through the affected segment.
- [ ] Confirm two unique same-route trips/vehicles can collectively clear only when their on-route samples cover the affected segment window and no newer off-route evidence has returned.
- [ ] Confirm long segments may require more samples to prove the 60% overlap / up-to-100m movement rule; short segments can clear before the fixed consecutive-on-route threshold once traversal proof exists.
- [ ] For geometryless confirmed records with no clear window, generic same-route normal-service pings do not clear; the alert stays public without map details until a clear window is recovered and GPS-traversed, or an operator/admin explicitly clears it.
- [ ] `DETOUR_CLEARED` is written to `detourHistory`.
- [ ] The `activeDetours` doc is deleted.
- [ ] The app removes the rider-facing detour promptly.
- [ ] The detour does not immediately flap back on.
- [ ] For loop routes that start/end at Downtown Hub, a same-bus GTFS trip rollover does not count as clear proof by itself.

## 11. Stale Monitoring Check

For old active detour protection:

- [ ] The backend keeps the active detour record until normal-route GPS traversal proof exists.
- [ ] `staleForReview` alone does not hide a confirmed active alert.
- [ ] When the exact route is reporting, an event with no matching GPS evidence for more than 90 minutes may become `riderVisible=false` with `stale-evidence-awaiting-gps-clear`, while `alertVisible=true` and the backend record remains active.
- [ ] One new matching bus refreshes the heartbeat of an already-confirmed visible event; a previously hidden event still requires normal confirmation before returning to riders.
- [ ] The rider UI hides an active alert only when the backend explicitly publishes `alertVisible=false`; `riderVisible=false` hides rich details only when `alertVisible=true`.
- [ ] Geometryless/unsafe detours stay hidden from riders while the backend keeps monitoring for better geometry, a recoverable clear window, or operator review.
- [ ] Confirm valid active construction detours, such as route-family detours between vehicle observations, remain active until normal-route GPS traversal proof exists.
- [ ] No `DETOUR_AUTO_CLEARED_STALE` event is expected for current active detours; treat that event type as legacy/ops-review history.
- [ ] The backend keeps the stale active doc until a `DETOUR_CLEARED` flow deletes it.
- [ ] If `alertVisible=true` and `riderVisible=false`, the app keeps the alert strip and detours entry, hides unsafe overlays and stop impacts, explains that details are updating, and omits the map action.
- [ ] The detour is not recreated after GPS clear unless fresh off-route evidence returns.

## 12. Low-Frequency / Sunday Service Check

Use this to avoid false clears on hourly service:

- [ ] Confirm route headway from GTFS for the current day/time.
- [ ] Confirm elapsed time never clears a detour; the 90-minute evidence-age rule may hide it from riders only while the exact route is actively reporting.
- [ ] Confirm the system does not clear just because no bus reached the detour area yet.
- [ ] Confirm no-scheduled-service periods do not clear from staleness alone.
- [ ] Confirm no-scheduled-service periods do not hide otherwise valid detours solely because no bus is scheduled.
- [ ] Confirm first bus off-route creates backend candidate evidence but no rider UI.
- [ ] Confirm second bus 30-60 minutes later can confirm the same candidate.
- [ ] Confirm a one-point short deviation candidate survives between low-frequency trips.
- [ ] Confirm candidate expires after the configured candidate confirmation window.
- [ ] Confirm repeated evidence from the same trip/vehicle does not count as two buses.

## 13. Cold Start / Scheduler Baseline Check

- [ ] Confirm Cloud Scheduler runs every 60 seconds during service hours.
- [ ] Confirm burst sampling is disabled in the target environment.
- [ ] If 30-second offset sampling is enabled, confirm the primary run enqueues exactly one delayed Cloud Task.
- [ ] Confirm the offset task calls `/api/detour-run-once?source=offset-30s` about 30 seconds after the primary run.
- [ ] Confirm the Firestore distributed lock skips overlapping runs rather than double-processing.
- [ ] Confirm duplicate GTFS-RT snapshots are skipped and do not count as fresh evidence.
- [ ] Restart the backend while `activeDetours` contains a published detour.
- [ ] Confirm the first post-restart tick does not delete the Firestore detour just because runtime state is empty.
- [ ] Confirm the detour still clears only after normal-route GPS traversal.

## 14. History / Rollout Health Check

- [ ] Review recent `detourHistory`.
- [ ] Confirm event order is sensible:
  - [ ] `DETOUR_DETECTED`
  - [ ] `DETOUR_UPDATED`
  - [ ] `DETOUR_CLEARED` after normal-route GPS proof
- [ ] Check for repeated detect/clear flapping.
- [ ] Check `/api/detour-rollout-health`.
- [ ] Confirm launch readiness is acceptable for the test stage.
- [ ] Confirm `labelledDetectionQuality` has enough operator-reviewed detections and meets the precision target before calling the feature fully production-ready.
- [ ] Open **Profile → Detour Review** with the allowlisted reviewer account, confirm rider-visible pending cases rank first, and verify a saved review updates the audited readiness count.
- [ ] Confirm a final true/false review requires an evidence source and note, while uncertain and hidden cases do not increase readiness.
- [ ] Treat `falsePositiveRate.measurement=short-lived-clear-proxy` as triage evidence only, not measured false-positive accuracy.
- [ ] Run `npm run score:detour-quality` and confirm the deterministic corpus passes with zero duplicate publications.
- [ ] Run `npm run score:detour-synthetic-lab` and confirm all 15 test-only 30-second traces pass; verify the report says `countsTowardProductionReadiness: false`.
- [ ] Record any false positives, stale warnings, or unexpected clears for follow-up.

## 15. Final Acceptance Criteria

Pass the test only if:

- [ ] Riders can clearly see when a route is on detour.
- [ ] Closed regular route sections are not presented as active service.
- [ ] Likely detour paths follow roads.
- [ ] Stops and buses stay visible above route lines.
- [ ] Route families like `8A/8B` behave correctly.
- [ ] Detours clear normally when buses return to route.
- [ ] Stale/headway checks do not clear active detours without GPS proof.
- [ ] No stale detours reappear after tab switching or worker ticks.
- [ ] History gives enough detail to audit what happened.
