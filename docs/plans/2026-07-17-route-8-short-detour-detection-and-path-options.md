# Route 8 Short-Detour Detection and Path Options

Date: 2026-07-17
Status: Implemented, deployed, and verified with the live Shanty Bay event
Scope: Route 8 live-log findings, rider visibility, and global fixes for short or close-to-route detours

## Purpose

This note collects the Route 8 discussion and turns it into a practical direction for future work. It is a working note, not the source of truth for current detector behaviour.

## What We Confirmed

Route 8 has two current physical detours:

| Detour | Service affected | Official timing | Current automatic result |
|---|---|---|---|
| Livingstone paving | Route 8A southbound and Route 8B northbound | July 16 to July 18 | The system detects it and can draw a usable path, but old and new copies of the event are not handled consistently. |
| Shanty Bay closure | Route 8B southbound | July 6 to September 4 | The system detects it and can show an alert, but it rejects the automatically drawn path. |

The official Livingstone notice also covers Routes 10 and 11.

## Why Short Detours Are Difficult

The normal off-route threshold is 40 metres. A bus must move more than 40 metres from its scheduled route before a GPS reading counts as off-route evidence.

A short detour, or one that uses a nearby parallel street, may only be far enough away for a brief period. With vehicle locations arriving about every 30 seconds, one bus may produce only one or two useful readings before returning to its route.

This creates two different problems:

1. The system may not collect enough readings to start a new event.
2. A real event may already be confirmed, but later buses may not produce enough readings to keep its evidence fresh.

Lowering the 40-metre threshold everywhere would be risky. Normal terminal circulation, parallel roads and ordinary GPS drift could create false detours.

## What the Route 8 Logs Showed

### Livingstone

- The system has valid Livingstone geometry for both affected Route 8 directions.
- The path spans roughly 750 to 800 metres and identifies skipped stops.
- New buses are still producing brief matching evidence.
- The backend has several records for what is really one physical detour.
- Some older records had GPS evidence that was 10 to 14 hours old, while newer records had recent evidence.
- The primary scheduled check and the 30-second follow-up check sometimes made opposite public-visibility decisions from the same old evidence. This caused the event to switch between visible and hidden.

The small-detour problem helps explain why evidence is not refreshed consistently. It does not explain the visible/hidden switching by itself. That switching is a separate event-lifecycle problem.

### Shanty Bay

- Recent Route 8B southbound GPS evidence matches the Shanty Bay event.
- The event qualifies as a rider alert.
- The road matcher rejects the proposed line with `road-match-closed-overlap`.
- The current safety rule is conservative, so it hides the line rather than risk showing a wrong path.

### Second-pass Shanty Bay replay

A replay of the live Shanty Bay event identified the more specific problem:

- The five-point GPS trace produces a high-confidence road match on Blake Street. The match confidence is about 0.986.
- All five GPS points are within about 3 to 10 metres of the matched line.
- The matched line is about 926 metres long.
- The bus follows or stays close to the regular route near the beginning and end, then takes a different corridor through the middle.
- The road matcher successfully removes the regular-route overlap at the beginning and end. The remaining middle section passes the closed-road check.
- The publisher then joins the removed regular-route portions back onto the middle section so the line reaches the original GPS boundaries.
- The final safety check sees those reattached portions near the closed segment and rejects the whole line as `published-blocked-overlap`.

This means the main Shanty Bay problem is not that the system chose the wrong road. The road-matched middle section is strongly supported by the bus GPS. The problem is that broad GPS entry and return boundaries are being mixed with the narrower boundaries needed to draw the public path.

The current overlap check is based mainly on proximity. By default, it treats a candidate as using the closed segment when at least three interior path points, and at least 5% of the interior path, are within 35 metres of the closed segment. That check should remain conservative, but it should be applied to the true detour interior instead of a line that includes normal-route approaches at both ends.

## Rider-Facing Result We Want

| Detour | Alert | Detour line |
|---|---|---|
| Livingstone | Show | Show the trusted path. |
| Shanty Bay | Show | Show only after a safe path passes validation. Until then, show the alert without a line. |

Official notices and automatic GPS detection should remain separate:

- An official notice can tell riders that a detour is active.
- GPS evidence is still required before showing an automatically created path.
- An official notice must not make an unsafe path appear trustworthy.

## Short-Detour Detection and Refresh Recommendation

Use different rules for starting an event and refreshing an event.

### Starting a new event

Keep the current rules conservative:

- Keep the normal 40-metre threshold.
- Require matching evidence from two independent trips.
- Require the trips to leave and return to the route in similar places and move in the same direction.
- Do not let one marginal GPS point create a new public detour.

### Refreshing an already-confirmed event

Allow a confirmed event to accept weaker follow-up evidence only when all of these are true:

- It is the same route and direction.
- It matches the same physical corridor and existing event boundaries.
- The bus moves from the regular route, through the known detour area, and back to the regular route in the correct order.
- The evidence occurs within the expected service and headway window.
- There is no newer evidence showing normal travel through the affected section.

A follow-up reading between about 25 and 40 metres from the route could refresh a confirmed event, but it could not create a new event, move its boundaries or create a new path by itself.

The system should also combine matching records under one physical event so a fresh record and a stale duplicate cannot compete with each other.

## Global Fix Options for Shanty Bay-Type Path Failures

### Preferred fix — Separate evidence boundaries from display boundaries

The detector's entry and return points answer this question:

> Between which two GPS observations did the bus leave and return to its route?

The map needs a more precise answer:

> Where does the road-matched path actually split from and rejoin the regular route?

These points can differ by several hundred metres when GPS updates are sparse. They should not be forced to use the same coordinates.

After a path is road-matched:

1. Compare it with the regular route.
2. Remove the shared beginning and ending portions.
3. Require the remaining middle section to stay meaningfully separate for a minimum continuous distance.
4. Require the middle section to be close to the ordered bus GPS trace.
5. Use the first and last points of that safe middle section as the **display entry** and **display return** points.
6. Clip the displayed closed-route segment to those same display points.
7. Draw only the safe middle path. Do not add the normal-route portions back and then judge them as part of the detour.

Keep the original GPS evidence boundaries and clear window unchanged for detection, event history and clearing. The refined points are only for public map geometry.

**Benefits**

- Directly fixes the failure reproduced with Shanty Bay data.
- Works anywhere a detour shares the regular route near its entry and return points.
- Does not lower the global off-route threshold or weaken event confirmation.
- Preserves the rule that an unsafe middle path must remain hidden.

**Risks**

- The public path and the detector's evidence window will have different boundaries, so their field names and purposes must be explicit.
- Stops and the displayed closed segment must be recalculated from the display boundaries to prevent contradictory map information.
- The system must reject cases where no meaningful separated middle section remains.

### Option 1 — Build a path from several confirmed bus trips

Collect the ordered GPS traces from at least two complete trips through the same detour. Group their matching off-route points into a shared corridor, then choose representative points that the road matcher must pass through.

This gives the road matcher enough information to choose the street the buses actually used instead of the shortest route between broad entry and return points.

**Benefits**

- Works for short detours and nearby parallel streets.
- Uses repeated bus behaviour rather than one sparse trip.
- Applies to every route without adding a Route 8-specific path.

**Risks**

- The line may take an extra trip or two before it becomes available.
- GPS outliers must be removed before building the shared corridor.

### Option 2 — Replace the simple proximity check with a continuous-overlap check

Judge whether a proposed path truly uses the closed road by measuring the length and continuity of the overlap, not just how many points are within 35 metres.

The check should:

- Ignore the small connection areas where every detour must leave and return to the regular route.
- Measure continuous shared distance through the interior of the closure.
- Compare direction and progress along the closed segment.
- Use the raw bus GPS points to confirm that the proposed path follows the observed bus corridor.
- Allow a nearby parallel road when it has consistent separation and strong GPS support.
- Continue rejecting a path that actually travels through the closed interior.

**Benefits**

- Directly addresses nearby parallel-road false rejections.
- Improves every route using the existing road matcher.

**Risks**

- A weak overlap test could allow a genuinely incorrect path.
- It requires careful regression testing against known closures.

This should support the preferred fix, not replace it. Simply loosening the 35-metre overlap rule would hide the real boundary problem and could allow incorrect paths elsewhere.

### Option 3 — Generate and score several possible paths

Instead of accepting the first map-matched or routed result, generate several candidates using:

- different matching radiuses;
- representative GPS points from the detour corridor;
- map matching and normal routing; and
- different safe sets of intermediate points.

Score each candidate against:

- the actual ordered GPS observations;
- the known entry and return areas;
- use of the closed segment;
- backward movement or unnecessary loops; and
- connection to the regular route.

Publish only the highest-scoring candidate that passes every safety rule.

**Benefits**

- Handles more road-layout edge cases than one matching attempt.
- Keeps a hard safety gate.

**Risks**

- More requests, processing and code complexity.
- Candidate scoring must be transparent in logs.

### Option 4 — Wait for better geometry while showing the alert

Show the public alert as soon as the event is safely confirmed, but continue collecting complete trip traces before attempting to publish the line.

**Benefits**

- Very low risk of showing a wrong line.
- Gives the system time to collect enough points for a short detour.

**Risks**

- Riders may temporarily receive an alert without a path.
- This improves safety but does not improve the path-building method by itself.

### Option 5 — Add a verified path for one known detour

A manually verified Shanty Bay path would solve the immediate display problem, but it would not solve the general edge case. It should be an emergency fallback, not the main solution.

## Recommended Global Solution

Use boundary-aware path publication as the main fix:

1. Show a confirmed alert even when the path is not ready.
2. Keep the detector's evidence boundaries and clear window as the lifecycle source of truth.
3. Road-match one coherent, time-ordered bus trace.
4. Trim the matched path's shared regular-route beginning and ending.
5. Confirm that the remaining middle section is meaningfully separate, follows the raw GPS and avoids the closed interior.
6. Create separate display entry and return points from that middle section.
7. Clip the displayed closed-route segment and displayed affected stops to the refined display boundaries.
8. Publish only the middle detour path. Do not reattach regular-route approaches as part of the detour line.
9. Keep the alert but hide the line when no safe middle section remains.

Use multi-trip corridor building from Option 1 only when one coherent trip is too sparse to produce a safe middle path. Add multi-candidate scoring from Option 3 only if the consensus path still fails often.

### Recommended code ownership

- `api-proxy/detourRoadMatcher.js`: identify shared prefix and suffix sections, return the safe middle path, and explain why a candidate passed or failed.
- `api-proxy/detourPublisher.js`: keep evidence geometry separate from public display geometry, recalculate displayed boundaries and stop impacts, and enforce the final publish gate.
- V2 detector and clearing logic: continue using the original evidence boundaries and clear window. Do not let map matching change lifecycle truth.
- Client: display the refined public geometry supplied by the backend; do not recreate these rules in the app.

### Implementation completed

- Confirmed short detours can now refresh from a same-trip on-route/marginal/on-route movement that matches the trusted event path. Initial confirmation remains unchanged.
- Road matching now keeps a safe separated middle path when only the broad normal-route approaches fail the final overlap check.
- Detector evidence boundaries remain unchanged; the publisher writes separate `display*` boundaries, clipped closed geometry and display stop fields.
- The client prefers the refined fields only when `displayBoundaryRefined=true`.
- Distant same-route events retain separate shared IDs, while matching physical event windows can share one public identity.
- Automated regressions cover the safe-middle path, failure without meaningful separation, bracketed refresh, unbracketed marginal evidence, publisher persistence and client mapping.

## False-Detour Protections

The global fix should keep these safeguards:

- Two independent trips must support a new event.
- Evidence must match the same route, direction and physical corridor.
- Entry and return areas must agree within a limited distance.
- GPS observations must move forward through the route in the correct time order.
- Known normal movements, including the Route 8A Downtown Hub loop, must remain excluded.
- A weaker threshold may refresh an existing event but may not create one.
- Normal-route GPS traversal through the affected area remains the main automatic clearing proof.
- A path that cannot be validated remains hidden even when the alert is visible.

## Validation Plan

Before release, replay both positive and negative cases.

### Positive cases

- Shanty Bay Route 8B southbound: the Blake Street middle path is shown, its normal-route approaches are not styled as detour path, and the displayed closed segment uses the refined boundaries.
- Livingstone Route 8A southbound and Route 8B northbound: one stable shared event remains visible with its trusted path.
- Other short-detour examples where only one or two useful GPS readings occur per trip.

### Negative cases

- Normal Route 8A Downtown Hub circulation.
- Normal buses on streets running close and parallel to their GTFS shapes.
- GPS drift near intersections and terminals.
- A routed candidate that genuinely uses a closed road.
- A candidate that never separates meaningfully from the regular route after its shared beginning and ending are removed.
- Old and current trips that are too far apart in time to support the same event.
- Existing safety cases for Routes 10, 11, 15B, 100 and 101.

### Release checks

- No visible/hidden switching between the primary and 30-second checks when no evidence changed.
- One public record per physical detour and affected route direction.
- Clear logs showing why each candidate path was accepted or rejected.
- No increase in false alerts during a shadow-mode comparison against current production rules.
- Manual map review of accepted paths before enabling the new path logic for all riders.

## Current Recommendation in One Sentence

Keep detection strict, but let the public map use refined road-level entry and return points so normal-route approaches are not mistaken for use of the closed road.
