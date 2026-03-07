# Visual Design Overhaul

**Date:** 2026-03-01
**Status:** Approved
**Platform:** Android (primary verification), Web (sync)

## Problem

The app's UI lacks visual hierarchy and personality. Everything competes for attention equally. The route chips consume ~30% of screen height, the map is cluttered with thick polylines and large markers, and the overall feel is "functional developer UI" rather than a designed transit experience.

## Changes (8 items, priority order)

### 1. Collapse Route Chips to Single Scroll Row

**Current:** Wrapped multi-row grid showing all 14+ route chips, ~120px tall.
**Target:** Single horizontal ScrollView row (~44px tall). A filter/grid icon at the right edge opens a bottom sheet with the full route grid.

- Unselected chips: muted grey background with subtle route-color left border accent
- Selected chips: filled with route color, white text
- "All" chip stays at the left as a quick toggle
- Bottom sheet: full grid layout with route chips, dismiss on backdrop tap
- **Space saved:** ~80px reclaimed for the map

### 2. Dim Unselected Routes on Map

**Current:** All route polylines at full opacity and thickness.
**Target:** When any route is selected, unselected routes drop to 30% opacity. When nothing is selected ("All" mode), all routes show at 60% opacity with thinner strokes.

- Selected route: full color, 4px stroke
- Unselected routes: 30% opacity, 2px stroke
- All mode: 60% opacity, 3px stroke
- Transition: animated opacity change over 300ms

### 3. Float Detour Alert Over Map

**Current:** Detour strip sits between chips and map, consuming vertical space.
**Target:** Small floating pill overlaying the top-left of the map.

- Collapsed: construction icon + "3 detours" text, floating with shadow
- Tapping expands to current strip content (affected routes)
- Positioned absolutely over the map, ~8px from the chip row
- Semi-transparent background with blur

### 4. Redesign Search Bar

**Current:** Plain white pill with "Where to?" placeholder.
**Target:** Elevated card with shadow, subtle background tint, larger touch target.

- Slightly taller (52px instead of ~44px)
- Soft shadow (SHADOWS.medium)
- Left-aligned search icon with more visual weight (20px instead of ~16px)
- StatusBadge stays inside, right-aligned
- Placeholder: keep "Where to?" (simple and clear)

### 5. Shrink Bus Markers

**Current:** ~80px wrapper with arrow + label.
**Target:** ~50px total — smaller circle with route number, directional arrow integrated.

- Marker circle: 28px diameter (down from ~36px)
- Route number inside the circle, bold
- Directional arrow: smaller, attached to circle edge
- Label (route name) only shows on the currently selected route's buses
- Non-selected route buses: just a 12px dot in the route color

### 6. Upgrade Plan Trip Button

**Current:** Green pill with bus icon + "Plan Trip" text.
**Target:** Circular FAB (56px) with directions icon only.

- Brand green with green-tinted shadow
- Scale-in entrance animation (spring, 0 -> 1 on mount)
- Pressed state: scale to 0.92 with spring
- No text label — the icon (route/directions) is sufficient
- Keep bottom-right position, above tab bar

### 7. Polish Bottom Tab Bar

**Current:** Standard three tabs with circle indicator behind active icon.
**Target:** Refined tab bar with top indicator bar, outline icons for inactive state.

- Active tab: filled icon + small colored bar above (3px tall, pill-shaped)
- Inactive tabs: outline/stroke-style icons in grey-500
- Remove the circle background indicator
- Remove the visible top border; shadow only for separation
- Slightly more padding between label and icon

### 8. Enforce Typographic Hierarchy

**Current:** Font weights used inconsistently.
**Target:** Clear weight assignments.

- Route chip labels: SemiBold/600, +0.3px letter-spacing
- Search placeholder: Medium/500
- Plan Trip (if keeping text): Bold/700
- Detour alert text: SemiBold/600
- Tab labels: SemiBold/600 (already correct)
- Bus marker route numbers: Bold/700

## Out of Scope

- Dark mode changes (these are light-mode improvements)
- New components or screens
- Trip planner flow changes
- GTFS data layer changes

## Platform Notes

- All changes apply to both `.js` and `.web.js` files
- Native verified on Android emulator first
- Web synced after native verification
- Bottom sheet for route grid: use existing bottom sheet pattern or `@gorhom/bottom-sheet`
