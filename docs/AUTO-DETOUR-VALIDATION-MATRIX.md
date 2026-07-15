# Auto-Detour Validation Matrix

Status: Current as of 2026-07-14

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
| DET-002 | Likely path confidence gate | Keep a confirmed alert active, but hide the rider-facing likely path and uncertain stops until trusted entry/exit and corridor evidence exist. | `api-proxy/__tests__/alertVisibility.test.js`, `api-proxy/__tests__/detourGeometry.test.js`, `src/__tests__/detourVisibility.test.js`, `src/__tests__/detourOverlays.test.js` | QA sections 5, 6, 7 | Covered | Sparse evidence producing a convincing but wrong purple path |
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
| DET-018 | Stale rider visibility | Keep confirmed active alerts public until normal-route GPS proof or operator action clears them. Treat `staleForReview` and stale-mixed evidence as detail-safety metadata: they may hide paths and stops but not the alert. | `api-proxy/__tests__/alertVisibility.test.js`, `api-proxy/__tests__/staleClear.test.js`, `api-proxy/__tests__/detourPublisher.test.js`, `src/__tests__/detourVisibility.test.js`, `src/__tests__/detourService.test.js` | QA sections 2, 11, 12 | Covered, needs live deployment check | Alert-only records must not accidentally restore unsafe geometry |
| DET-019 | Shared physical detour event cards | When several active route documents describe the same physical closure, publish a shared event ID so the alert strip shows one event card with multiple routes. Keep route-specific detour geometry and map overlays separate. | `api-proxy/__tests__/detourPublisher.test.js`, `src/__tests__/detourEvents.test.js` | QA sections 2, 7, 9 | Covered | Over-grouping route variants that have no physical geometry, or nearby but unrelated downtown closures |
| DET-020 | Loop-route terminal trip rollover | When a loop route starts and ends at the same terminal, a bus changing GTFS trips must not clear the previous detour segment by itself. The old vehicle association should drop, but clearing still needs valid normal-route proof outside that rollover context. | `api-proxy/__tests__/detourDetector.test.js` | QA sections 10, 13, 14 | Covered | Suppressing a legitimate clear if the only available proof is the same bus immediately after a terminal rollover |
| DET-021 | Tiny-span long out-and-back geometry | Reject and do not preserve a long likely/inferred path when the identified closed span is tiny and no skipped route segment exists. | `api-proxy/__tests__/segmentValidity.test.js`, `api-proxy/__tests__/detourPublisher.test.js` | QA section 5 | Covered | Hiding geometry temporarily if a real closure cannot yet be anchored to a credible skipped segment |
| DET-022 | Geometryless stale active detour | Keep confirmed alerts public with `alertVisible=true` while geometry stays suppressed with `riderVisible=false`. Do not infer stops or a path, and do not auto-clear from generic normal service; wait for affected-segment traversal or operator action. | `api-proxy/__tests__/alertVisibility.test.js`, `api-proxy/__tests__/staleClear.test.js`, `api-proxy/__tests__/detourPublisher.test.js`, `src/__tests__/detourService.test.js` | QA sections 10, 11, 12 | Covered, policy corrected | Alert-only records must be clearly worded and must not restore uncertain details |
| DET-023 | Route-scoped stop impacts | A skipped stop is not treated as globally closed when another route still serves it; the rider UI says "not served by Route X" and "still served by Route Y" where known. | `api-proxy/__tests__/detourGeometry.test.js`, `src/__tests__/stopNoticeUtils.test.js`, `src/__tests__/stopClosureMapUtils.test.js`, `src/__tests__/useAffectedStops.test.js`, `src/__tests__/detourIntegration.test.js` | QA sections 6, 7, 9 | Covered | Accidentally hiding valid arrivals or making riders think a shared stop is closed to every route |
| DET-024 | Global learned persistent geometry | Store trusted learned GPS geometry globally by physical detour fingerprint, while keeping route-specific publish and clear rules. Global geometry can seed rendering/restart recovery only after a route has already published or has a prior route persistent record. | `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/persistentDetourStore.test.js` | QA sections 2, 13, 14 | Covered | Accidentally treating global geometry as publish proof, or confusing GPS evidence time with geometry age |
| DET-025 | Rider visibility flapping | Rider-facing visibility must not toggle merely because a vehicle enters or leaves the current GTFS-RT snapshot. Public visibility still requires the normal evidence and geometry gates. Once a configured, road-matched, or sufficiently dense GPS path is trusted and public, keep its last trusted geometry visible between buses until normal-route GPS clears it or new evidence proves the geometry unsafe. | `api-proxy/__tests__/staleClear.test.js`, `api-proxy/__tests__/detourPublisher.test.js`, `api-proxy/__tests__/detourV2Detector.test.js`, `src/__tests__/detourVisibility.test.js` | QA sections 2, 3, 4, 11 | Covered, needs live Route 8B/15B recheck after deploy | Preserving a weak mixed path versus hiding a real detour every time the confirming bus leaves the corridor |
| DET-026 | GPS supersedes stale published path | If a route already has a rider-visible detour path but a different same-route corridor gets the normal two-bus/three-ping proof while no bus is currently on the old path, promote the newer GPS-proven path and suppress preservation of the old path. | `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/detourPublisher.test.js` | QA sections 4, 5, 9, 14 | Covered, needs live Route 11 recheck | Replacing a valid old path too aggressively if both paths are genuinely active; preserving stale road-matched geometry over newer GPS evidence |
| DET-027 | Detour path passes a skipped stop | If the final rider-facing detour path passes a regular stop, do not show that stop as skipped/closed for detour purposes. Keep only stops actually bypassed by the detour path in `skippedStops`. | `api-proxy/__tests__/detourPublisher.test.js`, `api-proxy/__tests__/stopImpacts.test.js`, `src/__tests__/useAffectedStops.test.js`, `src/__tests__/detourOverlays.test.js` | QA sections 6, 7, 9 | Covered, needs live Route 11 recheck | Over-pruning stops near the path endpoints or on nearby parallel streets |
| DET-028 | GTFS shape changed, baseline approval required | When public GTFS geometry meaningfully changes for a route, keep any active backend record but suppress rider visibility with `baseline-diverged` until a detour admin approves `POST /api/baseline/routes` for that route. Shape-ID-only churn with the same geometry should not suppress riders. | `api-proxy/__tests__/baselineDivergence.test.js`, `api-proxy/__tests__/detourPublisher.test.js`, `api-proxy/__tests__/detourWorkerColdStart.test.js` | QA sections 1, 13, 14 | Covered | Over-suppressing real detours if agency publishes a permanent change but baseline approval is delayed |
| DET-029 | Out-of-order old GPS ping arrives late | Ignore old samples as clear proof or fresh detour evidence when they are older than the latest known off-route evidence for the active detour. | `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 10, 13, 14 | Covered | Late feed delivery causing an active detour to clear from stale normal-route points |
| DET-030 | Same bus changes vehicle ID mid-trip | Do not count the same passenger trip as two unique buses just because vehicle ID changes; trip ID should remain the stronger evidence key. | `api-proxy/__tests__/detourCandidateMemory.test.js`, `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 4, 12, 14 | Covered | Replacement buses, block swaps, or AVL ID resets without stable trip IDs still need live feed review |
| DET-031 | Missing trip IDs with unstable vehicle IDs | Avoid false confirmation if one physical bus appears under multiple changing vehicle IDs and no stable trip ID is available. Vehicle-only evidence can be retained, but one-point unstable IDs do not count as confirming identities. | `api-proxy/__tests__/detourCandidateMemory.test.js`, `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 4, 12, 14 | Covered, needs live feed validation | Over-blocking legitimate no-trip-ID detections versus false positives from unstable IDs |
| DET-032 | GPS teleport / large jump | Keep the backend candidate/diagnostic evidence, but hide rider-facing geometry when the inferred path is too jumpy or sparse. | `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 4, 5, 14 | Covered | A visually convincing but physically impossible alternate path |
| DET-033 | Deadhead bus still has route ID | Do not publish a rider detour from explicit non-revenue/deadhead movement, or cancelled/deleted GTFS-RT trip descriptors, unless there is passenger-trip confidence. | `api-proxy/__tests__/detourDetector.test.js`, `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 4, 12, 14 | Covered, needs live feed validation | Deadheads or pull-outs that are not flagged by the feed can still look like weak vehicle-only evidence |
| DET-034 | Parallel road within threshold | Do not treat normal service as a detour when GPS drift or nearby parallel lanes are within the configured on-route/off-route thresholds. | `api-proxy/__tests__/detourV2Detector.test.js` 40m boundary and inside-threshold parallel-road fixture | QA sections 4, 5, 14 | Covered | Still needs live calibration if real feed GPS drift consistently exceeds 40m |
| DET-035 | Detour follows another route's normal path | Publish only for the route with confirmed off-route evidence; do not infer a detour on the route whose normal path matches the detour corridor. | `api-proxy/__tests__/detourV2Detector.test.js`, `api-proxy/__tests__/detourDetector.test.js` | QA sections 4, 12, 15 | Covered | Sibling route regular service being mislabeled as detoured |
| DET-036 | Terminal pull-in / layover loop | Do not treat normal terminal pull-ins, layovers, or platform circulation as a rider detour. | Needs terminal fixture | QA sections 4, 5, 14 | Needs explicit scenario review | Terminal-only loops creating false short detours |
| DET-037 | Bus reverses/backtracks on route | Do not create a giant skipped segment from route-progress reversal, backtracking, or duplicated route passes. | `api-proxy/__tests__/detourV2Detector.test.js` reversed sparse-trace regression | QA sections 5, 10, 14 | Covered | Complex loop shapes still need live spot checks |
| DET-038 | Detour starts at first stop or ends at last stop | Clip the clear window to route shape ends and do not mark the whole route unless evidence supports it. | `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 5, 10, 14 | Covered | Whole-route false positives at terminals |
| DET-039 | Two detours close together | Keep nearby but independent closures separate when evidence shows normal travel between them; do not merge them into one over-broad segment. | Needs targeted backend coverage | QA sections 5, 10, 14 | Needs explicit scenario review | Over-merging close closures into one confusing rider alert |
| DET-040 | One long detour split by sparse GPS | Avoid splitting one true long closure into unrelated segments only because GPS samples are sparse. If path confidence is weak, suppress rider path rather than publish a misleading split. | `api-proxy/__tests__/detourV2Detector.test.js` sparse forward-trace regression | QA sections 5, 14 | Covered | Very low-frequency GPS may still require operator review before showing a rider path |
| DET-041 | Collective clear from opposite directions | Do not combine incompatible opposite-direction/shape evidence to clear a direction-specific detour window. Individual and collective clear tracks must make forward progress on the trip shape; small GPS reversals are tolerated, but material backtracking starts a new proof run. | `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 10, 14, 15 | Covered | Complex loop shapes and shape reprojection still need live spot checks |
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
| DET-052 | Public publish-gate explanations | Every active detour write includes backend-generated `riderPublishGates` explaining the public gates for detour evidence, rider alert visibility, likely path visibility, skipped-stop visibility, and normal-route GPS clear proof. These gates are explanatory metadata; they must not replace the existing backend-owned public fields. | `api-proxy/__tests__/riderPublishGates.test.js`, `api-proxy/__tests__/detourPublisher.test.js` | QA section 2 | Covered | Operators misreading hidden detours without knowing whether the block is evidence, geometry, skipped-stop, or clear-proof related |
| DET-053 | Detour path overlaps closed route segment | If the road-matched or preserved alternate path materially overlaps the skipped/closed segment, suppress that alternate path at both segment and top-level fields. The client must honor segment-level `canShowDetourPath=false` and must not fall back to stale top-level path geometry. | `api-proxy/__tests__/detourRoadMatcher.test.js`, `api-proxy/__tests__/detourPublisher.test.js`, `src/__tests__/detourOverlays.test.js` | QA sections 5, 9, 14 | Covered, needs live Route 12A recheck after deploy | Hiding a valid very-short shared-road handoff versus showing riders a path over the closed road |
| DET-054 | Operator-confirmed corridor across fragmented route variants | When an operator confirms an active unplanned corridor, the detector can coalesce fragmented same-route candidate windows into one configured-corridor event per affected route/direction. Configured corridor geometry may draw an explicit operator path instead of noisy raw GPS, must not use broad OSRM route fallback, and old rider-visible event-window paths in the same area should be superseded. | `api-proxy/__tests__/detourV2Detector.test.js`, `api-proxy/__tests__/detourRoadMatcher.test.js`, `api-proxy/__tests__/detourPublisher.test.js`, `api-proxy/__tests__/detourRouteConfig.test.js` | QA sections 4, 5, 9, 14, 15 | Covered, needs live Route 8A/8B recheck after deploy | A mis-calibrated temporary corridor could hide a true alternate, or stale road-matched geometry could remain visible beside the corrected corridor |
| DET-055 | Deterministic production quality scoring | Score labelled positive/negative cases separately from path, stop-impact, safety-replay, and duplicate-publication quality. Short-lived clears must not count as confirmed false positives. | `src/__tests__/detourQualityScorer.test.js`, `api-proxy/__tests__/detourOps.test.js`, `npm run score:detour-quality` | QA sections 4, 5, 14 | Covered, corpus expansion required | A perfect score from too few or only positive cases overstating production accuracy |
| DET-056 | Legacy/event-window duplicate publication | When the current detector event and an absent legacy/event-window record describe the same route, shape, and progress window, keep the current event and delete the duplicate with an auditable supersede reason. Do not merge separate corridors. | `api-proxy/__tests__/detourPublisher.test.js`, `src/__tests__/detourQualityScorer.test.js` | QA sections 2, 7, 9, 14 | Covered, needs live cleanup verification | Duplicate cards/overlays surviving migration, or an overly broad cleanup deleting a separate closure |
| DET-057 | Focused detour map clarity | In focused detour view, the map should clearly separate the closed regular segment, the open detour path, affected stops, and live buses without clipped labels or overlapping callouts. The camera fit must account for top banners and bottom navigation. | Needs focused native/web visual regression coverage | QA sections 7, 8, 9 | Needs frontend implementation | Riders mistaking a bus label for the detour path, missing the affected area, or seeing raw stop codes without useful context |
| DET-058 | Inferred-path boundary continuity | A trusted inferred GPS path should connect to its regular-route entry and rejoin anchors when each endpoint gap is short and plausible. Evaluate both ends independently, leave already-continuous paths unchanged, and do not draw straight handoffs across gaps over 150m. | `api-proxy/__tests__/detourV2Detector.test.js`, `src/__tests__/detourOverlays.test.js` | QA sections 5, 7, 9 | Covered, needs live Route 15B recheck after deploy | A short straight handoff may not exactly follow the road; a large unresolved gap remains visible until road matching or better GPS evidence arrives |
| DET-059 | Audited operator ground-truth review | Group each real detection lifecycle into one review case, merge same-geometry flap re-detections within 15 minutes, exclude simulations, and count only final rider-visible true/false reviews toward rollout precision. Preserve the reviewed evidence and every revision. | `api-proxy/__tests__/detourReviewOps.test.js`, `api-proxy/__tests__/detourReviewRoutes.test.js`, `src/__tests__/detourReviewScreen.source.test.js` | QA section 14 | Covered, needs deployed reviewer-account validation | Missing evidence in older retained history may require `not-applicable`; an incorrect operator label remains possible and must be corrected through the audit trail |
| DET-060 | Synthetic 30-second GPS regression lab | Replay realistic test-only vehicle traces through the actual V2 detector for positive detection, false-positive traps, clearing, visibility stability, trip rollover, and restart hydration. Report synthetic scores separately and never count them as real ground truth. | `src/__tests__/detourSyntheticLab.test.js`, `scripts/detourV2Replay.js`, `scripts/detourSyntheticScenarios.js`, `npm run score:detour-synthetic-lab` | QA section 14 | Covered | Synthetic geometry can prove deterministic behavior but cannot establish live precision, feed quality, road feasibility, or launch readiness |
| DET-061 | Hidden same-route record suppresses a visible map path | Keep records with `alertVisible=false` out of the client route model. Include alert-only records, but never let their suppressed geometry veto a separate trusted overlay on the same route. | `src/__tests__/detourService.test.js`, `src/__tests__/detourOverlays.test.js`, `src/__tests__/detourIntegration.test.js` | QA sections 2, 7, 9 | Covered, needs released-client Route 11 recheck | Accidentally exposing unconfirmed monitoring records, or losing a valid overlay when another same-route event is alert-only |
| DET-062 | Focused detour bus visibility | When a rider opens a specific detour, keep buses in that route family visible at full opacity, even when the realtime feed is marked stale. Other routes may remain filtered or dimmed. | `src/__tests__/homeVehicleFeatures.test.js`, `src/__tests__/detourVehicleFiltering.test.js`, `src/__tests__/homeScreenPerformance.test.js` | QA sections 7, 8, 9 | Covered, needs released-client visual recheck | A stale-feed treatment or focus filter making the rider's bus difficult to see |
| DET-063 | Confirmed normal terminal circulation | Operator-confirmed normal terminal entry/exit areas must not contribute off-route evidence when the bus is both inside the configured geographic area and within its configured route-edge progress limit. Other short route-edge detours remain eligible. | `api-proxy/__tests__/detourV2Detector.test.js`, `api-proxy/__tests__/detourRouteConfig.test.js` | QA sections 4, 5, 14 | Covered, needs deployed Route 8A recheck | A terminal circulation pattern changing beyond its configured area, or a real closure following the exact same terminal movement |
| DET-064 | V2 runtime document exceeds Firestore size limit | Persist only canonical event-keyed V2 candidates, active events, and clear tracks, then store the runtime payload as a bounded gzip-compressed JSON blob with backward-compatible loading of older flat documents. Normal-route clear evidence must survive scheduled cold reloads. | `api-proxy/__tests__/detourRuntimeStateStore.test.js`, `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 10, 13, 14 | Covered, needs deployed Route 11 clear verification | A future compressed payload over the explicit 900 KiB safety ceiling must fail loudly and trigger a persistence redesign rather than silently losing state |
| DET-065 | Candidate evidence crosses service days | Expire unconfirmed V2 candidate points after the configured 3h limit. Old points must not combine with a later bus or service day to publish a rider alert. | `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 4, 12, 14 | Covered | Setting the retention window too short for unusually long headways |
| DET-066 | Clear samples cross service days | Require one time-contiguous same-trip traversal for individual clear proof. Split tracks on service date or after a 15min sample gap. | `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 10, 13, 14 | Covered | A severe live-feed gap delaying a legitimate clear |
| DET-067 | V2 Firestore identity differs from physical geometry ID | Hydrate lifecycle state by the Firestore document/event-window ID. Preserve `detourEventId` only as physical geometry metadata so same-route events do not collapse or duplicate. | `api-proxy/__tests__/activeDetourSnapshotStore.test.js`, `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 2, 10, 13, 14 | Covered | Older migration records with inconsistent IDs need a live cleanup check |
| DET-068 | Hidden record absent from one detector tick | Retain backend-only records unless normal-route GPS, obsolete-shape GPS proof, explicit supersession, baseline replacement, or an operator action provides a valid removal reason. | `api-proxy/__tests__/detourPublisher.test.js` | QA sections 2, 10, 11, 12 | Covered | Unresolved hidden records require operator review rather than silent deletion |
| DET-069 | Runtime persistence failure reported as success | Propagate runtime-state write or size failures into the worker tick failure path so monitoring and retry logic see the lifecycle incident. | `api-proxy/__tests__/detourRuntimeStateStore.test.js`, `api-proxy/__tests__/detourWorkerColdStart.test.js` | QA sections 10, 13, 14 | Covered | Repeated storage failure still requires operational response |
| DET-070 | Obsolete shape disappears without GPS clear proof | A removed GTFS shape can suppress stale input geometry, but the publisher must retain the active Firestore event until the detector supplies conservative normal-route GPS proof or another explicit removal reason. | `api-proxy/__tests__/detourPublisher.test.js`, `api-proxy/__tests__/detourV2Detector.test.js` | QA sections 10, 13, 14 | Covered | Obsolete records may remain for operator review when current route vehicles cannot provide safe proof |
| DET-071 | Publisher mutation failure reported as success | Active-detour writes, retained-record writes, deletions, and their history events must reject the publish cycle when Firestore fails so the worker reports a failed tick and retries idempotently. | `api-proxy/__tests__/detourPublisher.test.js` | QA sections 10, 13, 14 | Covered | A long Firestore outage still requires operational response; a successful active write followed by a failed history write is retried |
| DET-072 | Hydration read failure cached as empty state | Distinguish a missing Firestore document from a failed read. Runtime and active-snapshot read failures must fail the tick and clear their local promise cache so the next tick retries instead of proceeding with a false empty state. | `api-proxy/__tests__/detourRuntimeStateStore.test.js`, `api-proxy/__tests__/activeDetourSnapshotStore.test.js` | QA sections 10, 13, 14 | Covered | Repeated startup read failures keep the worker unhealthy until Firestore recovers |

## Recorded issues

### DET-070A — Route 101 combined non-consecutive Georgian/Gallie trips

- Date/time observed: 2026-07-14 around 3:00 PM ET
- Environment: production V2 runtime state, structured decision logs, active Firestore records, and current MyRide notices
- Route(s): `101`
- What happened: Route `101` published a rider-visible Georgian Drive/Gallie Court detour after combining one trip from July 12 around 8:25 PM with a second trip on July 14 around 3:00 PM. The two confirming trips were about 43 hours apart. Much of the first trip's evidence was repeated stationary GPS at the same coordinate, the resulting segment skipped no stops, and the same corridor had previously activated and then cleared under normal-route GPS proof.
- What should have happened: only close, plausibly consecutive trips should corroborate one unconfirmed detour candidate. A later unrelated trip must start a fresh confirmation window.
- Fix:
  - make V2 candidate retention schedule-aware: one estimated route headway multiplied by `1.25`, plus a 10-minute lateness buffer
  - cap candidate confirmation and evidence retention at 90 minutes
  - re-prune after every inserted point so replayed or out-of-order batches cannot combine old and current trips in one tick
  - expose the effective confirmation window, estimated headway, source, and service date in detector diagnostics
- Tests added/updated:
  - `api-proxy/__tests__/detourV2Detector.test.js`
  - non-consecutive same-day trips do not confirm
  - the next close trip still confirms
  - multi-day evidence remains candidate-only
- Remaining risk: deploy the backend and remove or GPS-clear the already-active Route `101` record. Review low-frequency routes after rollout to confirm the 90-minute cap still permits their next scheduled trip to corroborate a real detour.

### DET-065A through DET-069A — lifecycle code review found stale-evidence and persistence gaps

- Date reviewed: 2026-07-14
- Environment: local V2 detector and publisher regression reproductions
- What happened:
  - candidate evidence from July 1 plus one July 14 point could publish a rider-visible detour
  - one same-trip normal-route point on each of three service days could clear an active detour
  - Firestore hydration could restore one event-window document under both its canonical document ID and its physical geometry ID
  - an absent hidden record could be deleted without normal-route GPS clear proof
  - runtime persistence errors were logged but returned success to the worker
- Fix:
  - enforce the V2 candidate evidence TTL before confirmation
  - split clear tracks by GTFS service date and maximum sample gap
  - make the Firestore document ID authoritative for V2 lifecycle hydration
  - retain absent hidden records until a valid clear/removal reason exists
  - rethrow runtime persistence failures into the worker failure path
- Tests added/updated:
  - `api-proxy/__tests__/detourV2Detector.test.js`
  - `api-proxy/__tests__/activeDetourSnapshotStore.test.js`
  - `api-proxy/__tests__/detourPublisher.test.js`
  - `api-proxy/__tests__/detourRuntimeStateStore.test.js`
- Remaining risk: deployment should verify runtime saves, canonical event counts, and clear-track accumulation across several scheduled ticks.

### DET-064A — Route 11 remained public after buses returned to regular routing

- Date/time observed: 2026-07-14 around 10:35 AM ET
- Environment: production V2 feed and Android detour view
- Route(s): `11`
- What happened: Route 11 still showed a rider-visible Georgian Mall/Livingstone detour even though current buses were following the regular route.
- Evidence:
  - the rider-visible record was retained as `gps-clear-required` with zero current detour vehicles
  - the canonical record's latest Route 11 off-route GPS evidence was from 2026-07-13 at 6:05 PM ET; its publisher-enriched geometry was last supported later that evening, with no current detour vehicles the next morning
  - the stored and current Route 11 GTFS shapes had different IDs but identical 260-point geometry, ruling out a changed regular-route baseline as the cause
  - production logs repeatedly reported `detourRuntimeV2` writes over Firestore's 1 MiB document limit
  - the failed document was about 1.13 MB and duplicated candidates, active events, and clear tracks under both canonical and legacy field names
- Root cause: scheduled ticks force-reload V2 state. Because updated runtime state could not be saved, normal-route clear tracks could not reliably accumulate across ticks, so the old rider-visible detour remained active.
- Fix: compact V2 runtime persistence to store only `eventCandidates`, `activeEvents`, and `clearTracksByEvent`, then gzip the complete canonical state into one bounded blob. Hydration remains backward-compatible with old flat documents. The observed production payload compresses from roughly 772 KB to 111 KB.
- Remaining risk: verify the compacted runtime document writes successfully after deployment and watch Route 11 until regular-route traversal moves the event through clear-pending and removes it.

### DET-063A — Normal Route 8A Downtown Hub egress published as a detour

- Date/time observed: 2026-07-14 rider feedback and live production review
- Environment: live Route `8A` focused detour map, active Firestore records, V2 runtime state, and current GTFS
- What happened: normal buses leaving Downtown Hub Stop `2` through Simcoe, Mary, and Dunlop were shown as a Maple/Simcoe detour.
- What should have happened: routine terminal circulation should remain suppressed unless the route-edge deviation is materially separated from the scheduled shape.
- Root cause: the scheduled shape starts at Downtown Hub and immediately continues north on Maple, while buses use the terminal street loop before joining Maple. The observed points were about 57-101m from the shape, above the general 40m threshold and the previous 55m route-edge strong-evidence threshold. Repeated trip identities therefore promoted the normal movement to a high-confidence event.
- Fix: Route `8A` now has a narrow known-normal area covering the first 250m of route progress within 200m of Downtown Hub. Matching observations are recorded in projection diagnostics but do not contribute detour evidence. A regression test replays the production coordinates, and a counter-test proves an unrelated short route-edge detour still activates.
- Tests added/updated: `api-proxy/__tests__/detourV2Detector.test.js`, `api-proxy/__tests__/detourRouteConfig.test.js`
- Remaining risk: deploy the backend, clear the existing false-positive record through the operator workflow, and recheck Route `8A` departures at Downtown Hub.

### DET-062A — Focused detour view made the route bus difficult to see

- Date/time observed: 2026-07-14 rider feedback
- Environment: focused detour map
- What happened: a bus serving the selected detour route could be faded by stale-feed styling, making it appear hidden.
- What should have happened: buses in the focused route family should remain fully opaque so riders can track them against the detour path.
- Fix: focused-detour buses now override stale-feed opacity and receive focused draw priority. Existing route-family filtering remains unchanged.
- Tests added/updated: `src/__tests__/homeVehicleFeatures.test.js`, `src/__tests__/homeScreenPerformance.test.js`; existing detour vehicle filtering coverage also passed.
- Remaining risk: visually recheck with a live bus on the focused route after the client release.

### DET-062B — Native route lines rendered over live bus icons

- Date/time observed: 2026-07-14 rider screenshot and Android emulator review
- Environment: Android native main map at citywide zoom
- What happened: regular and detour route lines could cross over the circular live-bus icons.
- What should have happened: the full bus icon stack should remain above all route and detour line layers.
- Root cause: the native map used large numeric `layerIndex` values as if they were z-index values. MapLibre Native clamps an index beyond the current style-layer count to the second-last position, so later route-layer mounts could still land above the buses. The source-level regression test only checked the numbers and did not verify explicit layer relationships.
- Fix: keep a stable vehicle anchor layer mounted even when the vehicle feed is empty, chain all bus icon layers explicitly above that anchor, and anchor home route/detour geometry below it.
- Tests added/updated: `src/__tests__/homeVehicleMarkerLayout.source.test.js`, `src/__tests__/routePolyline.test.js`, `src/__tests__/homeScreenPerformance.test.js`
- Visual verification: relaunched the Android dev client and confirmed live buses covered intersecting route lines at citywide zoom.
- Remaining risk: recheck iOS separately if the native iOS marker implementation is replaced with style layers in a future release.

### DET-061A — Route 11 detour details appeared without map geometry

- Date/time observed: 2026-07-14 live production review
- Environment: live Firestore records and rider map screenshot
- Route(s): `11`
- What happened: the Route `11` detour card and affected stops appeared, but the focused map had no closed segment or likely detour path.
- What should have happened: the rider-visible shared Route `11` event should have drawn its trusted likely path and skipped-route segment.
- Root cause: the client grouped two hidden backend-only Route `11` monitoring records with the visible shared event. A hidden segment had `canShowDetourPath=false`, which vetoed geometry for the entire grouped route.
- Fix: exclude records with `riderVisible=false` before building the client route model, while preserving the top-level geometry visibility field for visible events.
- Tests added/updated: `src/__tests__/detourService.test.js`; related overlay and integration suites also passed.
- Remaining risk: the fix requires a new client release and a live Route `11` map recheck.

### DET-025B — Route 8B and 15B overlays appeared only while a bus was in the corridor

- Date/time observed: 2026-07-10 live production review
- Environment: live `detourEventHistoryV2`, active Firestore records, and Android screenshot
- Route(s): `8B`, `15B`
- What happened:
  - Route `8B` near Livingstone switched visible/hidden four times from 2:03:48 PM to 2:05:08 PM ET.
  - Route `15B` repeatedly became visible for roughly 10-60 seconds when a bus entered the McAusland corridor, then became hidden as `stale-mixed-evidence`; the 11:52 AM screenshot was captured during one of those short public windows.
- What should have happened: after the evidence and geometry gates published a trustworthy path, the rider overlay should have remained visible between buses until normal-route GPS clear proof or new contradictory geometry.
- Initial classification:
  - lifecycle / clearing
  - geometry confidence
  - publishing / history
- Root cause: a between-bus detector tick rebuilt the active event from mixed-age evidence with `currentVehicleCount=0`, suppressed the geometry, and changed `riderVisible` to false even though no newer evidence or clear proof existed.
- Fix:
  - preserve the last trusted configured, road-matched, or sufficiently dense GPS path when a between-bus tick has no newer evidence
  - keep weak/jumpy stale-mixed paths hidden, including the existing Route 100 safety regression
- Tests added/updated:
  - `api-proxy/__tests__/detourV2Detector.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - this matrix
- Remaining risk: production deployment and a live Route `8B` / `15B` observation are still required to confirm the public Firestore record no longer toggles.

### DET-025D — confirmed Route 15B alert hidden with stale-mixed geometry

- Date/time observed: 2026-07-15 around 11:48 AM ET
- Environment: live production Firestore and V2 runtime state
- Route(s): `15B`
- What happened: the McAusland event remained active with 57 confirming trip identities and a current bus about 79m off route, but `stale-mixed-evidence` set `riderVisible=false`, so riders received no alert.
- What should have happened: keep the confirmed active alert public while withholding the stale-mixed path and uncertain stop impacts.
- Root cause: one field represented both alert visibility and detailed geometry safety.
- Fix:
  - publish independent `alertVisible` / `alertVisibilityReason` fields
  - keep baseline divergence, invalid self-loop evidence, insufficient confirmation, and cleared records fully hidden
  - allow confirmed active alerts with unsafe geometry into the client route model
  - render an alert-only details state and omit the map action until safe geometry exists
- Tests added/updated:
  - `api-proxy/__tests__/alertVisibility.test.js`
  - `api-proxy/__tests__/detourPublisher.test.js`
  - `api-proxy/__tests__/riderPublishGates.test.js`
  - `src/__tests__/detourVisibility.test.js`
  - `src/__tests__/detourService.test.js`
- Remaining risk: production deployment and a live Route `15B` check are required before calling the incident fully resolved.

### DET-025C — Route 11 trusted path flapped across scheduled V2 reloads

- Date/time observed: 2026-07-13 around 3:49-4:50 PM ET
- Environment: production Cloud Run structured logs, `activeDetourEventsV2`, and `systemState/detourRuntimeV2`
- Route(s): `11`
- What happened: the main Route `11` event remained active but repeatedly changed from `current-detour-vehicle`/visible to `stale-mixed-evidence`/hidden as its exact event-window vehicle count moved between one and zero. A second small Route `11` event window was active at the same time.
- What should have happened: the main trusted road-matched path should have stayed visible with `gps-clear-required` until normal-route clear proof, even while the current bus projected into the second Route `11` window.
- Evidence:
  - main event `11:...:9600-11500` alternated `currentVehicleCount=1` and `0`
  - secondary event `11:...:13300-13400` appeared during the same ticks
  - the main event held 22 confirming trip signatures and over 100 geometry evidence points
  - scheduled runs force-reloaded detector runtime and active Firestore snapshots before every tick
- Classification:
  - lifecycle / clearing
  - persistence / restart
  - publishing / history
- Root cause:
  - active V2 Firestore snapshots were keyed by `routeId`, so multiple same-route event documents overwrote each other during hydration
  - when matching runtime state already existed, hydration ignored the publisher-enriched trusted road-matched geometry
  - the between-bus hold therefore evaluated only the sparser pre-publisher detector geometry and could fail closed to `stale-mixed-evidence`
- Fix:
  - key active snapshots by `detourEventId`/document ID while preserving `routeId`
  - hydrate same-or-newer trusted published geometry into the matching runtime event
  - retain zero-current visibility as `gps-clear-required`; normal-route traversal remains required to clear
- Tests added/updated:
  - `api-proxy/__tests__/activeDetourSnapshotStore.test.js`
  - `api-proxy/__tests__/detourV2Detector.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - this matrix
- Deployment verification: revision `apiproxy-00203-jag` processed eight primary/offset ticks from 11:48-11:51 PM ET; the rider-facing shared Route `11` event remained visible as `gps-clear-required` with zero current vehicles.
- Remaining risk: repeat the observation during daytime Route `11` service when a bus moves between the two event windows; separate event-window accuracy still requires monitoring, but it should no longer make the rider-facing event flash.

### DET-057A — Route 15B focused map was technically informative but visually crowded

- Date/time observed: 2026-07-10 around 11:52 AM ET
- Environment: Android emulator screenshot during the live McAusland Route `15B` detour
- Route(s): `15B`
- What happened: the focused map showed the closed segment, detour line, buses, entry/exit markers, banner, and route label, but the bus markers overlapped the truncated route callout, the banner used raw stop codes, and the camera left a large low-value blank area while the affected geometry sat near the lower edge.
- What should have happened: the rider should immediately understand where Route `15B` leaves regular routing, which path it uses, which two stops are affected, and how to return to the regular map without labels competing with buses.
- Initial classification:
  - frontend rendering
- Root cause:
  - the large circular direction arrows were native/HTML map markers, so MapLibre's line-label collision engine could not reserve space around them
  - the route polyline's direction glyphs could also render as prominent play-button symbols on Android and ignore the separate callout marker
  - the underlying regular route continued drawing its own arrows through an active detour overlay
  - the arrows were rendered above both the `Route closed` line label and the detour route callout
- Fix:
  - remove both marker-based and polyline direction arrows from native and web detour overlays; the shaped detour path and entry/rejoin geometry remain visible without obscuring text
  - suppress regular-route arrows on the main map; live vehicle headings still show travel direction without covering route text
- Remaining frontend improvements:
  - change the collapsed banner to `Route 15B detour near McAusland Dr · 2 stops affected`; move stop codes into details
  - fit the camera to both paths with padding for the search bar, alert strip, focus control, and bottom navigation
  - strengthen the visual distinction and legend wording for `Closed regular route` versus `Detour route`
  - reduce redundant focus chrome and keep one clear `Back to all routes` control
- Automated coverage: `src/__tests__/detourIntegration.test.js`, `src/__tests__/homeScreenPerformance.test.js`
- Visual verification: Route `15B` focused native map rechecked in the Android emulator after a Metro cache-clear restart.
- Remaining risk: web still requires a screenshot review.

### DET-058A — Route 15B inferred path started after the regular route ended

- Date/time observed: 2026-07-10 around 11:52 AM ET
- Environment: Android emulator screenshot during the live McAusland Route `15B` detour
- Route(s): `15B`
- What happened: the closed regular-route line ended at its boundary marker, but the inferred detour line began a short distance away, leaving a visible gap at the handoff.
- What should have happened: a small, plausible boundary-to-GPS gap should render as one continuous rider line without lowering the off-route detection threshold.
- Root cause: V2 used projected regular-route points as fallback entry/exit anchors but published the inferred GPS trace from its first and last off-route samples. Only road-matched records previously received continuity stitching.
- Fix:
  - add each regular-route anchor directly to the inferred rider path when its endpoint gap is at most 150m
  - evaluate entry and exit independently
  - leave already-continuous paths unchanged and refuse to bridge larger gaps
- Tests added/updated: `api-proxy/__tests__/detourV2Detector.test.js`
- Remaining risk: the exact Route `15B` geometry was not retained after the short visible window, so the fix still needs a live native/web visual recheck after deployment.

### DET-054A — Route 8A/8B Livingstone-Anne active detour drew the wrong path

- Date/time observed: 2026-07-01 during active unplanned Route `8A` / `8B` review
- Environment: app screenshot, live Firestore/runtime capture, and local replay from `.tmp-live-route8.json`
- Route(s): `8A`, `8B`
- What happened: Route `8A` evidence was split into hidden fragments with `riderVisible=false` / `insufficient-geometry`, while Route `8B` had a rider-visible OSRM-routed path that included the wrong corridor near Sunnidale.
- What should have happened: the rider-facing path should follow the operator-confirmed Livingstone-Anne corridor: for `8A`, Livingstone westbound to Anne, south on Anne, then back to route; for `8B`, the opposite direction. The app should not preserve or draw stale broad route-fallback geometry.
- Evidence:
  - operator ground truth: closure area near `44.407944, -79.713111`; route rejoin/other gate near `44.398889, -79.719444`
  - captured active records showed fragmented `8A` event windows and `8B` rider-visible geometry using `osrm-route`
  - local replay with configured corridor produced visible `Livingstone-Anne` events for both `8A` and `8B`
- Initial classification:
  - detection threshold
  - geometry confidence
  - route-family mapping
  - publishing/history
- Root cause:
  - short sparse evidence around route variants split one physical detour into multiple candidate windows
  - OSRM trace matching failed and route fallback produced a plausible but wrong wider path
  - stale event-window geometry could remain rider-visible after better corridor geometry became available
- Fix:
  - added operator-configured corridor support for `8A` and `8B` with direction-specific gates, padding, outlier distance, label, and expiry
  - added optional operator `detourPathPolyline` so configured corridors can draw the confirmed street path instead of a zigzag raw GPS trace
  - coalesced same configured-corridor fragments and pruned duplicate configured corridor records
  - preserved configured corridor metadata into geometry and segments
  - disabled OSRM route fallback for configured corridor segments
  - publisher now deletes old event-window docs superseded by GPS/configured corridor geometry
- Tests added/updated:
  - `api-proxy/__tests__/detourV2Detector.test.js`
  - `api-proxy/__tests__/detourRoadMatcher.test.js`
  - `api-proxy/__tests__/detourPublisher.test.js`
  - `api-proxy/__tests__/detourRouteConfig.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - this matrix
- Remaining risk: needs live Firestore and app-map recheck after deployment; the temporary corridor override expires on 2026-07-04 at 04:00 ET unless extended.

### DET-053A — Route 12A detour path overlapped its closed segment

- Date/time observed: 2026-06-17
- Environment: live production Firestore review
- Route(s): `12A`
- What happened: the active Route 12A document had a segment suppressed with `canShowDetourPath: false`, but stale top-level route geometry could still preserve or render an alternate path in the same area as the closed segment.
- What should have happened: once a segment path is suppressed because it overlaps the closed route segment, the publisher should clear stale top-level alternate path fields and the client should not fall back to those fields for that segment.
- Evidence:
  - active event: `12A:1c872f32-f2a7-4aed-9eaa-72386e4d576e:0-400`
  - suspicious likely path had interior points within roughly 5-16m of the skipped route segment
  - segment reason: `road-match-closed-overlap`
- Initial classification:
  - geometry confidence
  - publishing/history
  - frontend rendering
- Root cause: road-match suppression was segment-aware, but older top-level trusted inferred/likely fields could still be preserved or used as a frontend fallback when every segment path was explicitly suppressed.
- Fix:
  - road matcher rejects final stitched paths that materially overlap the skipped segment
  - publisher refuses to preserve stale top-level inferred/likely paths over a segment-suppressed record and clears top-level path fields when `canShowDetourPath=false`
  - frontend overlay derivation treats segment-level `canShowDetourPath=false` as authoritative and blocks stale top-level fallback
- Tests added/updated:
  - `api-proxy/__tests__/detourRoadMatcher.test.js`
  - `api-proxy/__tests__/detourPublisher.test.js`
  - `src/__tests__/detourOverlays.test.js`
- Remaining risk: very short legitimate detours may briefly show only the closed/skipped segment until enough GPS evidence creates a non-overlapping alternate path.

### DET-030/031/033A — evidence identity could over-count AVL vehicle IDs

- Date/time reviewed: 2026-06-16
- Environment: backend regression review
- Route(s): all auto-detour routes
- What happened: candidate memory could count the same passenger trip twice when its vehicle ID changed, and V2 could confirm from one physical bus appearing as multiple one-point vehicle-only IDs.
- What should have happened: trip ID is the strongest evidence key; vehicle-only evidence is candidate/diagnostic until the identity is stable and moving. Explicit non-revenue/deadhead and cancelled/deleted GTFS-RT trip evidence should not confirm rider detours.
- Root cause: legacy candidate signatures combined vehicle ID with trip ID, and V2 counted every vehicle-only signature equally.
- Fix:
  - candidate memory now keys trip evidence by trip ID before vehicle ID
  - V2 confirmation now counts confirming identities, not raw vehicle IDs
  - vehicle-only evidence must be repeated and show route-progress movement before it counts
  - explicit non-revenue/deadhead/cancelled/deleted evidence is skipped
- Tests added/updated:
  - `api-proxy/__tests__/detourCandidateMemory.test.js`
  - `api-proxy/__tests__/detourV2Detector.test.js`
  - `api-proxy/__tests__/detourDetector.test.js`
- Remaining risk: if the live feed does not mark deadheads and omits trip IDs, stable vehicle-only false positives still require live validation and operator review.

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

### DET-022A — road-matched detour path showed gaps at entry and rejoin

- Date/time observed: 2026-06-11
- Environment: local app screenshot review
- Route(s): `8B`
- What happened: the regular route and rendered detour path had visible gaps near the detour entry and rejoin points. The likely cause was normal-route endpoint overlap being trimmed from the road-matched detour path after conservative off-route thresholds delayed the first/last trusted off-route points.
- What should have happened: the rider-facing detour line should remain continuous from the regular-route entry anchor through the likely detour path and back to the regular-route exit anchor, without lowering off-route detection thresholds.
- Initial classification:
  - geometry confidence
  - frontend rendering
- Fix:
  - original fix: backend road matching published `entryConnectorPolyline` and `exitConnectorPolyline` when it trimmed normal-route endpoint overlap, and the frontend stitched those connector polylines onto renderable likely/trusted detour paths
  - updated 2026-06-17: new road-matched records now publish one continuous `likelyDetourPolyline` with safe entry/rejoin handoffs already stitched in, and connector fields are cleared to avoid double stitching
  - Firestore mapping still preserves legacy connector fields at top level and within `segments[]` so older active records render safely
- Tests added/updated:
  - `api-proxy/__tests__/detourRoadMatcher.test.js`
  - `src/__tests__/detourOverlays.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - this matrix
- Remaining risk: visual validation is still needed on a native/web map instance because line offsets and masking can make small connector joins look different by renderer.

### DET-023A — likely path forced an endpoint turn after service had rejoined

- Date/time observed: 2026-06-23 during Route 2 simulated detour review
- Environment: local simulated-detour validation
- Route(s): `2B` example
- What happened: the road-matched likely path could be rejected, or hand-authored geometry could be pressured into adding an unrealistic final turn, because the path did not touch the artificial detour endpoint exactly.
- What should have happened: the bus path should stop or continue where the route naturally resumes regular service. The closed/skipped segment can still show the affected regular-route section, but the likely detour path should not add a turn only to touch the closure endpoint.
- Initial classification:
  - geometry confidence
  - road matching
- Fix:
  - treat entry/exit points as service-boundary anchors, not always mandatory driving waypoints
  - allow road matching to accept a modest endpoint mismatch when the mismatched endpoint is on the route's regular-service corridor
  - make sparse simulated presets prefer OSRM route snapping before trace matching, while keeping live GPS trace matching as match-first
  - record `endpointMismatchAcceptedReason` for debug/validation
  - calibrate the Route 2 simulated fixture with a `serviceRejoinPoint` so 2B continues on Anne instead of turning onto Dunlop only to touch the endpoint
- Tests added/updated:
  - `api-proxy/__tests__/detourRoadMatcher.test.js`
  - `api-proxy/__tests__/detourSimulation.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - this matrix
- Remaining risk: visual validation is still needed on actual Barrie examples to confirm the likely path, closed segment, stop impacts, and base-route masking all remain aligned.

### DET-024A — upcoming same-route notice attached to active unplanned detour

- Date/time observed: 2026-06-30
- Environment: reported active Route 8 unplanned detour with a separate upcoming Route 8 planned notice
- Route(s): `8`
- What happened: the detour details sheet could attach the upcoming same-route notice to the active unplanned detour because the client matched by route and non-expired timing.
- What should have happened: upcoming and route-only notices should remain separate unless the backend has spatially matched the active notice to the GPS-confirmed detour.
- Classification:
  - frontend rendering
  - publishing/history
- Root cause: client-side notice lookup accepted route-only matches for active detour timing instead of requiring the detected detour's `noticeStopImpactSourceNewsIds`.
- Fix:
  - detour details now use only active notices that match the active detour's official-notice source IDs
  - upcoming same-route notices remain in upcoming-notice UI instead of becoming MyRide timing for the active detour
- Tests added/updated:
  - `src/__tests__/noticeTimingUtils.test.js`
  - `src/__tests__/DetourDetailsSheet.timing.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - this matrix
- Remaining risk: active official notices without parsed/spatially merged stop impacts will show as unplanned until the backend can associate them safely.

### DET-025A — stale Route 8A alert kept a disconnected Welham path public

- Date/time observed: 2026-07-15 around 9:00 AM ET
- Environment: live production Firestore, GTFS, GTFS-RT, and Cloud Run log review
- Route(s): `8A`, with related live `8B` comparison
- What happened: Route 8A remained rider-visible after its last matching evidence had aged out, and its likely path continued south on Welham roughly 600m away from the stated route rejoin. Route 8B had newer matching evidence and remained operationally credible.
- What should have happened: a confirmed event alert should stay visible until GPS clear proof or operator action. After an evidence gap, stale path and stop details may become unavailable, and a path that does not connect to both service boundaries must never be shown.
- Evidence:
  - active Route 8A event: two confirming identities, last matching evidence around 7:13 AM ET, `currentVehicleCount: 0`
  - published Route 8A path: Welham road match with a roughly 600m exit handoff gap
  - live Route 8B candidate: fresh same-corridor evidence around 9:00 AM ET
- Classification:
  - lifecycle / clearing
  - geometry confidence
  - publishing/history
- Root cause:
  - confirmed events had no rider-visibility evidence-age ceiling, even while the exact route continued reporting
  - active events were not refreshed by one new matching bus after their original multi-bus candidate evidence aged out
  - publisher path trust checked road-match agreement with the raw GPS trace but not final proximity to both service boundaries
- Fix:
  - suppress stale path and stop details after 90 minutes without matching GPS evidence while keeping the confirmed alert public until GPS clear proof or operator action
  - refresh an already-confirmed event heartbeat from one new matching bus without weakening initial two-identity confirmation
  - suppress inferred/likely paths more than 150m from either service boundary, allowing an explicit service rejoin target
- Tests added/updated:
  - `api-proxy/__tests__/staleClear.test.js`
  - `api-proxy/__tests__/detourV2Detector.test.js`
  - `api-proxy/__tests__/detourPublisher.test.js`
- Docs updated:
  - `AUTO-DETOUR-DETECTION.md`
  - `AUTO-DETOUR-QA-CHECKLIST.md`
  - `API-PROXY-OPERATIONS.md`
  - this matrix
- Remaining risk: the 90-minute visibility window is intentionally conservative. Monitor low-frequency routes and operator-reviewed cases before shortening it.

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

