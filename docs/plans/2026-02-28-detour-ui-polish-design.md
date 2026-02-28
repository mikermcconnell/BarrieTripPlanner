# Detour Detection UI Polish — Design

**Date:** 2026-02-28
**Status:** Approved
**Design reference:** Google Maps traffic alerts, Transit app service disruptions
**Platforms:** Native + Web (both)

---

## Context

The auto detour detection system has solid backend infrastructure — real-time vehicle tracking, GTFS shape-based geometry, confidence scoring, affected stop derivation — but the frontend UI undersells it. The current banners are plain white cards that don't communicate urgency, show no useful information without tapping, and obstruct the map. The details sheet shows a flat stop list with no spatial context.

This design modernizes the detour UI across 4 areas: banner, details sheet, map integration, and visual polish.

---

## 1. Collapsible Alert Strip (Banner Redesign)

Replace stacked full-width cards with a single collapsible alert strip.

### Collapsed State (default)
- Single amber-tinted bar at top (below route filter chips)
- Left: Warning icon `<Icon name="Warning" />`
- Center: `"2 routes on detour"` (count + text)
- Right: Inline route badges (colored pills with route short name, same `busIcon` pattern as TripResultCard)
- Right edge: Chevron-down expand indicator
- Background: `COLORS.warningSubtle` (#FFF4E5)
- Left border: 3px `COLORS.warning` (#FF991F)
- Tap anywhere to expand

### Expanded State
- Same amber header bar, chevron flips up
- Below: stacked rows, one per detour route:
  - Route badge (colored pill) + `"Route 100 — 3 stops skipped"` + chevron-right
  - Left border uses **route color** (not warning color) for visual map association
  - Tap row opens DetourDetailsSheet for that route
- Overflow: if >5 detours, last row shows `"+2 more"` as a link

### Auto-Collapse Behavior
- Expands on user tap
- Auto-collapses back to single bar after 10 seconds of inactivity
- Stays expanded if user is interacting (scrolling rows, etc.)
- New detour appearing briefly pulses the collapsed bar

### Swipe-to-Dismiss
- Individual expanded rows can be swiped right to dismiss
- Dismissed detours don't reappear until the detour clears and re-triggers
- Collapsed bar updates count after dismiss
- If all dismissed, bar hides entirely

### Position
- Below search bar + route filter, above map
- Same z-index region as current (996)
- Shifts down when service alert banner is visible (existing `ALERT_OFFSET` logic)

---

## 2. Details Sheet — Vertical Timeline

Replace flat stop list with a spatial timeline showing where on the route the detour occurs.

### Header
- Route badge (colored pill, same as TripResultCard) instead of 16px dot
- Title: `"Route 100 — Detour Active"`
- Duration: `"Active for 12 min"` (prominent, not "Since 12 min ago")
- Confidence chip: `"Confirmed"` (green) / `"Detecting..."` (amber) / `"Low confidence"` (grey)
  - Maps from backend `confidence: high/medium/low`

### Timeline Section
Vertical line with nodes:

```
 ● Normal service                    (green dot, grey text)
 │
 ◆ Bayfield St @ Dunlop St          (orange diamond, entry stop name, bold)
 │  ✕ Bayfield St @ Collier St      (red X icon, strikethrough text)
 │  ✕ Bayfield St @ Ross St         (red X icon, strikethrough text)
 │  ✕ Bayfield St @ Burton Ave      (red X icon, strikethrough text)
 ◆ Bayfield St @ Livingstone St     (orange diamond, exit stop name, bold)
 │
 ● Normal service resumes           (green dot, grey text)
```

- Vertical line: 2px, grey between green dots, red between entry/exit
- Entry/exit markers: orange diamond (or filled circle with orange border)
- Skipped stops: red `<Icon name="X" />` + strikethrough stop name
- If no affected stops yet: show `"Detecting affected stops..."` with a subtle pulse

### Actions
- `"View on Map"` button (existing, keep)
- When tapped: select the route, center map on detour area, close sheet

### Fallback
- If `entryPoint`/`exitPoint` are null (geometry pending): show existing simple text `"Detour detected — stop details pending"` with Hourglass icon

---

## 3. Map Integration

### Banner-to-Map Visual Connection
- **Route-color left border** on expanded rows creates instant color association with map routes
- **Tap-to-highlight**: When user taps an expanded row, briefly pulse that route's detour overlay (opacity 1.0 → 0.5 → 1.0 over 600ms) before opening the sheet

### Detour Overlay Labels
- Add small text labels at the midpoint of each polyline:
  - Red dashed line midpoint: `"Skipped"` label (white text on red background, 10px font, pill shape)
  - Orange solid line midpoint: `"Detour route"` label (white text on orange background)
- Labels only show when the route is selected (avoid map clutter)

### Clear-Pending State in Banner
- When a detour transitions to `clear-pending`:
  - Expanded row shows `"Clearing..."` label in grey
  - Entire row at 50% opacity
  - After state clears, row animates out (fade + slide right, 300ms)

---

## 4. Visual Polish

### Entry/Exit Animations
- **Banner appear**: Slide down from above search bar (200ms ease-out)
- **Banner collapse/expand**: Height animation (250ms ease-in-out)
- **Expanded row appear**: Stagger children 50ms apart, fade-in + slide-right
- **Dismiss**: Slide right + fade out (200ms)
- **Details sheet row dismiss**: Same as banner row dismiss

### Pulsing Detour Dot
- The 8px orange dot on route chips in `HomeScreenControls.js` gets a subtle pulse animation
- Scale 1.0 → 1.3 → 1.0 on a 2-second loop using `Animated.loop`
- Only pulses for the first 30 seconds after a new detour is detected, then stays static

### Icon Modernization
- `✕` text in details sheet → `<Icon name="X" size={14} color={COLORS.error} />`
- Add Warning icon to collapsed banner bar
- Use existing `Transfer`, `MapPin` icons in timeline where appropriate

### Dark Mode Readiness
- Replace hardcoded `COLORS.white` with `COLORS.surface`
- Replace `#FFF4E5` with `COLORS.warningSubtle`
- All colors should reference theme constants, not hardcoded hex

---

## 5. Data Requirements

All needed data already exists:

| Data | Source | Status |
|------|--------|--------|
| Active detours | `TransitContext.activeDetours` | Available |
| Route colors | `ROUTE_COLORS[routeId]` | Available |
| Affected stops | `useAffectedStops()` hook | Available |
| Entry/exit stop names | `useAffectedStops()` return | Available |
| Confidence | `detour.confidence` field | Available from backend |
| Detected time | `detour.detectedAt` | Available |
| Detour state | `detour.state` (active/clear-pending) | Available |
| Route short names | `routes` from TransitContext | Available |

No new backend work needed. All changes are frontend-only.

---

## 6. Component Architecture

```
DetourAlertStrip (NEW - replaces DetourBanner)
├── CollapsedBar (warning icon + count + inline route badges + chevron)
└── ExpandedPanel
    └── DetourRow[] (route badge + summary text + chevron-right)

DetourDetailsSheet (MODIFIED)
├── Header (route badge + title + duration + confidence chip)
├── DetourTimeline (NEW sub-component)
│   ├── NormalServiceNode (green)
│   ├── EntryNode (orange diamond)
│   ├── SkippedStopNode[] (red X + strikethrough)
│   ├── ExitNode (orange diamond)
│   └── NormalServiceNode (green)
└── Actions (View on Map button)

DetourOverlay (MODIFIED)
├── Existing polylines + markers
└── NEW: Midpoint labels (Skipped / Detour route)

HomeScreenControls (MODIFIED)
└── Pulsing detour dot animation
```

---

## Files Affected

| File | Change Type |
|------|-------------|
| `src/components/DetourBanner.js` | **Replace** → `DetourAlertStrip.js` |
| `src/components/DetourBanner.web.js` | **Replace** → `DetourAlertStrip.web.js` |
| `src/components/DetourDetailsSheet.js` | **Major modify** |
| `src/components/DetourDetailsSheet.web.js` | **Major modify** |
| `src/components/DetourTimeline.js` | **New** |
| `src/components/DetourOverlay.js` | **Minor modify** (labels) |
| `src/components/DetourOverlay.web.js` | **Minor modify** (labels) |
| `src/components/HomeScreenControls.js` | **Minor modify** (pulse) |
| `src/screens/HomeScreen.js` | **Minor modify** (swap component) |
| `src/screens/HomeScreen.web.js` | **Minor modify** (swap component) |

---

## Phasing

### Phase 1: Alert Strip + Icon Polish (visual swap, same behavior)
- New DetourAlertStrip with collapsed/expanded states
- Route badges in banner
- Replace ✕ with Icon X in details sheet
- Dark mode color refs

### Phase 2: Timeline + Details Sheet Enhancements
- DetourTimeline sub-component
- Confidence chip
- Duration display
- Entry/exit stop names in header

### Phase 3: Animations + Map Integration
- Auto-collapse timer
- Swipe-to-dismiss
- Entry/exit animations
- Pulsing detour dot
- Map overlay labels
- Clear-pending banner state
- Tap-to-highlight pulse

---

## Deferred

- Dark mode full implementation (separate effort)
- Detour notification preferences (user settings)
- Historical detour viewing
- Detour impact on trip planning results
