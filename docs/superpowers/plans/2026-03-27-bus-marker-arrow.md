# Bus Marker Direction Arrow Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition the direction arrow on bus markers so it sits fully outside the circular body with a 3px gap, on both native and web platforms.

**Architecture:** Two targeted edits — one constant + two SVG attributes in `BusMarker.js`, and three string changes in the `createBusHtml` template in `WebMapView.js`. No new files, no new exports, no logic changes.

**Tech Stack:** React Native (SVG via `react-native-svg`), MapLibre GL Web (inline HTML markers)

---

## File Map

| File | Change |
|---|---|
| `src/components/BusMarker.js` | `WRAPPER_SIZE` 80→88, SVG viewBox, arrow path + rotation center |
| `src/components/WebMapView.js` | `createBusHtml` outer div size, SVG dimensions, arrow path + rotation center |

---

### Task 1: Confirm baseline tests pass

**Files:**
- Read: `src/__tests__/busMarker.test.js`
- Read: `src/__tests__/webMapView.test.js`

- [ ] **Step 1: Run the test suite**

```bash
npm test -- --testPathPattern="busMarker|webMapView" --no-coverage
```

Expected: all tests pass (green). If any fail, stop and investigate before continuing.

---

### Task 2: Update native BusMarker

**Files:**
- Modify: `src/components/BusMarker.js`

- [ ] **Step 1: Change `WRAPPER_SIZE` and update the SVG**

In `src/components/BusMarker.js`, make these three edits:

**Change 1** — line 7, `WRAPPER_SIZE` constant:
```js
// Before
const WRAPPER_SIZE = 80;
// After
const WRAPPER_SIZE = 88;
```

**Change 2** — SVG element `width`, `height`, and `viewBox` (inside the `hasValidBearing` block):
```jsx
// Before
<Svg
  width={WRAPPER_SIZE}
  height={WRAPPER_SIZE}
  viewBox={`0 0 ${WRAPPER_SIZE} ${WRAPPER_SIZE}`}
  style={styles.arrowSvg}
>
// After — no change needed, these derive from WRAPPER_SIZE automatically
```
*(No edit required — width/height/viewBox already use `WRAPPER_SIZE`.)*

**Change 3** — arrow `Path d` attribute:
```jsx
// Before
d={`M${cx} 2 L${cx - 10} 32 L${cx} 22 L${cx + 10} 32 Z`}
// After
d={`M${cx} 3 L${cx - 8} 19 L${cx} 13 L${cx + 8} 19 Z`}
```

**Change 4** — verify `transform` uses `cx, cy` (no edit needed):
```jsx
transform={`rotate(${bearing}, ${cx}, ${cy})`}
```
`cx` and `cy` are computed as `WRAPPER_SIZE / 2`, so they automatically become 44 once `WRAPPER_SIZE` is 88. ✓

- [ ] **Step 2: Verify the constant and wrapper style are consistent**

After editing, confirm these lines at the top of the file read:
```js
const MARKER_SIZE = 44;
const WRAPPER_SIZE = 88;
const BORDER_WIDTH = 2.5;
```
And `styles.wrapper` uses `WRAPPER_SIZE` for both width and height (it already does — no change needed).

- [ ] **Step 3: Run tests**

```bash
npm test -- --testPathPattern="busMarker" --no-coverage
```

Expected: all 4 tests pass.

---

### Task 3: Update web `createBusHtml`

**Files:**
- Modify: `src/components/WebMapView.js`

- [ ] **Step 1: Update the outer wrapper div size**

In `createBusHtml` (~line 218), change the outer div's inline style:
```js
// Before
<div style="position:relative;width:80px;height:80px;overflow:visible;...">
// After
<div style="position:relative;width:88px;height:88px;overflow:visible;...">
```

- [ ] **Step 2: Update the arrow SVG dimensions and path**

In `createBusHtml` (~line 208–215), update `arrowHtml`:
```js
// Before
const arrowHtml = hasValidBearing ? `
  <svg width="80" height="80" viewBox="0 0 80 80"
    style="position:absolute;top:0;left:0;pointer-events:none;z-index:1;opacity:${resolvedOpacity};">
    <path d="M40 2 L30 32 L40 22 L50 32 Z"
      fill="#222222" stroke="white" stroke-width="2" stroke-linejoin="round"
      transform="rotate(${bearing}, 40, 40)"/>
  </svg>
` : '';

// After
const arrowHtml = hasValidBearing ? `
  <svg width="88" height="88" viewBox="0 0 88 88"
    style="position:absolute;top:0;left:0;pointer-events:none;z-index:1;opacity:${resolvedOpacity};">
    <path d="M44 3 L36 19 L44 13 L52 19 Z"
      fill="#222222" stroke="white" stroke-width="2" stroke-linejoin="round"
      transform="rotate(${bearing}, 44, 44)"/>
  </svg>
` : '';
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --testPathPattern="webMapView" --no-coverage
```

Expected: all tests pass.

---

### Task 4: Full test run and commit

- [ ] **Step 1: Run full test suite**

```bash
npm test --no-coverage
```

Expected: all tests pass.

- [ ] **Step 2: Manual web verification**

```bash
npm run web:dev
```

Open the app in a browser. Confirm:
- Bus markers show a small dark arrowhead pointing in the direction of travel
- The arrowhead is fully outside the circle with a visible gap (no overlap)
- Markers without bearing data show no arrow (circle only)
- Dimmed markers (when a trip is active) still render correctly

- [ ] **Step 3: Commit**

```bash
git add src/components/BusMarker.js src/components/WebMapView.js
git commit -m "fix(markers): reposition direction arrow outside circle body

Increase wrapper from 80→88px and update arrow path so the arrowhead
sits fully above the circle edge with a 3px gap. Previously the base
of the arrow extended 14px into the circle, hiding behind it."
```
