# Transfer UI Enhancement Design

**Date:** 2026-02-28
**Status:** Approved
**Scope:** Journey segment timeline in trip cards + transfer markers on map

## Problem

When a trip requires a transfer, the current UI buries the transfer information:
- "1 transfer" appears as plain text in the route card detail line
- No transfer stop name visible in the card
- No distinct marker on the map at the transfer point
- Transfer walks look identical to origin/destination walks on the map
- No wait time information shown anywhere

Riders need to know **where**, **when**, and **how long** a transfer takes before they leave.

## Solution

Two complementary enhancements:

### 1. Journey Segment Timeline (Card — Option B)

When a route card with transfers is **selected**, it expands to show a vertical segment timeline below the existing compact summary row.

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  ⭐ RECOMMENDED                                  │
│  30 min   🚶── 8B ──🔄── 7B ──🚶   Leave in 3m │
│  01:52 PM - 02:22 PM                             │
│───────────────────────────────────────────────────│
│  ●  Walk 5 min → #486 Maple at Ross              │
│  █ 8B  Board toward Johnson  · 12 min · 6 stops  │
│  ◆  Transfer at Johnson & Indian Arrow            │
│     Walk 2 min · Wait ~4 min                      │
│  █ 7B  Board toward Victoria · 8 min · 4 stops   │
│  ●  Walk 3 min → destination                      │
│───────────────────────────────────────────────────│
│  920m walk · $3.50              [Details]  [Go]   │
└─────────────────────────────────────────────────┘
```

**Behavior:**
- Triggered by `isSelected && itinerary.transfers > 0`
- Direct routes (0 transfers) stay compact even when selected
- Unselected cards always stay compact
- Transfer row uses amber diamond icon, distinct from green origin/bus indicators
- Transfer row shows: stop name, walk distance (if > 0), wait time
- Wait time = next transit leg startTime − transfer walk endTime
- Bus legs show: route badge (colored), headsign, duration, stop count
- Walk legs show: duration + destination stop name
- Timeline connector uses route color for bus, grey for walk, amber at transfer

### 2. Transfer Marker on Map (Option C)

When a transfer route is selected, the map shows:

- **Amber diamond marker** at the transfer point (midpoint of transfer walk leg)
- **Pulsing ring animation** — subtle expanding/fading ring to draw attention
- **Label** with "Transfer" + stop name, amber-styled
- **Amber dashed polyline** for transfer walk segments (distinct from grey origin/destination walks)

**Marker z-index hierarchy (highest to lowest):**
1. Transfer marker (amber diamond + pulse)
2. Origin/destination markers
3. Boarding/alighting labels
4. Intermediate stop dots
5. Polylines

## Data Flow

No changes to `itineraryBuilder.js`. All transfer data already exists in itinerary legs.

```
itinerary.legs (existing)
    ↓
TripResultCard: detect transfers > 0 + isSelected → render segment timeline
    ↓
useTripVisualization: detect transfer walks between bus legs → emit transferMarkers[]
    ↓
TransitMap / HomeScreen.web: render amber transfer markers + amber dashed polylines
```

**New in `useTripVisualization`:** A `transferMarkers` memo that identifies walk legs sandwiched between two transit legs and emits:
- `coordinate` (midpoint of transfer walk, or the from/to stop if same-stop transfer)
- `fromStopName` / `toStopName`
- `walkDuration` / `waitDuration`

## Edge Cases

| Case | Behavior |
|---|---|
| 2+ transfers | Multiple transfer rows in timeline, multiple amber markers on map |
| Same-stop transfer (0m walk) | "Transfer at [stop] · Wait ~X min" — no walk info |
| Direct route selected | No timeline expansion, no transfer markers |
| Long transfer walk (>400m) | Amber warning icon on transfer row |
| No wait time computable | Omit "Wait ~X min", show walk info only |

## Files to Modify

| File | Change |
|---|---|
| `src/components/TripResultCard.js` | Add segment timeline conditional render |
| `src/hooks/useTripVisualization.js` | Add `transferMarkers` computation |
| `src/components/TransitMap.js` | Render transfer markers (amber diamond + pulse) |
| `src/screens/HomeScreen.web.js` | Render transfer markers on Leaflet map |
| `src/config/theme.js` | Add `transfer: '#F5A623'` to COLORS |

No new files. Segment timeline is ~60 lines of JSX inside TripResultCard.
