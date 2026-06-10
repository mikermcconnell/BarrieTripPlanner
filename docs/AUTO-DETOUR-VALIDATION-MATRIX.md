# Auto-Detour Validation Matrix

Status: Current as of 2026-05-29

Use this file to turn detour bugs, live observations, and product decisions into repeatable validation scenarios.

## Purpose

Auto-detour quality should improve through accumulated evidence, not one-off chat fixes.

For every meaningful detector issue:

1. Capture the observed scenario.
2. State the expected rider-facing and backend behavior.
3. Identify the root cause.
4. Add or update automated coverage where practical.
5. Update docs if the behavior or validation process changed.
6. Record remaining risks.

## Source-of-truth boundaries

- Expected behavior, data model, and rider UX: [`AUTO-DETOUR-DETECTION.md`](./AUTO-DETOUR-DETECTION.md)
- Manual/live validation steps: [`AUTO-DETOUR-QA-CHECKLIST.md`](./AUTO-DETOUR-QA-CHECKLIST.md)
- Backend deployment and operations: [`API-PROXY-OPERATIONS.md`](./API-PROXY-OPERATIONS.md)
- This file: scenario index, regression matrix, and change-control workflow
- Dated notes under [`docs/plans/`](./plans/) remain working notes only.

If this file conflicts with the behavior doc, fix the conflict instead of treating this file as an override.

## Scenario matrix

| ID | Scenario | Expected behavior | Automated coverage | Manual/live validation | Current status | Risk to watch |
|---|---|---|---|---|---|---|
| DET-001 | Normal confirmed detour | Publish an active detour only after confirmed off-route evidence from the required unique same-route vehicles. | `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/detourIntegration.test.js` | QA sections 3, 4, 9 | Covered | False positives from noisy GPS or bad baseline |
| DET-002 | Likely path confidence gate | Keep the alert active, but hide the rider-facing likely path until trusted entry/exit and corridor evidence exist. | `api-proxy/__tests__/detourGeometry.test.js`, `src/__tests__/detourOverlays.test.js` | QA sections 5, 6, 7 | Covered | Sparse evidence producing a convincing but wrong purple path |
| DET-003 | Very short recurring detour | Capture a first off-route point as candidate evidence, but publish only when the same corridor has at least three matching off-route pings and two unique same-route trips/vehicles. The three pings can be split across trips. | `api-proxy/__tests__/detourDetector.test.js` | QA sections 4, 12 | Covered | Counting repeated snapshots from the same trip as independent evidence |
| DET-004 | Low-frequency / Sunday service | Keep candidate evidence long enough for the next low-frequency bus to corroborate; do not clear from bus absence. | `api-proxy/__tests__/detourDetector.test.js` | QA section 12 | Covered | Candidate memory too short or stale warnings mistaken for clear proof |
| DET-005 | GPS-proven normal clearing | Clear only after normal-route traversal proof through the affected segment: either same-bus traversal or two unique same-route trips/vehicles collectively covering the clear window after latest off-route evidence. Default proof requires at least 60% overlap and enough route-progress movement through it (up to 100m; shorter segments use their 60% span), then delete the active Firestore doc after `clear-pending`. | `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/detourPublisher.test.js` | QA sections 10, 11 | Covered | Premature clearing when a bus is merely near the route or when a fixed on-route ping count is met without traversal coverage |
| DET-006 | Stale active detour | Keep active detours visible with `currentVehicleCount: 0` until new evidence confirms detour or normal routing. | `api-proxy/__tests__/detourDetector.test.js` | QA sections 11, 12 | Covered | Old evidence staying visible too long without operator review context |
| DET-007 | Backend cold start with active detours | Rehydrate runtime state or active Firestore snapshots so the first post-restart tick does not delete valid detours. | `api-proxy/__tests__/detourIntegration.test.js` | QA section 13 | Covered | Empty runtime state causing accidental deletion |
| DET-008 | Same-route multiple independent detours | Publish separate `segments[]` under one route document; do not merge separated closures into one giant lifecycle. | `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/detourIntegration.test.js` | QA sections 5, 14 | Covered | Normal in-between route travel clearing or merging unrelated segments |
| DET-009 | Multi-vehicle noisy geometry | Select a representative trajectory instead of weaving all vehicle points into overlapping reroute branches. | `api-proxy/__tests__/detourGeometry.test.js` | QA section 5 | Covered | Messy inferred path when vehicles take different alternates |
| DET-010 | Route-family projection | Project a confirmed physical closure to sibling route variants only when the source segment has reliable closure geometry. | `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/detourGeometry.test.js` | QA sections 4, 12, 15 | Covered | A bus using a sibling's regular route being mislabeled as a detour |
| DET-011 | Same-stop self-loop / turnaround | Reject same-stop self-loop geometry when no real closed route segment is identified. | `api-proxy/__tests__/detourGeometry.test.js`, `api-proxy/__tests__/detourPublisher.test.js` | QA section 5 | Covered | Route-fallback spurs appearing as false detours |
| DET-012 | Rider map rendering | Show closed route sections, likely detour paths, stops, buses, banner, and details without stale overlays after tab switching. | `src/__tests__/detourOverlays.test.js`, `src/__tests__/detourIntegration.test.js`, `src/__tests__/detourRouteMasking.test.js` | QA sections 6, 7, 8, 9 | Partially covered | Visual regressions that only appear in native/web map rendering |
| DET-013 | Baseline safety | Block detection when the baseline is unsafe, but automatically accept stable route-level GTFS geometry changes after a force-refresh stability check. | Existing backend status and rollout-health checks | QA sections 1, 13, 14 | Needs explicit scenario review before launch | Treating an unstable or temporary live detour as normal service |
| DET-014 | Rollout health / flapping | Surface recent failures, flapping, short-lived detections, and false-positive indicators before public launch. | `api-proxy` rollout-health coverage where present | QA section 14 | Needs ongoing live review | Launching with noisy but test-passing behavior |
| DET-015 | Missed one-sample short detour | A brief off-route movement visible for only one GTFS-RT sample should become backend candidate evidence and be explainable through per-vehicle projection diagnostics. | `api-proxy/__tests__/detourDetector.test.js` | QA sections 4, 12, 14 | Covered | Publishing too aggressively from one-bus GPS noise |
| DET-016 | Short detour sampling cadence | If the GTFS-RT feed updates about every 30 seconds, the detector should support true half-minute sampling without keeping a Cloud Run request open. | `api-proxy/__tests__/detourOps.test.js`, `api-proxy/__tests__/detourOffsetTasks.test.js`, `api-proxy/__tests__/detourRunLock.test.js`, `api-proxy/__tests__/detourRoutes.test.js` | QA section 13 | Covered | Extra scheduler/task overlap; duplicate feed snapshots; cost from sleeping requests |
| DET-017 | Unanchored no-stop geometry | Reject rider-facing geometry segments that have no entry stop, no exit stop, no skipped route segment, and explicit empty skipped/affected stop fields. Keep any valid anchored segment in the same route document. | `api-proxy/__tests__/detourPublisher.test.js` | QA section 5 | Covered | Over-filtering older geometry that omitted stop-impact fields instead of explicitly proving none exist |
| DET-018 | Stale rider visibility | Keep stale backend detour records until normal-route GPS proof clears them. Treat `staleForReview` as operations-review metadata, not a client-side hide rule; the rider UI hides only when the backend explicitly publishes `riderVisible=false`. | `api-proxy/__tests__/staleClear.test.js`, `api-proxy/__tests__/detourPublisher.test.js`, `src/__tests__/detourVisibility.test.js`, `src/__tests__/detourService.test.js` | QA sections 2, 11, 12 | Covered, needs GPS-clear-window follow-up | Hiding a true long-running detour during a long gap if the app infers too much from stale GPS metadata |
| DET-019 | Shared physical detour event cards | When several active route documents describe the same physical closure, publish a shared event ID so the alert strip shows one event card with multiple routes. Keep route-specific detour geometry and map overlays separate. | `api-proxy/__tests__/detourPublisher.test.js`, `src/__tests__/detourEvents.test.js` | QA sections 2, 7, 9 | Covered | Over-grouping route variants that have no physical geometry, or nearby but unrelated downtown closures |
| DET-020 | Loop-route terminal trip rollover | When a loop route starts and ends at the same terminal, a bus changing GTFS trips must not clear the previous detour segment by itself. The old vehicle association should drop, but clearing still needs valid normal-route proof outside that rollover context. | `api-proxy/__tests__/detourDetector.test.js` | QA sections 10, 13, 14 | Covered | Suppressing a legitimate clear if the only available proof is the same bus immediately after a terminal rollover |
| DET-021 | Tiny-span long out-and-back geometry | Reject and do not preserve a long likely/inferred path when the identified closed span is tiny and no skipped route segment exists. | `api-proxy/__tests__/segmentValidity.test.js`, `api-proxy/__tests__/detourPublisher.test.js` | QA section 5 | Covered | Hiding geometry temporarily if a real closure cannot yet be anchored to a credible skipped segment |
| DET-022 | Geometryless stale active detour | Keep records with no trustworthy geometry backend-only with `riderVisible=false`. Do not let route-family vehicles revive them. If no affected-segment clear window exists, do not auto-clear from generic same-route normal service; wait for a recovered clear window plus GPS traversal, or an explicit operator/admin clear. | `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/staleClear.test.js`, `api-proxy/__tests__/detourPublisher.test.js` | QA sections 10, 11, 12 | Covered, policy corrected | Hiding a true detour until usable geometry appears; retaining unresolved records that need operator review |
| DET-023 | Route-scoped stop impacts | A skipped stop is not treated as globally closed when another route still serves it; the rider UI says "not served by Route X" and "still served by Route Y" where known. | `api-proxy/__tests__/detourGeometry.test.js`, `src/__tests__/stopNoticeUtils.test.js`, `src/__tests__/stopClosureMapUtils.test.js`, `src/__tests__/useAffectedStops.test.js`, `src/__tests__/detourIntegration.test.js` | QA sections 6, 7, 9 | Covered | Accidentally hiding valid arrivals or making riders think a shared stop is closed to every route |
| DET-024 | Global learned persistent geometry | Store trusted learned GPS geometry globally by physical detour fingerprint, while keeping route-specific publish and clear rules. Global geometry can seed rendering/restart recovery only after a route has already published or has a prior route persistent record. | `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/persistentDetourStore.test.js` | QA sections 2, 13, 14 | Covered | Accidentally treating global geometry as publish proof, or confusing GPS evidence time with geometry age |
| DET-025 | Rider visibility flapping | Rider-facing visibility must not toggle merely because a normal route-family vehicle appears or disappears in the current GTFS-RT snapshot. Public visibility requires the detour publish rule, including two unique same-route vehicles/trips and trustworthy geometry. | `api-proxy/__tests__/staleClear.test.js`, `api-proxy/__tests__/detourPublisher.test.js`, `src/__tests__/detourVisibility.test.js` | QA sections 2, 3, 4, 11 | Covered, needs live Route 11 recheck | Hiding a real detour if geometry is temporarily unavailable; showing a stale learned record without enough confirmation |
| DET-026 | GPS supersedes stale published path | If a route already has a rider-visible detour path but a different same-route corridor gets the normal two-bus/three-ping proof while no bus is currently on the old path, promote the newer GPS-proven path and suppress preservation of the old path. | `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/detourPublisher.test.js` | QA sections 4, 5, 9, 14 | Covered, needs live Route 11 recheck | Replacing a valid old path too aggressively if both paths are genuinely active; preserving stale road-matched geometry over newer GPS evidence |
| DET-027 | Detour path passes a skipped stop | If the final rider-facing detour path passes a regular stop, do not show that stop as skipped/closed for detour purposes. Keep only stops actually bypassed by the detour path in `skippedStops`. | `api-proxy/__tests__/detourPublisher.test.js`, `api-proxy/__tests__/stopImpacts.test.js`, `src/__tests__/useAffectedStops.test.js`, `src/__tests__/detourOverlays.test.js` | QA sections 6, 7, 9 | Covered, needs live Route 11 recheck | Over-pruning stops near the path endpoints or on nearby parallel streets |
| DET-028 | GTFS shape changed, baseline approval required | When public GTFS geometry meaningfully changes for a route, keep any active backend record but suppress rider visibility with `baseline-diverged` until a detour admin approves `POST /api/baseline/routes` for that route. Shape-ID-only churn with the same geometry should not suppress riders. | `api-proxy/__tests__/baselineDivergence.test.js`, `api-proxy/__tests__/detourPublisher.test.js`, `api-proxy/__tests__/detourWorkerColdStart.test.js` | QA sections 1, 13, 14 | Covered | Over-suppressing real detours if agency publishes a permanent change but baseline approval is delayed |
| DET-029 | Out-of-order old GPS ping arrives late | Ignore old samples as clear proof or fresh detour evidence when they are older than the latest known off-route evidence for the active detour. | `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 10, 13, 14 | Covered | Late feed delivery causing an active detour to clear from stale normal-route points |
| DET-030 | Same bus changes vehicle ID mid-trip | Do not count the same passenger trip as two unique buses just because vehicle ID changes; trip ID should remain the stronger evidence key. | Needs targeted backend coverage | QA sections 4, 12, 14 | Needs explicit scenario review | Replacement buses, block swaps, or AVL ID resets inflating unique-vehicle evidence |
| DET-031 | Missing trip IDs with unstable vehicle IDs | Avoid false confirmation if one physical bus appears under multiple changing vehicle IDs and no stable trip ID is available. | Needs feed-identity fixture | QA sections 4, 12, 14 | Needs explicit scenario review | Over-blocking legitimate no-trip-ID detections versus false positives from unstable IDs |
| DET-032 | GPS teleport / large jump | Keep the backend candidate/diagnostic evidence, but hide rider-facing geometry when the inferred path is too jumpy or sparse. | `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 4, 5, 14 | Covered | A visually convincing but physically impossible alternate path |
| DET-033 | Deadhead bus still has route ID | Do not publish a rider detour from non-revenue/deadhead movement unless there is passenger-trip confidence. | Needs GTFS-RT fixture with trip relationship/status | QA sections 4, 12, 14 | Needs explicit scenario review | Deadheads or pull-outs creating false rider detours |
| DET-034 | Parallel road within threshold | Do not treat normal service as a detour when GPS drift or nearby parallel lanes are within the configured on-route/off-route thresholds. | `api-proxy/__tests__/detourV2Detector.test.js` 40m boundary and inside-threshold parallel-road fixture | QA sections 4, 5, 14 | Covered | Still needs live calibration if real feed GPS drift consistently exceeds 40m |
| DET-035 | Detour follows another route's normal path | Publish only for the route with confirmed off-route evidence; do not infer a detour on the route whose normal path matches the detour corridor. | `api-proxy/__tests__/detourV2Detector.test.js`, `api-proxy/__tests__/detourDetector.test.js` | QA sections 4, 12, 15 | Covered | Sibling route regular service being mislabeled as detoured |
| DET-036 | Terminal pull-in / layover loop | Do not treat normal terminal pull-ins, layovers, or platform circulation as a rider detour. | Needs terminal fixture | QA sections 4, 5, 14 | Needs explicit scenario review | Terminal-only loops creating false short detours |
| DET-037 | Bus reverses/backtracks on route | Do not create a giant skipped segment from route-progress reversal, backtracking, or duplicated route passes. | `api-proxy/__tests__/detourV2Detector.test.js` reversed sparse-trace regression | QA sections 5, 10, 14 | Covered | Complex loop shapes still need live spot checks |
| DET-038 | Detour starts at first stop or ends at last stop | Clip the clear window to route shape ends and do not mark the whole route unless evidence supports it. | `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 5, 10, 14 | Covered | Whole-route false positives at terminals |
| DET-039 | Two detours close together | Keep nearby but independent closures separate when evidence shows normal travel between them; do not merge them into one over-broad segment. | Needs targeted backend coverage | QA sections 5, 10, 14 | Needs explicit scenario review | Over-merging close closures into one confusing rider alert |
| DET-040 | One long detour split by sparse GPS | Avoid splitting one true long closure into unrelated segments only because GPS samples are sparse. If path confidence is weak, suppress rider path rather than publish a misleading split. | `api-proxy/__tests__/detourV2Detector.test.js` sparse forward-trace regression | QA sections 5, 14 | Covered | Very low-frequency GPS may still require operator review before showing a rider path |
| DET-041 | Collective clear from opposite directions | Do not combine incompatible opposite-direction/shape evidence to clear a direction-specific detour window. | Needs targeted backend coverage | QA sections 10, 14, 15 | Needs explicit scenario review | Two buses in opposite directions clearing a closure neither fully proved |
| DET-042 | Route shorter than 1km | Use the full route as the clear window when the shape is shorter than the default 1km window; do not require impossible coverage. | `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 10, 14 | Covered | Short routes getting stuck because the clear window cannot fit |
| DET-043 | Shape crosses itself / loop overlap | Use progress-aware matching so the wrong pass through the same physical area does not trigger or clear a detour. | `api-proxy/__tests__/detourV2Detector.test.js`, `src/__tests__/detourRouteMasking.test.js` | QA sections 5, 10, 14 | Covered, needs live loop-route review | Self-crossing loops selecting the wrong progress point |
| DET-044 | GTFS baseline changes while active detour exists | Hide affected route detours while the GTFS change is pending; after the default 30-minute force-refresh stability check, automatically replace only changed route baselines and clear old route detour state with `baseline-auto-updated`. | `api-proxy/__tests__/baselineDivergence.test.js`, `api-proxy/__tests__/detourPublisher.test.js`, `api-proxy/__tests__/detourWorkerColdStart.test.js` | QA sections 1, 13, 14 | Covered | Auto-accepting an unstable/bad baseline, or leaving riders hidden after a stable GTFS update |
| DET-045 | Firestore write fails after segment clear | Runtime should retain the partial-clear state and retry publishing without re-showing the cleared segment. | Needs publisher failure regression | QA sections 10, 13, 14 | Needs explicit scenario review | Firestore outage causing cleared segments to reappear or route docs to drift |
| DET-046 | Worker restarts after partial segment clear | Hydration should preserve active versus cleared segments; only remaining active segments should publish after restart. | `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 10, 13, 14 | Covered | Restart rehydration reintroducing cleared segments |
| DET-047 | Official notice conflicts with GPS | GPS remains source of truth for detection, expansion, clearing, and keep-alive. Official notices may enrich only spatially overlapping GPS-confirmed detours; they do not publish, expand, clear, or keep alive detours by themselves. | `api-proxy/__tests__/newsImpactParser.test.js`, `api-proxy/__tests__/detourPublisher.test.js` | QA sections 2, 6, 9, 14 | Covered, needs live notice review | A notice map/text overriding stronger GPS evidence |
| DET-048 | Bus travels near detour path but still misses a stop | Do not reopen skipped stops unless the final trusted detour path actually serves them, with endpoint and parallel-street safeguards. | `api-proxy/__tests__/detourPublisher.test.js`, `api-proxy/__tests__/stopImpacts.test.js`, `src/__tests__/useAffectedStops.test.js`, `src/__tests__/detourOverlays.test.js` | QA sections 6, 7, 9 | Covered, needs live stop-impact recheck | Over-pruning skipped stops near endpoints or parallel streets |
| DET-049 | Short no-skipped-stop rider visibility | Keep confirmed short-span GPS detours public when geometry is safe, but show route/corridor-level messaging with no closed-stop marker, stop-specific trip warning, or affected-stop notification unless `skippedStops` is explicit. | `api-proxy/__tests__/riderVisibilityGuard.test.js`, `api-proxy/__tests__/detourV2Detector.test.js`, `api-proxy/__tests__/detourPublisher.test.js`, `src/__tests__/DetourTimeline.test.js`, `src/__tests__/tripDetourImpacts.test.js` | QA sections 2, 5, 6, 14 | Covered | Over-warning riders for boundary stops, or hiding real short GPS detours |
| DET-050 | Short location-specific detour with no closed stops | A short Route 12B-style GPS detour must not expand to nearby downstream noise, must not inherit distant official-notice stop impacts, and must validate with zero skipped stops. | `api-proxy/__tests__/detourV2Detector.test.js`, `api-proxy/__tests__/detourPublisher.test.js`, `api-proxy/__tests__/stopImpacts.test.js`, `src/__tests__/useAffectedStops.test.js`, `src/__tests__/detourGroundTruthValidator.test.js`, `docs/detour-ground-truth/route-12b-bayfield-sophia-2026-06-05.json` | QA sections 2, 5, 6, 9, 14 | Covered, needs live recheck after deploy | Candidate over-expansion or route-family notice contamination |
| DET-051 | Route 400 sparse multi-day evidence | Route 400 detours built from only sparse multi-day evidence stay backend-active but are hidden from riders unless fresh same-day or current off-route vehicle evidence reconfirms the event. | `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 4, 5, 14 | Covered, needs live Route 400 recheck after deploy | Hiding a real Route 400 detour if no current bus is available to reconfirm sparse evidence |

## Recorded issues

### DET-050A — Route 12B Bayfield/Sophia short detour expanded and inherited distant notice stops

- Date/time observed: 2026-06-05
- Environment: live Firestore/history review of `activeDetourEventsV2`
- Route(s): `12B`
- What happened: a short Bayfield/Sophia GPS-confirmed detour was published as a much larger detour and showed unrelated Saunders/Welham official-notice stop impacts.
- What should have happened: the short detour should remain public, with zero skipped stops and no boundary-stop notification; distant Route 12-family notice stops should not attach.
- Root cause:
  - candidate matching used the broad geometry cluster gap as an identity fallback, so downstream evidence could stretch a short provisional event
  - official notice stop impacts were merged by route family without a spatial overlap gate
  - some rider surfaces treated broad `affectedStops` as closure-like stop impacts
- Fix:
  - candidate expansion outside the confirmation window now requires same-signature sparse-trace continuity
  - official notice stop impacts require spatial overlap with the GPS-confirmed segment
  - boundary and served stops carry non-notifying roles; closed-stop UI is driven by `skippedStops`
  - added a reusable Route 12B ground-truth fixture
- Tests added/updated:
  - `api-proxy/__tests__/detourV2Detector.test.js`
  - `api-proxy/__tests__/detourPublisher.test.js`
  - `api-proxy/__tests__/stopImpacts.test.js`
  - `src/__tests__/useAffectedStops.test.js`
  - `src/__tests__/tripDetourImpacts.test.js`
  - `src/__tests__/DetourTimeline.test.js`
  - `src/__tests__/detourGroundTruthValidator.test.js`
- Remaining risk: needs live validation after deployment because the saved bad snapshot should continue to fail the new fixture.

### DET-026A — Route 11 bus GPS showed a different path than the currently published detour path

- Date/time observed: 2026-05-29 during Route `11` map review
- Environment: app map with active auto-detour overlay and live bus marker
- Route(s): `11`
- What happened: the app had a published detour path, but the live Route `11` bus appeared to be using a different off-route corridor.
- What should have happened: the existing path should remain visible until the alternate corridor independently meets the normal GPS publish rule. Once the alternate has at least three off-route pings and two unique same-route buses/trips, the newer GPS-proven path should replace the stale published path. Public MyRide notices should not participate in this decision.
- Classification:
  - geometry
  - publishing/history
  - lifecycle / clearing
- Fix:
  - added detector-side alternate-path supersession for stale published paths with no current vehicle on the old path
  - inherited the previous closure anchors only after the alternate corridor met the same two-bus/three-ping proof
  - marked the replacement geometry with `gpsSupersedesPreviousPath` so publisher trusted-path preservation does not reintroduce the stale likely path
- Tests added/updated:
  - `api-proxy/__tests__/detourDetector.test.js`
  - `api-proxy/__tests__/detourPublisher.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - this matrix
- Remaining risk: live Route `11` should be rechecked after deployment to confirm the alternate path replaces only after corroboration and does not hide a legitimately active older corridor.

### DET-027A — Route 11 detour path passed stops that were still marked closed

- Date/time observed: 2026-05-29 during Route `11` map review
- Environment: app map with active auto-detour overlay
- Route(s): `11`
- What happened: the detour path passed regular stops, but those stops still appeared as closed/skipped markers.
- What should have happened: if the bus detour path passes a stop, that stop should be treated as served for detour purposes and should not show as closed/skipped.
- Classification:
  - stop impact data model
  - publishing / history
  - frontend rendering
- Root cause: skipped-stop impact data could be derived from the closed regular-route segment before the final rider-facing detour path was finalized. The frontend also trusted explicit skipped-stop data without checking whether the final rendered detour path passed the stop.
- Fix:
  - publisher prunes skipped stops against the final trusted/road-matched detour path before writing Firestore
  - pruned stops are tracked as `detourPathServedStops`
  - frontend overlay and stop-impact derivation apply the same detour-path service safeguard before drawing closed markers
- Tests added/updated:
  - `api-proxy/__tests__/detourPublisher.test.js`
  - `api-proxy/__tests__/stopImpacts.test.js`
  - `src/__tests__/useAffectedStops.test.js`
  - `src/__tests__/detourOverlays.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - this matrix
- Remaining risk: live Route `11` should be rechecked after deployment to confirm nearby parallel-street stops are not incorrectly reopened.

### DET-025A — Route 11 rider visibility flapped on/off

- Date/time observed: 2026-05-25 to 2026-05-27 during Route `11` downtown detour review
- Environment: production Firestore `detourHistory`
- Route(s): `11`
- What happened: the Route `11` active detour document stayed present, but `riderVisible` toggled between true and false. The visible reason switched between `current-route-family-vehicle`, `suppressed-invalid-geometry`, and a former age-based visibility reason.
- What should have happened: Route `11` should either remain public because it meets the two-vehicle/three-ping rule with trusted geometry, or stay backend-only until it does. Ordinary route-family vehicle presence should not make an otherwise hidden detour public.
- Evidence:
  - 2026-05-25 15:13 UTC: `DETOUR_UPDATED`, `vehicleCount=2`, `riderVisible=true`, reason `current-route-family-vehicle`
  - 2026-05-25 17:10 UTC: `DETOUR_UPDATED`, `riderVisible=false`, reason `suppressed-invalid-geometry`
  - 2026-05-27 14:25 UTC: `DETOUR_UPDATED`, `riderVisible=false`, former age-based visibility reason
  - 2026-05-27 14:26 UTC: `DETOUR_UPDATED`, `riderVisible=true`, reason `current-route-family-vehicle`
- Classification:
  - lifecycle / clearing
  - publishing / history
  - frontend rendering
- Root cause: stale rider-visibility evaluation used current route-family vehicle presence as a visibility override and ran before the publisher finalized preserved/trusted geometry. This let normal Route `11` vehicle snapshots toggle public visibility independent of actual detour confirmation.
- Fix:
  - zero-confirmed records are always hidden from riders, even if route-family vehicles are reporting
  - rider visibility no longer uses route-family vehicle presence as a rider-visible override
  - publisher evaluates visibility after final geometry preservation/matching decisions
  - frontend detour visibility also requires explicit confirmed count fields to meet the two-vehicle rule
- Tests added/updated:
  - `api-proxy/__tests__/staleClear.test.js`
  - `api-proxy/__tests__/detourPublisher.test.js`
  - `src/__tests__/detourVisibility.test.js`
- Docs updated:
  - this matrix
- Remaining risk: live Route `11` should be rechecked after deployment to confirm `riderVisible` stays stable across several worker ticks.

### DET-023A — shared stop shown as closed when only some routes detour

- Date/time observed: 2026-05-26 during route-specific detour UX review
- Environment: product design and local regression coverage
- Route(s): shared stops such as Stop `192`, where one detoured route may skip the stop while Route `8` may still serve it
- What happened: a stop skipped by one detoured route could be described like a closed stop, even when another route still served the same physical stop.
- What should have happened: route-specific detour impacts should say the stop is not served by the affected route, while preserving normal service and arrivals for other routes.
- Classification:
  - frontend rendering
  - stop impact data model
  - rider communication
- Fix:
  - backend stop impacts now carry route-scoped metadata, including affected routes and still-served routes
  - frontend stop notices and map markers no longer treat route-scoped skipped stops as globally closed
  - stop sheets show friendly route chips for "Not served" and "Still served" context
- Tests added/updated:
  - `api-proxy/__tests__/detourGeometry.test.js`
  - `src/__tests__/stopNoticeUtils.test.js`
  - `src/__tests__/stopClosureMapUtils.test.js`
  - `src/__tests__/useAffectedStops.test.js`
  - `src/__tests__/detourIntegration.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - this matrix
- Remaining risk: live/manual validation should confirm the copy remains clear on small screens and that route-specific impacts align with official service notices when those are present.

### DET-011A — same-stop out-and-back path shown as a detour

- Date/time observed: 2026-05-24
- Environment: live Firestore capture during auto-detour validation
- Route(s): `12A`, `12B`; projected from shared-location route-family evidence from `8B`
- What happened: the app showed a likely detour path that travelled down Simcoe Street, looped/U-turned, and returned to the same downtown hub road area.
- What should have happened: this should not be rider-visible as a detour because no real closed route segment was identified.
- Evidence: captured active detour snapshots showed bad segments with `entryStopId === exitStopId`, `skippedStopIds` containing only that same stop, `roadMatchSource: "osrm-match"`, and `debug.routeFamilyMergeMode: "projected-shared-location"`.
- Initial classification:
  - geometry
  - route family
  - publishing/history
- Root cause: route-family/shared-location projection accepted a same-stop, single-stop segment as a valid closure. The road matcher then produced a high-confidence out-and-back path, but the backend had no validity gate to reject the segment as a non-closure before publishing or preserving the path.
- Fix:
  - reject same-stop, single-stop non-closure segments after stop-impact enrichment
  - apply the same filter before publishing top-level geometry
  - do not preserve a previously trusted likely path from a same-stop non-closure segment
  - filter preserved previous segments too, so old Firestore geometry cannot reintroduce a rejected self-loop during trusted-path preservation
  - force a geometry rewrite when the previous Firestore snapshot contains a rejected self-loop, even inside the normal geometry write throttle window
- Tests added/updated:
  - `api-proxy/__tests__/detourGeometry.test.js`
  - `api-proxy/__tests__/detourPublisher.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - `AUTO-DETOUR-QA-CHECKLIST.md`
  - this matrix
- Remaining risk: similar false positives could still occur if entry and exit stops differ but the inferred path is still a short terminal loop. Watch for future cases where the affected segment is very short, terminal-only, or hub-only but not technically the same stop ID.

### DET-015A — Route 10 short downtown movement not detected

- Date/time observed: 2026-05-24 around 2:00 PM ET
- Environment: live production validation
- Route(s): `10`
- Vehicle/trip IDs, if known: vehicle `02155a60-ef99-420b-a797-6217f8c979cf`, trip `f493d53c-1ba7-4006-aa04-c9c7ca5f5df7`
- What happened: the map showed Route 10 appearing to leave the expected path briefly near Downtown/Simcoe, but no Route 10 auto-detour was published.
- What should have happened: if the off-route movement was visible in GTFS-RT for at least one sample, it should have been retained as backend candidate evidence. It should still require at least three matching off-route pings and two unique same-route trips/vehicles before rider-facing publication.
- Evidence:
  - activeDetours doc: no `activeDetours/10`
  - detourHistory event: no current Route 10 event; latest Route 10 events were from May 15, 2026
  - runtime state: Route 10 vehicle existed, but stored samples available at review time were classified on-route
  - screenshot/video: app screenshot showed Route 10 marker near the downtown area
- Initial classification:
  - detection threshold
  - scheduler/sample cadence
  - baseline/operations
- Root cause: not proven from stored evidence because the backend did not retain per-sample projection diagnostics at the time. The most likely failure mode is that the short off-route portion happened between scheduled one-minute samples, or that only on-route samples were retained after the fact. The detector also waited for the same bus to return on-route before recording short-deviation candidate evidence, which could lose one-sample deviations.
- Fix:
  - record global short-deviation candidate evidence as soon as a first off-route point is seen
  - keep the three-off-route-ping plus two-unique-trip/vehicle confirmation before rider-facing publication; the three pings can be split across matching trips
  - persist latest per-vehicle route projection diagnostics in runtime state and route debug output
- Tests added/updated:
  - `api-proxy/__tests__/detourDetector.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - `AUTO-DETOUR-QA-CHECKLIST.md`
  - this matrix
- Remaining risk: if a bus is on-route at both sampled points and completes an unsampled off-route movement between them, the detector still cannot prove the detour from GTFS-RT alone. Higher-frequency sampling or a faster GTFS-RT feed is needed for those cases.


### DET-017A — unanchored no-stop path shown as a detour segment

- Date/time observed: 2026-05-25 around 9:50-10:08 AM ET
- Environment: live Firestore capture during auto-detour validation
- Route(s): `12B`, with similar active-detour risk patterns on routes with no affected/skipped stops
- What happened: a route document could contain a road-matched detour segment with `entryStopId: null`, `exitStopId: null`, `skippedStopIds: []`, and `affectedStopIds: []`. In the Route 12B review, one valid Hooper segment existed, but a second unanchored Bayfield/Sophia segment had no closed route section or affected stops.
- What should have happened: the backend should remove the unanchored no-stop segment before publishing rider-facing geometry. If another segment in the same document is valid and anchored, that valid segment should remain visible.
- Evidence:
  - activeDetours review: 10 active routes were captured in `logs/detour-review-20260525/active-analysis.json`
  - activeDetours doc: Route `12B` included two segments; the suspect segment had no entry/exit stops and no stop impacts
  - screenshot/video: app map showed a short road-matched path that did not identify any closed route segment
- Initial classification:
  - geometry
  - publishing/history
  - frontend rendering
- Root cause: the publisher trust gate filtered same-stop non-closures but still accepted segments that explicitly had no anchors and no stop impacts. Road matching can make those unanchored segments look plausible even though they do not describe a detoured-from route section.
- Fix:
  - reject segments with no entry stop, no exit stop, and explicit empty skipped/affected stop fields
  - apply the rejection through the same geometry/publisher filtering path used for same-stop non-closures
  - keep anchored valid sibling segments when only one segment in a multi-segment route document is invalid
- Tests added/updated:
  - `api-proxy/__tests__/detourPublisher.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - `AUTO-DETOUR-QA-CHECKLIST.md`
  - this matrix
- Remaining risk: active route documents with zero current vehicles can remain visible by design until normal-route GPS traversal proves clearing. That lifecycle question is separate from this geometry-publication fix and should be handled with lifecycle regression coverage, not by hiding valid geometry.


### DET-018A — zero-current detours stayed rider-visible too long

- Date/time observed: 2026-05-25 around 9:50-10:08 AM ET
- Environment: live Firestore capture during auto-detour validation
- Route(s): `7A`, `7B`, `10`, `12A`, `12B`, `100`, and similar active records
- What happened: active backend detour records with `currentVehicleCount: 0` and old evidence could remain visible to riders as active detours.
- Current policy: the backend record should remain until normal-route GPS proof clears it. Time alone must not hide a confirmed, renderable detour. Zero-confirmed, insufficient-geometry, or invalid-geometry records can be hidden for safety.
- Evidence:
  - activeDetours review: captured in `logs/detour-review-20260525/active-analysis.json`
  - examples included old `lastEvidenceAt`, zero current detour vehicles, and in some cases zero confirmed vehicle counts
- Initial classification:
  - lifecycle / clearing
  - publishing/history
  - frontend rendering
- Root cause: lifecycle monitoring correctly avoided backend deletion without GPS clear proof, but there was no separate rider-visibility field to distinguish “active for backend review” from “safe to show riders.”
- Fix:
  - removed the time-based rider visibility threshold
  - suppresses rider visibility for zero-confirmed and insufficient/unsafe-geometry records
  - keeps renderable confirmed records visible until GPS clear proof exists
  - suppresses zero-confirmed-vehicle active records from rider UI
  - publishes `riderVisible`, `riderVisibilityReason`, and `staleForReview`
  - client filters detours with `riderVisible: false`
- Tests added/updated:
  - `api-proxy/__tests__/staleClear.test.js`
  - `api-proxy/__tests__/detourPublisher.test.js`
  - `src/__tests__/detourVisibility.test.js`
  - `src/__tests__/detourService.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - `AUTO-DETOUR-QA-CHECKLIST.md`
  - this matrix
- Remaining risk: active docs can remain visible longer than desired until a bus provides normal-route GPS traversal proof through the affected segment. Planned/manual notices can support rider messaging and operations review, but they are not a clear rule.


### DET-018B — route-family vehicles kept stale Mulcaster/Simcoe detours visible

- Date/time observed: 2026-05-26 around 9:30 AM ET
- Environment: live Firestore capture during active Mulcaster/Simcoe detour review
- Route(s): `10`, `11`, `101`; `100` had no active record at review time
- What happened: old downtown detour documents from 2026-05-25 stayed rider-visible because a current route-family vehicle elsewhere could satisfy the rider-visibility check.
- What should have happened: the system should distinguish “old nightly detour no longer active” from “valid construction detour between vehicle observations” using GPS evidence. Without normal-route GPS traversal proof, `staleForReview` should not be treated as a client-side hide rule or a backend clear rule.
- Evidence:
  - active `10`, `11`, and `101` documents had `staleForReview: true`, `currentVehicleCount: 0`, and old `updatedAt`/evidence timestamps
  - `10` stayed visible with `riderVisibilityReason: current-route-family-vehicle`
  - official MyRide news described the Mulcaster/Simcoe paving detour as nightly between 8 PM and 7 AM
- Classification:
  - lifecycle / clearing
  - frontend rendering
- Fix status:
  - removed the over-aggressive time-based hide rule after it hid valid Route 12A/12B Hooper detours
  - client now hides only explicit backend suppression, not `staleForReview` alone
  - renderable confirmed detours no longer depend on a current route-family vehicle to stay visible
  - geometryless/invalid-geometry records are no longer revived by route-family vehicles for rider visibility
  - time and headway metadata must not clear or hide records without GPS proof
  - follow-up still needed: improve GPS-based clear-window recovery for records with missing geometry
- Tests added/updated:
  - `api-proxy/__tests__/staleClear.test.js`
  - `api-proxy/__tests__/detourDetector.test.js`
  - `src/__tests__/detourVisibility.test.js`
- Remaining risk: old downtown nightly records may remain visible until a bus provides normal-route GPS traversal proof through the affected segment.


### DET-018C — stale suppression hid valid Hooper Route 12A/12B detours

- Date/time observed: 2026-05-26 after stale-visibility regression fix
- Environment: local app against live `activeDetours`
- Route(s): `12A`, `12B`
- What happened: the app hid all old zero-current detours, including valid active Hooper detours.
- What should have happened: valid active construction detours should remain visible between vehicle observations. Old GPS metadata is not enough to prove a detour is inactive.
- Root cause: client-side defensive filtering used `staleForReview`, stale age, and vehicle counts as a hide rule instead of relying on backend/source-of-truth visibility.
- Fix:
  - app now treats `staleForReview` as review metadata only
  - app still honors explicit `riderVisible: false` and explicit `zero-confirmed-vehicle-count`
  - backend keeps renderable confirmed detours visible with `riderVisibilityReason: gps-clear-required`
  - publisher deletion is gated on prior `clearReason: normal-route-observed`, so route absence or staleness cannot clear Hooper-style records by itself
  - backend visibility behavior now ignores elapsed time, route-family activity, and planned/manual notices as clear/hide proof
- Tests added/updated:
  - `src/__tests__/detourVisibility.test.js`
  - `api-proxy/__tests__/staleClear.test.js`
  - `api-proxy/__tests__/detourPublisher.test.js`
  - `api-proxy/__tests__/detourIntegration.test.js`
- Remaining risk: old downtown nightly records may remain visible until the system observes normal-route GPS traversal through the affected segment.


### DET-012A — trusted inferred detour path hidden when road matching was absent

- Date/time observed: 2026-05-26 during active Mulcaster/Simcoe detour review
- Environment: live Firestore capture plus app overlay regression tests
- Route(s): `10`, `101`
- What happened: documents could have `canShowDetourPath: true` and a trusted `inferredDetourPolyline`, but no road-matched `likelyDetourPolyline`; the app still hid the alternate path.
- What should have happened: when the backend explicitly marks the detour path as safe to show, the app may draw the inferred path if no likely path exists.
- Classification:
  - frontend rendering
  - geometry confidence
- Fix:
  - overlay rendering now uses `likelyDetourPolyline` first, then trusted `inferredDetourPolyline` when `canShowDetourPath: true`
  - segment-scoped overlays no longer fall back to a stale top-level likely path when a trusted segment path exists
- Tests added/updated:
  - `src/__tests__/detourOverlays.test.js`
  - `src/__tests__/detourIntegration.test.js`
- Remaining risk: inferred geometry is less polished than road-matched geometry; backend should still prefer likely paths when road matching succeeds.


### DET-012B — Route 10 loop route drew duplicate frontend lines

- Date/time observed: 2026-05-26 during active Mulcaster/Simcoe detour review
- Environment: app screenshot plus local route-masking regression test
- Route(s): `10`
- What happened: after the alternate path began rendering, the frontend still drew extra regular route linework through/near the active detour area.
- What should have happened: the normal route shape should be masked where the active closed section or alternate detour path is already rendered.
- Classification:
  - frontend rendering
- Root cause: Route 10 is a loop shape that starts and ends at the Downtown Hub. The route masking projected the terminal endpoint to the first matching point, so it could mask the wrong side of the loop and leave the affected tail visible. It also only masked closed-route geometry, not the active alternate path.
- Fix:
  - route masking is now loop-aware when a route starts and ends at the same terminal
  - route masking also removes the base route line between active detour path endpoints
- Tests added/updated:
  - `src/__tests__/detourRouteMasking.test.js`
- Remaining risk: still needs a final native/web visual check because map renderer z-order and line offsets can create device-specific clutter.

### DET-012C — regular map tab stopped showing lightweight active detours

- Date/time observed: 2026-06-05
- Environment: local app regression review after route layer ordering fix
- Route(s): `12A`, `12B`
- What happened: active Route 12 Hooper/Huber-style detour geometry was hidden on the regular map tab and only visible in the detour tab.
- What should have happened: active detours should remain visible on the regular map as lightweight geometry, with stronger labels, stop markers, and callouts reserved for detour view.
- Root cause: the regular-mode geometry gate was changed to render only in detour/focus mode, overriding the existing lightweight overlay behavior.
- Fix:
  - restored regular-mode detour geometry rendering
  - kept regular-mode detail styling lightweight through `getDetourGeometryOverlayProps`
- Tests added/updated:
  - `src/__tests__/detourViewMode.test.js`
- Remaining risk: native/web visual z-order still needs spot checks when route layer ordering changes.


### DET-009A — Mulcaster/Simcoe alternate paths zigzagged between repeated trips

- Date/time observed: 2026-05-26 during active Route 11 review
- Environment: live Firestore/runtime-state capture during Mulcaster/Simcoe validation
- Route(s): `10`, `11`, `101`
- What happened: the alternate detour path was drawn back and forth across the same downtown detour corridor instead of as one continuous path.
- What should have happened: the backend should publish one representative continuous detour trace and avoid anchoring it to a stale far exit candidate.
- Evidence:
  - Route `11` selected vehicle `70ae2e3e...` had 13 learned points across 4 trips over about 242 minutes
  - Route `11` live path was about 1,884m compared with an operator-supplied path around 450m
  - Routes `10` and `101` showed the same repeated-trip stitching pattern
- Classification:
  - geometry confidence
  - publishing/history
- Root cause: representative path selection grouped points by vehicle ID only. When the same bus repeated the same detour over multiple trips, the backend stitched separate trips into one path. Exit-anchor selection could also keep an older farther rejoin candidate instead of the candidate closest to the selected representative trace.
- Fix:
  - split representative path candidates on trip changes, large time gaps, and route-progress reversals
  - prefer an exit boundary near the selected representative path end when it is materially closer than the stale candidate
  - do not preserve an older much-longer backtracking likely path when new trusted geometry is cleaner
- Tests added/updated:
  - `api-proxy/__tests__/detourGeometry.test.js`
- Remaining risk: active Firestore records with preserved older likely paths need a backend republish/run-once after deployment so stale geometry is replaced.


### DET-019A — same downtown closure showed as multiple event cards

- Date/time observed: 2026-05-25 around 2:30 PM ET
- Environment: live production validation
- Route(s): `10`, `11`, `101` and related downtown routes when active
- What happened: route documents for the same downtown closure produced multiple alert-strip event cards because each route had its own route-specific detour event ID.
- What should have happened: the rider-facing event card should group aligned detours into one physical detour event with multiple route chips, while the map keeps separate route overlays.
- Evidence:
  - activeDetours docs showed overlapping skipped/likely paths for `10`, `11`, and `101`
  - app screenshot showed separate cards for the same downtown closure path
- Initial classification:
  - publishing/history
  - frontend rendering
- Root cause: backend event IDs were route/segment specific and did not publish a shared physical-event grouping field for the client to trust.
- Fix:
  - publish `sharedDetourEventId`, `sharedRouteIds`, `eventPrimaryRouteId`, `eventRouteCount`, `eventLocationLabel`, and `eventConfidence`
  - annotate segments with the same shared event metadata when geometry is written
  - group frontend event cards by `sharedDetourEventId` before route-specific `detourEventId`
  - keep routes without physical event geometry as singleton events so route-family variants are not grouped by name alone
- Tests added/updated:
  - `api-proxy/__tests__/detourPublisher.test.js`
  - `src/__tests__/detourEvents.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - `AUTO-DETOUR-QA-CHECKLIST.md`
  - this matrix
- Remaining risk: two nearby downtown closures with overlapping road names could be over-grouped if their geometry overlaps within the same corridor. Watch `sharedRouteIds`, `eventLocationLabel`, and map overlays during live validation.

### DET-020A — Route 100 cleared at Downtown Hub trip rollover

- Date/time observed: 2026-05-25 around 2:00 PM ET
- Environment: live production validation and local regression test
- Route(s): `100`
- What happened: Route 100 was detected, then cleared, while routes using the same downtown detour path remained active. Recent Route 100 geometry/logs showed terminal-loop symptoms, including same/near-same entry and exit context around Downtown Hub.
- What should have happened: the same bus starting its next Route 100 trip at Downtown Hub should not by itself prove that the previous detour segment cleared.
- Evidence:
  - `activeDetours/100`: absent after clear
  - detourHistory: Route 100 detected at 8:14 AM and 8:59 AM ET, then cleared at 8:49 AM and 10:39 AM ET
  - GTFS: Route 100 trips start and end at Downtown Hub on a closed loop shape
- Initial classification:
  - lifecycle / clearing
  - persistence / restart
  - baseline/operations
- Root cause: vehicle clear-tracking did not distinguish a same-bus GTFS trip rollover from same-trip normal-route traversal proof.
- Fix:
  - on same-route trip ID changes, drop the old detour vehicle association
  - suppress clear proof from that same bus for the previous detour segment during the new trip
  - persist the rollover suppression in detector runtime state
- Tests added/updated:
  - `api-proxy/__tests__/detourDetector.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - this matrix
- Remaining risk: if the same bus after rollover is genuinely the only normal-route clear proof, the backend may keep the detour active until another bus or later valid evidence confirms clearing.

### DET-021A — Route 101 kept a looped out-and-back likely path

- Date/time observed: 2026-05-25 around 2:20 PM ET
- Environment: live production validation
- Route(s): `101`
- What happened: Route 101 still showed a likely detour path that went out and back to the same downtown area, even though the actual closure was much longer and the previous segment span was only about 79m.
- What should have happened: the backend should suppress that likely/inferred path until it has a credible downstream rejoin and skipped route segment, and it should not preserve the old bad path from Firestore.
- Evidence:
  - activeDetours doc: `segments[0].spanMeters` about 79m, no segment `skippedSegmentPolyline`, and a roughly 800m likely/inferred path
  - screenshot/video: app map showed the Route 101 path leaving and returning to nearly the same spot
- Initial classification:
  - geometry
  - publishing/history
- Root cause: the geometry builder can now suppress tiny-span long-path candidates, but the publisher trust gate still treated the older Firestore segment as preserveable trusted geometry.
- Fix:
  - reject segments that have no skipped route segment, a tiny closed span, and a much longer likely/inferred path
  - apply that rejection before publishing and before preserving previous trusted geometry
- Tests added/updated:
  - `api-proxy/__tests__/segmentValidity.test.js`
  - `api-proxy/__tests__/detourPublisher.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - `AUTO-DETOUR-QA-CHECKLIST.md`
  - this matrix
- Remaining risk: if live evidence is still too sparse to identify the downstream rejoin, Route 101 may temporarily show the active detour without a likely path instead of showing the wrong path.

## Status definitions

- **Covered** — automated coverage exists and the manual checklist has a matching validation path.
- **Partially covered** — logic is tested, but visual/device/manual validation still matters.
- **Needs explicit scenario review** — behavior exists, but it deserves a dedicated regression case before launch.
- **Blocked** — expected behavior is known, but implementation or validation is missing.

## Issue capture template

Add a short entry under the appropriate scenario row, or create a new row if the issue is a new class of failure.

```md
### Issue: short title

- Date/time observed:
- Environment: local / staging / production
- Route(s):
- Vehicle/trip IDs, if known:
- What happened:
- What should have happened:
- Evidence:
  - activeDetours doc:
  - detourHistory event:
  - /api/detour-debug or /api/detour-status:
  - screenshot/video:
- Initial classification:
  - detection
  - geometry
  - clearing
  - route family
  - publishing/history
  - frontend rendering
  - baseline/operations
- Root cause:
- Fix:
- Tests added/updated:
- Docs updated:
- Remaining risk:
```

## Change-control checklist

Before closing any meaningful auto-detour change:

- [ ] The scenario matrix row is updated or a new row is added.
- [ ] Expected behavior is documented in `AUTO-DETOUR-DETECTION.md` if behavior changed.
- [ ] Manual validation is documented in `AUTO-DETOUR-QA-CHECKLIST.md` if QA changed.
- [ ] Automated tests were added or intentionally skipped with a reason.
- [ ] Existing related scenarios were checked for regressions.
- [ ] Firestore fields or operational requirements were documented if they changed.
- [ ] Remaining risk is written down plainly.

## Root-cause categories

Use these labels consistently so repeated patterns are easy to spot:

- **Detection threshold** — off-route/on-route thresholds, consecutive readings, candidate confirmation.
- **Geometry confidence** — entry/exit anchors, skipped segment, inferred path, road matching.
- **Route-family mapping** — sibling route projection, branch variants, opposite directions.
- **Lifecycle / clearing** — active, clear-pending, cleared, stale monitoring, service-hours behavior.
- **Persistence / restart** — runtime state, persistent learned detours, Firestore hydration.
- **Publishing / history** — activeDetours schema, detourHistory events, write throttling.
- **Frontend rendering** — map overlays, banner, details sheet, tab switching, safe-area layout.
- **Baseline / operations** — trusted baseline, scheduler mode, auth, deployment environment.

## Launch-quality rule

Do not treat a detector fix as launch-ready just because the immediate symptom is gone.

It is launch-ready only when:

- the scenario is repeatable,
- expected behavior is clear,
- regression coverage exists where practical,
- rider-facing risk is understood,
- and the relevant docs were updated.

### DET-016A — true 30-second sampling without request sleeping

- Date/time reviewed: 2026-05-24 around 3:00 PM ET
- Environment: live production feed measurement and backend implementation
- What happened: live GTFS-RT polling every 15 seconds showed the feed usually changed every other poll, with full-feed timestamp jumps around 28-34 seconds.
- What should happen: the detector should be able to sample at about 30-second cadence without using route-specific rules or holding a Cloud Run request open for the wait period.
- Root cause / design finding: Cloud Scheduler is minute-based, so it cannot directly schedule `:00` and `:30` runs. Burst sampling works but bills the waiting time inside the request.
- Fix: primary scheduler runs once per minute and enqueues a Cloud Task delayed by 30 seconds. The delayed task calls the same run-once endpoint with `source=offset-30s`. A Firestore distributed lock prevents overlap across Cloud Run instances.
- Verification: added backend tests for delayed task enqueue, offset-source handling, and distributed lock skip behavior.
- Remaining risk: if MyRide publishes duplicate snapshots at the half-minute mark, duplicate-vehicle freshness filtering should skip them; monitor duplicate rate after deployment.

