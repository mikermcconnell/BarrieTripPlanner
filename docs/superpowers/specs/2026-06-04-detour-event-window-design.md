# Detour Event Window Design

Date: 2026-06-04

## Decision

Use a location-based detour event as the source of truth for V2 detours.

Routes remain important metadata, but they should not be the lifecycle boundary. A route can have zero, one, or many active detour events. Each event owns its own detection, confirmation, rider visibility, clearing, and history.

## Goals

- Treat detours as geographic events, not whole-route state.
- Keep confirmation and clearing scoped to the event window.
- Prevent far-away same-route noise from confirming, extending, resetting, or blocking an unrelated detour.
- Support multiple simultaneous detours on one route.
- Keep rider output easy to consume by grouping active events by route.

## Non-goals

- Do not build a public migration path for existing route-keyed V2 records. This feature is not public yet.
- Do not rely on manual one-off clearing for sticky detections.
- Do not make raw GPS radius the only window definition.

## Recommended model

Use a hybrid event window:

- `routeId` identifies the route affected.
- `shapeId` and progress meters identify where on the baseline route the event lives.
- Geographic bounds identify the real-world area.
- Stop anchors improve stability when available.
- The event starts provisional, can expand within limits, then freezes when confirmed.

## Event lifecycle

| Stage | Behavior |
|---|---|
| First off-route trigger | Create a provisional event candidate around the projected progress and GPS coordinate. |
| Provisional confirmation | Only evidence inside or near that candidate window can confirm it. Far-away evidence creates a separate candidate. |
| Window growth | While provisional, allow bounded expansion if evidence is nearby and temporally related. |
| Confirmed event | Freeze the core event window. Future evidence can update confidence/last seen, but not turn it into a whole-route event. |
| Rider publishing | Publish confirmed, safe-geometry events. Hide weak/unsafe events but continue lifecycle monitoring. |
| Clearing | Only normal-route evidence inside the event clear window can clear the event. |
| History | Write event-level detected, updated, clear-pending, and cleared records. |

## Storage design

### Canonical active collection

Use:

```text
activeDetourEventsV2/{eventId}
```

Each document represents one active location event.

Core fields:

```json
{
  "eventId": "8A:shape-id:1200-1700",
  "routeId": "8A",
  "shapeId": "shape-id",
  "state": "active",
  "detourVersion": "v2-event-window",
  "detectedAt": 1780000000000,
  "lastSeenAt": 1780000300000,
  "latestGpsEvidenceAt": 1780000300000,
  "confidence": "medium",
  "riderVisible": true,
  "riderVisibilityReason": "event-window-confirmed",
  "eventWindow": {
    "coreStartProgressMeters": 1200,
    "coreEndProgressMeters": 1700,
    "confirmStartProgressMeters": 1050,
    "confirmEndProgressMeters": 1850,
    "clearStartProgressMeters": 1000,
    "clearEndProgressMeters": 1900,
    "shapeId": "shape-id",
    "geoCenter": { "latitude": 44.39, "longitude": -79.69 },
    "geoBounds": {
      "minLatitude": 44.38,
      "maxLatitude": 44.40,
      "minLongitude": -79.70,
      "maxLongitude": -79.68
    },
    "frozen": true
  },
  "evidence": {
    "pointCount": 4,
    "uniqueVehicleCount": 2,
    "uniqueSignatureCount": 2,
    "vehicleIds": ["bus-1", "bus-2"]
  },
  "geometry": {
    "entryPoint": {},
    "exitPoint": {},
    "skippedStopIds": [],
    "affectedStopIds": [],
    "inferredDetourPolyline": [],
    "skippedSegmentPolyline": []
  },
  "clearReason": null,
  "clearPendingAt": null,
  "clearedAt": null
}
```

### Runtime state

Keep using:

```text
systemState/detourRuntimeV2
```

Change its shape so runtime is event-keyed:

```json
{
  "eventCandidates": {
    "candidate-id": {}
  },
  "activeEvents": {
    "event-id": {}
  },
  "clearTracksByEvent": {
    "event-id": {
      "vehicle-or-trip-signature": []
    }
  },
  "seenSamples": []
}
```

### Event history

Use:

```text
detourEventHistoryV2/{historyId}
```

History rows should include:

- `eventId`
- `routeId`
- `shapeId`
- `eventType`
- `eventWindow`
- `detour snapshot`
- `createdAt`

### Derived route summary

Use a derived collection only if the app needs fast route lookups:

```text
activeDetoursByRouteV2/{routeId}
```

This is not source of truth. It is rebuilt from active event docs.

Example:

```json
{
  "routeId": "8A",
  "activeEventIds": ["8A:shape-a:1200-1700", "8A:shape-b:4100-4600"],
  "eventCount": 2,
  "riderVisibleEventCount": 1,
  "updatedAt": 1780000300000
}
```

## Edge cases and mitigations

| Edge case | Risk | Mitigation |
|---|---|---|
| First GPS point is noisy | Bad event window starts in the wrong place. | Keep first window provisional. Require corroboration before confirmed state. Allow bounded expansion while provisional. |
| Off-route noise kilometres away on same route | Unrelated point extends, resets, or blocks the first detour. | Far-away evidence creates a separate candidate. It cannot affect another event's confirmation or clearing. |
| Multiple simultaneous detours on one route | Route-level state can overwrite or merge them. | Store separate `activeDetourEventsV2` docs. Route summary groups them only for display. |
| Adjacent detours close together | Could split one real detour into two events. | Merge provisional candidates when progress/geographic windows overlap enough and occur in the same time window. |
| Very long detour | Could be split too aggressively. | Allow a provisional event to expand when evidence forms a coherent moving trace with acceptable progress gaps. |
| Tiny same-stop or low-span detection | False positive can become sticky. | Mark as weak geometry. Keep hidden from riders. Use shorter/adaptive clear window and require normal nearby service, not a full-route proof. |
| Missing entry/exit/skipped stops | Rider message could be wrong. | Keep event backend-only until safe geometry exists. Lifecycle still clears by event window. |
| Loop routes or same stop appears twice | Progress-only logic can confuse two places. | Include shape id, direction, stop sequence, and geographic bounds in the event window. |
| Parallel route variants | Wrong shape can absorb evidence. | Prefer trip shape id when available. Otherwise require shape consistency before confirmation. |
| Same bus changes trip id | One vehicle could look like two confirmations. | Count unique vehicles first. Use signature count only when vehicle id is unavailable. |
| Sibling routes share streets | Evidence from 8B could confirm 8A incorrectly. | Event candidates are route-scoped unless a deliberate shared-route rule is configured. |
| GTFS shape changes while event active | Old shape progress becomes invalid. | Store shape id and shape signature/version. If shape is obsolete, use event geo bounds and current route service to clear or mark obsolete. |
| Route start/end events | Clear window can overrun route bounds. | Clip clear window to shape length and lower required span when clipped. |
| Downtown GPS canyon | Repeated jitter could confirm an event. | Require minimum off-route distance, multi-source corroboration, and geometry confidence before rider visibility. |
| Bus layover, terminal movement, or garage pull-out | Non-service movement could trigger event. | Ignore stale, off-service, no-trip, or low-quality vehicle samples where feed data supports it. |
| Road closure is known/configured | GPS may be sparse but detour is real. | Seed or clamp an event window from configured corridor data, then let GPS confirm/update it. |
| Event clears then reappears | Could duplicate or flap. | Keep a short recently-cleared memory keyed by event window. Reopen if new off-route evidence appears in the same window after clearing. |

## Window definitions

Each event should maintain three related windows:

| Window | Purpose | Can change? |
|---|---|---|
| Core window | The actual suspected affected segment. | Can expand while provisional; frozen after confirmation. |
| Confirmation window | Slightly padded area where corroborating off-route evidence counts. | Derived from core window. |
| Clear window | Area where normal-route traversal proves the event is gone. | Derived from core window, stop anchors, route length, and confidence. |

This avoids treating one GPS point as the final truth while still keeping unrelated route evidence out.

## Clear-window sizing

The current 1 km minimum clear window is too broad for weak/tiny events.

Recommended rule:

| Event quality | Clear window behavior |
|---|---|
| Strong geometry with stops | Use entry-to-exit stop span plus padding. |
| Normal confirmed geometry | Use core span plus bounded padding. |
| Tiny / same-stop / low-confidence | Use an adaptive shorter window and require repeated normal nearby service. |
| Long detour | Use the full affected span with progress-gap checks. |
| Route start/end | Clip to shape bounds and adjust coverage requirement. |

## Event id strategy

Use deterministic ids based on route, shape, and rounded core progress:

```text
{routeId}:{shapeId}:{roundedCoreStart}-{roundedCoreEnd}
```

Rules:

- Round progress to stable buckets, such as 50 or 100 meters.
- While provisional, candidate id can use the first bucket.
- Once confirmed and frozen, event id should remain stable.
- If a provisional event expands enough to move bucket boundaries before confirmation, update the candidate id before it becomes an active event.

## Implementation setup

Recommended file boundaries:

| File/module | Responsibility |
|---|---|
| `api-proxy/detourV2/eventWindows.js` | Pure helpers for event ids, window overlap, expansion, merge/split, and clear-window sizing. |
| `api-proxy/detourV2/detector.js` | Orchestrates vehicle processing and calls event-window helpers. |
| `api-proxy/detourV2/eventPublisher.js` or existing publisher layer | Writes active event docs, history docs, and route summaries. |
| `api-proxy/__tests__/detourV2Detector.test.js` | Detector lifecycle and edge-case tests. |
| `api-proxy/__tests__/detourPublisher.test.js` | Firestore write shape and route summary tests. |
| App detour hooks/services | Read event docs or derived route summaries and group by route for display. |

## Rollout sequence

1. Add pure event-window helper module and tests.
2. Change runtime state from route-keyed candidates to event-keyed candidates.
3. Confirm events from candidate windows.
4. Change clear tracks to `clearTracksByEvent`.
5. Persist active event docs and event history.
6. Generate route summaries from event docs.
7. Update app/API reads to use event docs or route summaries.
8. Remove old route-keyed V2 active doc assumptions.
9. Run detour V2 regression suite and live-log replay for known 8A cases.

## Expected impact on 8A-style cases

- A tiny downtown 8A false positive becomes a weak event in that specific window.
- Off-route evidence elsewhere on 8A creates a separate candidate/event.
- Far-away noise cannot reset clear proof for the original event.
- If normal buses serve the original window again, that event clears.
- If geometry is weak, the event remains hidden from riders while still being monitored and cleared.

## Open implementation choice

The main remaining choice is whether route summaries should be stored in Firestore or computed on read.

Recommendation:

- Store route summaries if the app needs simple route-keyed reads.
- Treat them as derived cache only.
- Rebuild them from `activeDetourEventsV2` on every publish tick.
