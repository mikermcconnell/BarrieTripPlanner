---
title: Bus Marker Direction Arrow Fix
date: 2026-03-27
status: approved
---

# Bus Marker Direction Arrow Fix

## Problem

The direction arrow already exists in code (both native and web) but its geometry is wrong: the arrow base sits at y=32, which is 14px inside the 44px circle (circle top edge is at y=18 in the 80px wrapper). The base is hidden behind the circle, so only the arrow tip pokes through — making the arrow appear glitchy and poorly positioned. The user wants the arrow cleanly outside the circle with no overlap.

## Goal

Reposition the direction arrow so it sits fully outside the circular marker body, pointing in the vehicle's direction of travel, with a clean 3px gap between the arrow base and the circle edge.

## Design

### Geometry

| Property | Before | After |
|---|---|---|
| `WRAPPER_SIZE` | 80px | 88px |
| Center (cx, cy) | 40, 40 | 44, 44 |
| Circle top edge | y = 18 | y = 22 |
| Arrow tip | (40, 2) | (44, 3) |
| Arrow base (left) | (30, 32) | (36, 19) |
| Arrow base (right) | (50, 32) | (52, 19) |
| Arrow notch | (40, 22) | (44, 13) |
| Arrow height | 30px (14px hidden) | 16px (all visible) |
| Arrow width | 20px | 16px |
| Gap to circle | −14px (overlap) | +3px (outside) |

SVG path: `M44 3 L36 19 L44 13 L52 19 Z`

Arrow rotates around `(44, 44)` using `transform="rotate(${bearing}, 44, 44)"`.

### Style (unchanged)

- Fill: `#222222`
- Stroke: `white`, width `2`, linejoin `round`
- Only renders when `hasValidBearing` is true

### Files

**`src/components/BusMarker.js`** (native)
- `WRAPPER_SIZE` constant: `80` → `88`
- SVG `width`, `height`, `viewBox`: update to `88 88` / `0 0 88 88`
- Arrow path `d`: update to `M44 3 L36 19 L44 13 L52 19 Z`
- Arrow `transform`: `rotate(${bearing}, ${cx}, ${cy})` — auto-correct since cx/cy derive from `WRAPPER_SIZE / 2`
- `styles.wrapper` width/height: auto-correct since they use `WRAPPER_SIZE`

**`src/components/WebMapView.js`** (`createBusHtml`)
- Outer wrapper div: `80px` → `88px` (width and height)
- Arrow SVG: `width="80" height="80" viewBox="0 0 80 80"` → `width="88" height="88" viewBox="0 0 88 88"`
- Arrow path: `M40 2 L30 32 L40 22 L50 32 Z` → `M44 3 L36 19 L44 13 L52 19 Z`
- Arrow rotation center: `rotate(${bearing}, 40, 40)` → `rotate(${bearing}, 44, 44)`
- Circle div positioning: `top:50%;left:50%;transform:translate(-50%,-50%)` — unchanged, still centers correctly in 88px wrapper

### What does NOT change

- Web `anchor: 'center'` — 88px wrapper correctly centers on the coordinate
- Native `anchor={{ x: 0.5, y: 0.5 }}` — same
- `hasValidBearing` guard — arrow only shows when bearing is available
- Scale/opacity/dimmed logic — unchanged
- Circle size, style, text — unchanged

## Testing

- Web: run `npm run web:dev`, verify arrow is visible outside the circle for moving buses
- Native: hot reload via `npx expo start --dev-client`, confirm same on Android
- Verify arrow rotates correctly with bearing changes
- Verify dimmed markers still render correctly (arrow shares opacity with wrapper)
- Verify no regression when `hasValidBearing` is false (no arrow renders)
