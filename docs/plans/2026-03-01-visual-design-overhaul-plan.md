# Visual Design Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Overhaul the visual design of the HomeScreen to improve hierarchy, reclaim map space, and add personality — 8 changes across chips, map, markers, buttons, and tab bar.

**Architecture:** All changes are styling/layout modifications to existing components. One new component (RouteFilterSheet). No new screens, no data layer changes. Native files are primary, web files synced after.

**Tech Stack:** React Native, Expo, @gorhom/bottom-sheet (already installed), react-native-reanimated, Outfit font family

---

## Task 1: Collapse Route Chips to Horizontal Scroll Row

**Files:**
- Modify: `src/components/HomeScreenControls.js` (lines 47-359)
- Create: `src/components/RouteFilterSheet.js`
- Modify: `src/screens/HomeScreen.js` (add bottom sheet ref + render)

### Step 1: Create RouteFilterSheet component

Create `src/components/RouteFilterSheet.js` — a bottom sheet that shows the full route grid.

```javascript
import React, { useCallback, useMemo } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, FONT_FAMILIES, FONT_WEIGHTS, SHADOWS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';

export default function RouteFilterSheet({
  sheetRef,
  routes,
  selectedRoutes,
  onRouteSelect,
  getRouteColor,
  isRouteDetouring,
}) {
  const snapPoints = useMemo(() => ['40%'], []);

  const renderBackdrop = useCallback(
    (props) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.3} />,
    []
  );

  const sortedRoutes = useMemo(() => {
    if (!routes?.length) return [];
    return [...routes].sort((a, b) => {
      const numA = parseInt(a.route_short_name) || 999;
      const numB = parseInt(b.route_short_name) || 999;
      return numA - numB;
    });
  }, [routes]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      renderBackdrop={renderBackdrop}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetView style={styles.content}>
        <Text style={styles.title}>Filter Routes</Text>
        <View style={styles.grid}>
          {/* All chip */}
          <TouchableOpacity
            style={[styles.gridChip, selectedRoutes.size === 0 && styles.gridChipAllActive]}
            onPress={() => onRouteSelect(null)}
          >
            <Text style={[styles.gridChipText, selectedRoutes.size === 0 && styles.gridChipTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          {sortedRoutes.map((route) => {
            const id = route.route_id;
            const color = getRouteColor(id);
            const isSelected = selectedRoutes.has(id);
            const isDetouring = isRouteDetouring?.(id);
            return (
              <TouchableOpacity
                key={id}
                style={[
                  styles.gridChip,
                  isSelected
                    ? { backgroundColor: color, borderColor: color }
                    : { borderColor: COLORS.grey300, borderLeftWidth: 3, borderLeftColor: color },
                ]}
                onPress={() => onRouteSelect(id)}
              >
                <Text style={[styles.gridChipText, isSelected && styles.gridChipTextActive]}>
                  {route.route_short_name}
                </Text>
                {isDetouring && <View style={[styles.detourDot, { backgroundColor: COLORS.warning }]} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBackground: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  handleIndicator: { backgroundColor: COLORS.grey400, width: 40 },
  content: { padding: SPACING.lg },
  title: { fontSize: FONT_SIZES.lg, fontFamily: FONT_FAMILIES.semibold, color: COLORS.textPrimary, marginBottom: SPACING.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  gridChip: {
    height: 40, minWidth: 56, paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.grey300,
    backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center',
  },
  gridChipAllActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  gridChipText: { fontSize: FONT_SIZES.sm, fontFamily: FONT_FAMILIES.semibold, color: COLORS.textPrimary, letterSpacing: 0.3 },
  gridChipTextActive: { color: COLORS.white },
  detourDot: { position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4 },
});
```

### Step 2: Refactor HomeScreenControls to single horizontal scroll row

Modify `src/components/HomeScreenControls.js`:

**Replace the expanded chips section (lines ~108-204) with a horizontal ScrollView:**

- Remove the wrapped `flexWrap: 'wrap'` grid layout
- Replace with a single-row horizontal `ScrollView`
- Add a filter icon (grid/sliders icon) at the far right that calls `onOpenFilterSheet`
- Chips: unselected = grey background with left color accent; selected = filled with route color
- Remove the collapse/expand toggle — the row is always visible, the sheet handles full selection
- Keep alert header chip and zones toggle in the scroll row

**Key style changes:**
```javascript
// New container: single row
chipRow: {
  flexDirection: 'row',
  alignItems: 'center',
  height: 44,
  paddingHorizontal: SPACING.sm,
  gap: SPACING.xs,
}

// Unselected chip: muted with color accent
filterChip: {
  height: 36,
  minWidth: 44,
  paddingHorizontal: SPACING.md,
  borderRadius: BORDER_RADIUS.lg,
  backgroundColor: COLORS.grey100,
  borderLeftWidth: 3,
  alignItems: 'center',
  justifyContent: 'center',
}

// Selected chip: filled with route color
filterChipActive: {
  borderLeftWidth: 0,
  // backgroundColor set dynamically to route color
}
```

### Step 3: Wire bottom sheet into HomeScreen.js

In `src/screens/HomeScreen.js`:
- Import `RouteFilterSheet` and `useRef`
- Create `const routeFilterSheetRef = useRef(null)`
- Pass `onOpenFilterSheet={() => routeFilterSheetRef.current?.expand()}` to HomeScreenControls
- Render `<RouteFilterSheet>` alongside other bottom sheets (after line ~1048)

### Step 4: Verify on Android emulator

Run the app, verify:
- Chips show in single horizontal scroll row
- Tapping filter icon opens bottom sheet with full grid
- Route selection works from both row and sheet
- Map space increased by ~80px

### Step 5: Sync web version

Update `src/screens/HomeScreen.web.js` route filter panel (lines 835-923):
- Apply same horizontal scroll + filter sheet pattern
- Web bottom sheet: use a modal/overlay instead of @gorhom (web-compatible)

### Step 6: Commit

```
feat(ui): collapse route chips to single scroll row with filter sheet
```

---

## Task 2: Dim Unselected Routes on Map

**Files:**
- Modify: `src/hooks/useTripVisualization.js` (polyline opacity/width)
- Modify: `src/screens/HomeScreen.js` (pass selection state to polylines)
- Modify: `src/screens/HomeScreen.web.js` (same for Leaflet polylines)

### Step 1: Add opacity/width logic to polyline rendering

In the native HomeScreen where polylines are rendered on the MapView, add conditional styling:

```javascript
// For each route polyline:
const isSelected = selectedRoutes.has(routeId);
const hasSelection = selectedRoutes.size > 0;

const strokeWidth = isSelected ? 4 : hasSelection ? 2 : 3;
const strokeOpacity = isSelected ? 1.0 : hasSelection ? 0.3 : 0.6;
```

### Step 2: Apply to native map polylines

Find the `<Polyline>` components in HomeScreen.js and apply:
```javascript
<Polyline
  coordinates={coords}
  strokeColor={color}
  strokeWidth={strokeWidth}
  strokeOpacity={strokeOpacity}
/>
```

### Step 3: Apply to web Leaflet polylines

In HomeScreen.web.js, find the Leaflet `<Polyline>` components and apply:
```javascript
<Polyline
  positions={coords}
  pathOptions={{
    color: color,
    weight: strokeWidth,
    opacity: strokeOpacity,
  }}
/>
```

### Step 4: Verify on Android

- Select a single route → only that route is vivid, others dim
- Deselect all → all routes show at 60% opacity
- Transitions are smooth

### Step 5: Commit

```
feat(ui): dim unselected routes on map for visual hierarchy
```

---

## Task 3: Float Detour Alert Over Map

**Files:**
- Modify: `src/components/DetourAlertStrip.js` (styles, positioning)
- Modify: `src/components/DetourAlertStrip.web.js` (same)
- Modify: `src/screens/HomeScreen.js` (adjust positioning)
- Modify: `src/screens/HomeScreen.web.js` (adjust positioning)

### Step 1: Restyle DetourAlertStrip as floating pill

In `src/components/DetourAlertStrip.js`, modify the collapsed bar styles:

```javascript
collapsedBar: {
  flexDirection: 'row',
  alignItems: 'center',
  alignSelf: 'flex-start',  // Don't stretch full width
  minHeight: 36,             // Smaller than current 44
  backgroundColor: 'rgba(255, 244, 229, 0.95)', // Semi-transparent
  borderRadius: BORDER_RADIUS.round,  // Pill shape
  paddingHorizontal: SPACING.md,
  paddingVertical: SPACING.xs,
  gap: SPACING.sm,
  ...SHADOWS.medium,
}
```

Remove the full-width stretching. Make it a compact floating pill.

### Step 2: Adjust positioning in HomeScreen

The strip should float over the map, positioned just below the chip row. Adjust the container's `top` offset to sit over the map content area rather than between chips and map.

### Step 3: Apply same changes to web version

Mirror styling in `DetourAlertStrip.web.js` with CSS equivalents (`boxShadow`, `backdropFilter`).

### Step 4: Verify

- Detour pill floats over the top-left of the map
- Tapping expands to show route details
- Doesn't block route chips above

### Step 5: Commit

```
feat(ui): float detour alert as compact pill over map
```

---

## Task 4: Redesign Search Bar

**Files:**
- Modify: `src/screens/HomeScreen.js` (search bar styles)
- Modify: `src/screens/HomeScreen.web.js` (search bar styles)
- Modify: `src/components/HomeScreenControls.js` (if search bar is part of controls)

### Step 1: Enhance search bar styles on native

Find the search bar in HomeScreen.js and update:

```javascript
searchBar: {
  flexDirection: 'row',
  alignItems: 'center',
  height: 52,                    // Up from ~44
  backgroundColor: COLORS.surface,
  borderRadius: BORDER_RADIUS.xl, // 16px, more rounded
  paddingHorizontal: SPACING.lg,
  ...SHADOWS.medium,             // Stronger shadow
  gap: SPACING.sm,
}
```

- Increase the search icon size to 20px
- Use `FONT_FAMILIES.medium` for the placeholder text
- Keep StatusBadge right-aligned inside

### Step 2: Apply to web

Update `HomeScreen.web.js` search bar styles (line ~861-882) with matching changes plus `boxShadow` and `backdropFilter: 'blur(8px)'`.

### Step 3: Verify

- Search bar has more visual presence
- Shadow creates clear elevation over map
- Touch target is comfortable

### Step 4: Commit

```
feat(ui): redesign search bar with elevated card treatment
```

---

## Task 5: Shrink Bus Markers

**Files:**
- Modify: `src/components/BusMarker.js` (constants + styles)

### Step 1: Reduce marker dimensions

In `src/components/BusMarker.js`:

```javascript
// Line 9-10: Change constants
const MARKER_SIZE = 30;          // Down from 40
const ARROW_WRAPPER_SIZE = 56;   // Down from 80
```

### Step 2: Update marker styles

```javascript
circle: {
  width: MARKER_SIZE,            // 30
  height: MARKER_SIZE,           // 30
  borderRadius: MARKER_SIZE / 2, // 15
  borderWidth: 2.5,              // Down from 3
  borderColor: 'white',
}

routeLabel: {
  fontSize: 11,                  // Slightly smaller
  fontWeight: '700',             // Bold for legibility at small size
  letterSpacing: 0.3,
}
```

### Step 3: Scale down SVG arrow proportionally

Adjust the SVG arrow path scaling to match the smaller wrapper.

### Step 4: Verify on Android

- Markers are noticeably smaller but still readable
- Route numbers are legible
- Directional arrows still work correctly
- Less overlap between markers on busy areas

### Step 5: Commit

```
feat(ui): shrink bus markers for reduced map clutter
```

---

## Task 6: Upgrade Plan Trip Button

**Files:**
- Modify: `src/components/PlanTripFAB.js` (complete restyle)

### Step 1: Convert to circular FAB

```javascript
import React, { useEffect } from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS } from '../config/theme';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function PlanTripFAB({ onPlanTrip }) {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(300, withSpring(1, { damping: 12, stiffness: 180 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.fabContainer}>
      <AnimatedTouchable
        style={[styles.fab, animStyle]}
        onPress={onPlanTrip}
        activeOpacity={0.85}
      >
        <Ionicons name="navigate" size={26} color={COLORS.white} />
      </AnimatedTouchable>
    </View>
  );
}

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    bottom: 32,
    right: SPACING.lg,
    zIndex: 1000,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#388E3C',  // primaryDark for depth
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.elevated,
    shadowColor: '#388E3C',      // Green-tinted shadow
  },
});
```

### Step 2: Update web Plan Trip button

In `HomeScreen.web.js` (lines 954-962), apply matching circular FAB style.

### Step 3: Verify

- Button appears with spring-in animation on screen load
- Circular shape with navigate icon
- Green-tinted shadow gives it personality
- Press feedback works

### Step 4: Commit

```
feat(ui): upgrade Plan Trip to circular FAB with entrance animation
```

---

## Task 7: Polish Bottom Tab Bar

**Files:**
- Modify: `src/navigation/TabNavigator.js` (styles + icon rendering)

### Step 1: Update tab bar styles

In `TabNavigator.js`, modify the tab bar styling (lines 134-177):

```javascript
tabBar: {
  backgroundColor: COLORS.surface,
  borderTopWidth: 0,                    // Remove border, shadow only
  paddingTop: 8,
  paddingHorizontal: SPACING.xxl,
  height: 72 + insets.bottom,
  paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
  ...SHADOWS.medium,                    // Shadow for separation
  ...(Platform.OS === 'web' && {
    boxShadow: '0 -2px 20px rgba(23, 43, 77, 0.08)',
    backdropFilter: 'blur(16px)',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
  }),
}
```

### Step 2: Update active indicator

Replace the circle indicator with a top bar:

```javascript
activeIndicator: {
  position: 'absolute',
  top: -8,
  width: 24,                    // Narrower pill
  height: 3,
  borderRadius: 1.5,
  backgroundColor: COLORS.primary,
}
```

### Step 3: Adjust icon styling for active/inactive contrast

```javascript
// Focused: strokeWidth 2.5 (bolder)
// Unfocused: strokeWidth 1.5, color grey500 (lighter)
```

### Step 4: Verify

- Top indicator bar instead of background circle
- Inactive icons are lighter/thinner
- No visible top border, clean shadow separation
- Tab switching feels refined

### Step 5: Commit

```
feat(ui): polish bottom tab bar with top indicator and refined icons
```

---

## Task 8: Enforce Typographic Hierarchy

**Files:**
- Modify: `src/components/HomeScreenControls.js` (chip label styles)
- Modify: `src/components/DetourAlertStrip.js` (alert text styles)
- Modify: `src/components/BusMarker.js` (route number font weight — may already be done in Task 5)
- Modify: `src/components/PlanTripFAB.js` (if text kept — may already be done in Task 6)

### Step 1: Audit and fix font weights

Apply consistent typography across all modified components:

| Element | Font Family | Weight | Letter Spacing |
|---------|------------|--------|---------------|
| Route chip labels | FONT_FAMILIES.semibold | 600 | 0.3px |
| Search placeholder | FONT_FAMILIES.medium | 500 | 0 |
| Detour alert text | FONT_FAMILIES.semibold | 600 | 0.2px |
| Bus marker route numbers | Bold | 700 | 0.3px |
| Tab labels | FONT_FAMILIES.semibold | 600 | 0.1px (already correct) |
| Bottom sheet title | FONT_FAMILIES.semibold | 600 | 0 |

### Step 2: Verify text rendering

Check each component renders with correct weight and spacing on Android.

### Step 3: Commit

```
feat(ui): enforce consistent typographic hierarchy across components
```

---

## Execution Order

Tasks 1-8 are largely independent. Recommended execution:

**Phase 1 (highest impact):** Tasks 1, 2, 5 (chips, route dimming, markers)
**Phase 2 (medium impact):** Tasks 3, 4, 6 (detour float, search bar, FAB)
**Phase 3 (polish):** Tasks 7, 8 (tab bar, typography)

Commit after each task. Verify build between phases.
