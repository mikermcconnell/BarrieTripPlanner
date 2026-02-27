# Detour UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add rider-facing detour notifications — banner on the map + details sheet with skipped stops.

**Architecture:** Three new components (`useAffectedStops`, `DetourBanner`, `DetourDetailsSheet`) plus HomeScreen wiring on both platforms. Follows existing `AlertBanner` and `StopBottomSheet` patterns exactly. TDD — tests first for the hook, component tests after for banner/sheet.

**Tech Stack:** React Native, `@gorhom/bottom-sheet` (native), Leaflet (web), existing theme system (`COLORS`, `SPACING`, `SHADOWS` from `src/config/theme.js`).

**Design doc:** `docs/plans/2026-02-27-detour-ui-design.md`

---

### Task 1: `useAffectedStops` — Tests

**Files:**
- Create: `src/__tests__/useAffectedStops.test.js`

**Step 1: Write the failing tests**

```javascript
import { deriveAffectedStops } from '../hooks/useAffectedStops';

const makeStop = (id, name, lat, lon) => ({
  id, name, code: id, latitude: lat, longitude: lon,
});

// Simulated stops along a north-south route
const stops = [
  makeStop('s1', 'First St', 44.400, -79.690),
  makeStop('s2', 'Second St', 44.395, -79.690),
  makeStop('s3', 'Third St', 44.390, -79.690),
  makeStop('s4', 'Fourth St', 44.385, -79.690),
  makeStop('s5', 'Fifth St', 44.380, -79.690),
];

const routeStopsMapping = { 'R1': ['s1', 's2', 's3', 's4', 's5'] };

describe('deriveAffectedStops', () => {
  it('returns stops between entry and exit points', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: { latitude: 44.396, longitude: -79.690 },
      exitPoint: { latitude: 44.384, longitude: -79.690 },
      stops,
      routeStopsMapping,
    });
    expect(result.affectedStops.map(s => s.id)).toEqual(['s2', 's3', 's4']);
    expect(result.entryStopName).toBe('Second St');
    expect(result.exitStopName).toBe('Fourth St');
  });

  it('returns empty array when entryPoint is null', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: null,
      exitPoint: { latitude: 44.384, longitude: -79.690 },
      stops,
      routeStopsMapping,
    });
    expect(result.affectedStops).toEqual([]);
    expect(result.entryStopName).toBeNull();
    expect(result.exitStopName).toBeNull();
  });

  it('returns empty array when exitPoint is null', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: { latitude: 44.396, longitude: -79.690 },
      exitPoint: null,
      stops,
      routeStopsMapping,
    });
    expect(result.affectedStops).toEqual([]);
  });

  it('returns empty array for unknown route', () => {
    const result = deriveAffectedStops({
      routeId: 'UNKNOWN',
      entryPoint: { latitude: 44.396, longitude: -79.690 },
      exitPoint: { latitude: 44.384, longitude: -79.690 },
      stops,
      routeStopsMapping,
    });
    expect(result.affectedStops).toEqual([]);
  });

  it('handles entry and exit at same stop', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: { latitude: 44.390, longitude: -79.690 },
      exitPoint: { latitude: 44.390, longitude: -79.690 },
      stops,
      routeStopsMapping,
    });
    expect(result.affectedStops.map(s => s.id)).toEqual(['s3']);
  });

  it('swaps entry/exit when exit comes before entry in stop order', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: { latitude: 44.384, longitude: -79.690 },
      exitPoint: { latitude: 44.396, longitude: -79.690 },
      stops,
      routeStopsMapping,
    });
    expect(result.affectedStops.map(s => s.id)).toEqual(['s2', 's3', 's4']);
  });

  it('resolves stop objects even when stops array has extra stops', () => {
    const allStops = [
      ...stops,
      makeStop('s99', 'Other Route Stop', 44.500, -79.700),
    ];
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: { latitude: 44.396, longitude: -79.690 },
      exitPoint: { latitude: 44.384, longitude: -79.690 },
      stops: allStops,
      routeStopsMapping,
    });
    expect(result.affectedStops.map(s => s.id)).toEqual(['s2', 's3', 's4']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/useAffectedStops.test.js --verbose`
Expected: FAIL — `cannot find module '../hooks/useAffectedStops'`

---

### Task 2: `useAffectedStops` — Implementation

**Files:**
- Create: `src/hooks/useAffectedStops.js`

**Step 1: Write the implementation**

```javascript
import { useMemo } from 'react';
import { haversineDistance } from '../utils/geometryUtils';

/**
 * Pure derivation — exported for testing without React.
 */
export function deriveAffectedStops({ routeId, entryPoint, exitPoint, stops, routeStopsMapping }) {
  const empty = { affectedStops: [], entryStopName: null, exitStopName: null };

  if (!entryPoint || !exitPoint) return empty;
  if (!routeId || !routeStopsMapping[routeId]) return empty;

  const stopIds = routeStopsMapping[routeId];
  if (!stopIds || stopIds.length === 0) return empty;

  const stopMap = new Map(stops.map(s => [s.id, s]));
  const routeStops = stopIds.map(id => stopMap.get(id)).filter(Boolean);

  if (routeStops.length === 0) return empty;

  // Find closest stop to entry and exit points
  let entryIndex = 0;
  let exitIndex = 0;
  let minEntryDist = Infinity;
  let minExitDist = Infinity;

  routeStops.forEach((stop, i) => {
    const dEntry = haversineDistance(
      stop.latitude, stop.longitude,
      entryPoint.latitude, entryPoint.longitude
    );
    const dExit = haversineDistance(
      stop.latitude, stop.longitude,
      exitPoint.latitude, exitPoint.longitude
    );
    if (dEntry < minEntryDist) { minEntryDist = dEntry; entryIndex = i; }
    if (dExit < minExitDist) { minExitDist = dExit; exitIndex = i; }
  });

  // Ensure entry comes before exit in stop order
  const startIdx = Math.min(entryIndex, exitIndex);
  const endIdx = Math.max(entryIndex, exitIndex);

  const affectedStops = routeStops.slice(startIdx, endIdx + 1);

  return {
    affectedStops,
    entryStopName: affectedStops.length > 0 ? affectedStops[0].name : null,
    exitStopName: affectedStops.length > 0 ? affectedStops[affectedStops.length - 1].name : null,
  };
}

export const useAffectedStops = ({ routeId, entryPoint, exitPoint, stops, routeStopsMapping }) => {
  const result = useMemo(
    () => deriveAffectedStops({ routeId, entryPoint, exitPoint, stops, routeStopsMapping }),
    [routeId, entryPoint, exitPoint, stops, routeStopsMapping]
  );
  return result;
};
```

**Step 2: Run tests to verify they pass**

Run: `npx jest src/__tests__/useAffectedStops.test.js --verbose`
Expected: All 7 tests PASS

**Step 3: Commit**

```bash
git add src/hooks/useAffectedStops.js src/__tests__/useAffectedStops.test.js
git commit -m "feat(detour): add useAffectedStops hook with tests"
```

---

### Task 3: `DetourBanner` — Native

**Files:**
- Create: `src/components/DetourBanner.js`

**Step 1: Write the component**

Follow `AlertBanner.js` patterns. Key details:
- Import `COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, SHADOWS, BORDER_RADIUS` from `../config/theme`
- Import `ROUTE_COLORS` from `../config/constants`
- `position: 'absolute'`, `zIndex: 996`
- Orange left border: `borderLeftWidth: 4`, `borderLeftColor: COLORS.warning`
- Background: `COLORS.white` with `SHADOWS.small`
- Route color dot: 12px circle, `backgroundColor: ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT`
- Max 3 visible banners, overflow shows "+N more"

```javascript
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, SHADOWS, BORDER_RADIUS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';

const BANNER_HEIGHT = 52;
const BANNER_GAP = 4;
const MAX_VISIBLE = 3;
const BASE_TOP = 140;
const ALERT_OFFSET = 64; // approximate AlertBanner height + gap

const DetourBanner = ({ activeDetours, onPress, alertBannerVisible, style }) => {
  if (!activeDetours || typeof activeDetours !== 'object') return null;

  const routeIds = Object.keys(activeDetours).filter(
    (id) => activeDetours[id]?.state !== 'cleared'
  );
  if (routeIds.length === 0) return null;

  const topOffset = alertBannerVisible ? BASE_TOP + ALERT_OFFSET : BASE_TOP;
  const visibleIds = routeIds.slice(0, MAX_VISIBLE);
  const overflowCount = routeIds.length - MAX_VISIBLE;

  return (
    <View style={[styles.container, { top: topOffset }, style]} pointerEvents="box-none">
      {visibleIds.map((routeId, index) => (
        <TouchableOpacity
          key={routeId}
          style={[styles.banner, { marginTop: index > 0 ? BANNER_GAP : 0 }]}
          onPress={() => onPress?.(routeId)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Route ${routeId} is on detour, tap for details`}
        >
          <View style={[styles.routeDot, {
            backgroundColor: ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT,
          }]} />
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>
              Route {routeId} is on detour
            </Text>
            <Text style={styles.subtitle}>Tap for details</Text>
          </View>
        </TouchableOpacity>
      ))}
      {overflowCount > 0 && (
        <View style={[styles.banner, styles.overflowBanner, { marginTop: BANNER_GAP }]}>
          <Text style={styles.overflowText}>+{overflowCount} more route{overflowCount > 1 ? 's' : ''} on detour</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    zIndex: 996,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: BANNER_HEIGHT,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...SHADOWS.small,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    } : {}),
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: SPACING.sm,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  overflowBanner: {
    justifyContent: 'center',
    borderLeftColor: COLORS.grey400,
  },
  overflowText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
});

export default DetourBanner;
```

**Step 2: Verify no import errors**

Run: `npx jest --passWithNoTests --bail src/components/DetourBanner.js 2>&1 | head -5`

**Step 3: Commit**

```bash
git add src/components/DetourBanner.js
git commit -m "feat(detour): add DetourBanner component (native)"
```

---

### Task 4: `DetourBanner.web.js`

**Files:**
- Create: `src/components/DetourBanner.web.js`

**Step 1: Write the web variant**

Same as native but without `react-native-svg`. Replace `Platform.OS` checks with web-specific styles. The native version already includes web `boxShadow` fallback, so the web variant is nearly identical — the main difference is ensuring no native-only imports.

```javascript
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';

const BANNER_HEIGHT = 52;
const BANNER_GAP = 4;
const MAX_VISIBLE = 3;
const BASE_TOP = 140;
const ALERT_OFFSET = 64;

const DetourBanner = ({ activeDetours, onPress, alertBannerVisible, style }) => {
  if (!activeDetours || typeof activeDetours !== 'object') return null;

  const routeIds = Object.keys(activeDetours).filter(
    (id) => activeDetours[id]?.state !== 'cleared'
  );
  if (routeIds.length === 0) return null;

  const topOffset = alertBannerVisible ? BASE_TOP + ALERT_OFFSET : BASE_TOP;
  const visibleIds = routeIds.slice(0, MAX_VISIBLE);
  const overflowCount = routeIds.length - MAX_VISIBLE;

  return (
    <View style={[styles.container, { top: topOffset }, style]} pointerEvents="box-none">
      {visibleIds.map((routeId, index) => (
        <TouchableOpacity
          key={routeId}
          style={[styles.banner, { marginTop: index > 0 ? BANNER_GAP : 0 }]}
          onPress={() => onPress?.(routeId)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Route ${routeId} is on detour, tap for details`}
        >
          <View style={[styles.routeDot, {
            backgroundColor: ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT,
          }]} />
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>
              Route {routeId} is on detour
            </Text>
            <Text style={styles.subtitle}>Tap for details</Text>
          </View>
        </TouchableOpacity>
      ))}
      {overflowCount > 0 && (
        <View style={[styles.banner, styles.overflowBanner, { marginTop: BANNER_GAP }]}>
          <Text style={styles.overflowText}>+{overflowCount} more route{overflowCount > 1 ? 's' : ''} on detour</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    zIndex: 996,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: BANNER_HEIGHT,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    cursor: 'pointer',
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: SPACING.sm,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  overflowBanner: {
    justifyContent: 'center',
    borderLeftColor: COLORS.grey400,
  },
  overflowText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
});

export default DetourBanner;
```

**Step 2: Commit**

```bash
git add src/components/DetourBanner.web.js
git commit -m "feat(detour): add DetourBanner component (web)"
```

---

### Task 5: `DetourDetailsSheet` — Native

**Files:**
- Create: `src/components/DetourDetailsSheet.js`

**Step 1: Write the component**

Follow `StopBottomSheet.js` patterns: `@gorhom/bottom-sheet`, `BottomSheetScrollView`, `useRef`/`useCallback`/`useMemo`.

```javascript
import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';

function formatDetourTime(detectedAt) {
  if (!detectedAt) return null;
  const date = detectedAt instanceof Date ? detectedAt : new Date(detectedAt);
  if (isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 60) {
    return `Since ${diffMin} min ago`;
  }
  return `Since ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

const DetourDetailsSheet = ({ routeId, detour, affectedStops, onClose, onViewOnMap }) => {
  const bottomSheetRef = useRef(null);
  const snapPoints = useMemo(() => ['35%', '60%'], []);

  const handleSheetChanges = useCallback(
    (index) => {
      if (index === -1) onClose?.();
    },
    [onClose]
  );

  const routeColor = ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT;
  const timeLabel = formatDetourTime(detour?.detectedAt);

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={[styles.routeDot, { backgroundColor: routeColor }]} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Route {routeId} — Detour Active</Text>
            {timeLabel && <Text style={styles.timeLabel}>{timeLabel}</Text>}
          </View>
        </View>

        <View style={styles.divider} />

        {affectedStops && affectedStops.length > 0 ? (
          <View style={styles.stopsSection}>
            <Text style={styles.sectionHeader}>Skipped Stops</Text>
            {affectedStops.map((stop) => (
              <View key={stop.id} style={styles.stopRow}>
                <Text style={styles.stopIcon}>✕</Text>
                <Text style={styles.stopName}>{stop.name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>Detour detected — stop details pending</Text>
        )}

        <TouchableOpacity
          style={styles.viewButton}
          onPress={onViewOnMap}
          accessibilityRole="button"
          accessibilityLabel="View detour on map"
        >
          <Text style={styles.viewButtonText}>View on Map</Text>
        </TouchableOpacity>
      </BottomSheetScrollView>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
  },
  handleIndicator: {
    backgroundColor: COLORS.grey300,
    width: 40,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: SPACING.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  timeLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.grey200,
    marginVertical: SPACING.lg,
  },
  stopsSection: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  stopIcon: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
    marginRight: SPACING.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  stopName: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginBottom: SPACING.lg,
  },
  viewButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  viewButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default DetourDetailsSheet;
```

**Step 2: Commit**

```bash
git add src/components/DetourDetailsSheet.js
git commit -m "feat(detour): add DetourDetailsSheet component (native)"
```

---

### Task 6: `DetourDetailsSheet.web.js`

**Files:**
- Create: `src/components/DetourDetailsSheet.web.js`

**Step 1: Write the web variant**

Follow `StopBottomSheet.web.js` patterns: `Animated` slide-in, fixed positioning, `ScrollView`, Escape key handling.

```javascript
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';

function formatDetourTime(detectedAt) {
  if (!detectedAt) return null;
  const date = detectedAt instanceof Date ? detectedAt : new Date(detectedAt);
  if (isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 60) {
    return `Since ${diffMin} min ago`;
  }
  return `Since ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

const DetourDetailsSheet = ({ routeId, detour, affectedStops, onClose, onViewOnMap }) => {
  const [slideAnim] = useState(new Animated.Value(100));

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 100,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onClose?.());
  }, [onClose, slideAnim]);

  const routeColor = ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT;
  const timeLabel = formatDetourTime(detour?.detectedAt);

  return (
    <>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
        accessibilityLabel="Close detour details"
      />
      <Animated.View style={[
        styles.sheet,
        { transform: [{ translateY: slideAnim.interpolate({
          inputRange: [0, 100],
          outputRange: [0, 400],
        }) }] },
      ]}>
        <View style={styles.handleBar} />

        <View style={styles.header}>
          <View style={[styles.routeDot, { backgroundColor: routeColor }]} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Route {routeId} — Detour Active</Text>
            {timeLabel && <Text style={styles.timeLabel}>{timeLabel}</Text>}
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <ScrollView style={styles.scrollArea}>
          {affectedStops && affectedStops.length > 0 ? (
            <View style={styles.stopsSection}>
              <Text style={styles.sectionHeader}>Skipped Stops</Text>
              {affectedStops.map((stop) => (
                <View key={stop.id} style={styles.stopRow}>
                  <Text style={styles.stopIcon}>✕</Text>
                  <Text style={styles.stopName}>{stop.name}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>Detour detected — stop details pending</Text>
          )}

          <TouchableOpacity
            style={styles.viewButton}
            onPress={onViewOnMap}
            accessibilityRole="button"
            accessibilityLabel="View detour on map"
          >
            <Text style={styles.viewButtonText}>View on Map</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 999,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '60%',
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
    zIndex: 1000,
    paddingBottom: SPACING.xl,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.grey300,
    alignSelf: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  routeDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: SPACING.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  timeLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeButton: {
    padding: SPACING.sm,
  },
  closeIcon: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.grey200,
    marginVertical: SPACING.md,
    marginHorizontal: SPACING.lg,
  },
  scrollArea: {
    paddingHorizontal: SPACING.lg,
  },
  stopsSection: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  stopIcon: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
    marginRight: SPACING.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  stopName: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginBottom: SPACING.lg,
  },
  viewButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  viewButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default DetourDetailsSheet;
```

**Step 2: Commit**

```bash
git add src/components/DetourDetailsSheet.web.js
git commit -m "feat(detour): add DetourDetailsSheet component (web)"
```

---

### Task 7: Wire into HomeScreen.js (Native)

**Files:**
- Modify: `src/screens/HomeScreen.js`

**Step 1: Add imports** (near existing component imports, ~line 28-36)

```javascript
import DetourBanner from '../components/DetourBanner';
import DetourDetailsSheet from '../components/DetourDetailsSheet';
import { useAffectedStops } from '../hooks/useAffectedStops';
```

**Step 2: Add state** (near existing useState calls)

```javascript
const [detourSheetRouteId, setDetourSheetRouteId] = useState(null);
```

**Step 3: Add derived data** (near existing `useDetourOverlays` call at ~line 275)

```javascript
const selectedDetour = detourSheetRouteId ? getRouteDetour(detourSheetRouteId) : null;
const { affectedStops } = useAffectedStops({
  routeId: detourSheetRouteId,
  entryPoint: selectedDetour?.entryPoint,
  exitPoint: selectedDetour?.exitPoint,
  stops,
  routeStopsMapping,
});
```

Note: `stops`, `routeStopsMapping` come from `useTransitStatic()`, `getRouteDetour` from `useTransitRealtime()`. Verify these destructured names match the existing context usage in HomeScreen.

**Step 4: Add DetourBanner JSX** (after SurveyNudgeBanner, before HomeScreenControls, inside `!isTripPlanningMode` block)

```jsx
{!isTripPlanningMode && (
  <DetourBanner
    activeDetours={activeDetours}
    onPress={setDetourSheetRouteId}
    alertBannerVisible={/* check if alerts exist — match existing AlertBanner conditional */}
  />
)}
```

**Step 5: Add DetourDetailsSheet JSX** (after existing bottom sheets like StopBottomSheet)

```jsx
{detourSheetRouteId && selectedDetour && (
  <DetourDetailsSheet
    routeId={detourSheetRouteId}
    detour={selectedDetour}
    affectedStops={affectedStops}
    onClose={() => setDetourSheetRouteId(null)}
    onViewOnMap={() => {
      // Calculate bounds from entry/exit points and call existing map fitBounds
      if (selectedDetour.entryPoint && selectedDetour.exitPoint) {
        const bounds = [
          [
            Math.min(selectedDetour.entryPoint.longitude, selectedDetour.exitPoint.longitude),
            Math.min(selectedDetour.entryPoint.latitude, selectedDetour.exitPoint.latitude),
          ],
          [
            Math.max(selectedDetour.entryPoint.longitude, selectedDetour.exitPoint.longitude),
            Math.max(selectedDetour.entryPoint.latitude, selectedDetour.exitPoint.latitude),
          ],
        ];
        mapRef.current?.fitBounds(bounds, 80);
      }
      setDetourSheetRouteId(null);
    }}
  />
)}
```

**Step 6: Commit**

```bash
git add src/screens/HomeScreen.js
git commit -m "feat(detour): wire DetourBanner + DetourDetailsSheet into HomeScreen (native)"
```

---

### Task 8: Wire into HomeScreen.web.js

**Files:**
- Modify: `src/screens/HomeScreen.web.js`

**Step 1: Same changes as Task 7** but adapted for web:

- Import `DetourBanner` from `'../components/DetourBanner.web'` (note `.web` suffix)
- Import `DetourDetailsSheet` from `'../components/DetourDetailsSheet.web'`
- Same state, same derived data, same JSX placement
- `onViewOnMap` uses Leaflet `mapRef.current?.fitBounds([[lat1,lon1],[lat2,lon2]])` instead of MapLibre format

**Step 2: Commit**

```bash
git add src/screens/HomeScreen.web.js
git commit -m "feat(detour): wire DetourBanner + DetourDetailsSheet into HomeScreen (web)"
```

---

### Task 9: Smoke test & verify

**Step 1: Run full detour test suite**

```bash
npx jest --verbose src/__tests__/useAffectedStops.test.js src/__tests__/detourOverlays.test.js src/__tests__/detourIntegration.test.js
```

Expected: All tests pass (7 new + 48 existing = 55 total).

**Step 2: Run backend tests** (ensure no regressions)

```bash
npx jest --verbose api-proxy/__tests__/detour*.test.js
```

Expected: 95 tests pass.

**Step 3: Visual verification** (manual)

Set `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI=true` in `.env`, start the app with `npm run web:dev`, and check:
- [ ] Detour banner appears when `activeDetours` has data
- [ ] Tap banner opens details sheet
- [ ] Skipped stops list populates (or shows "pending" fallback)
- [ ] "View on Map" zooms to detour area
- [ ] Close sheet via X / Escape / backdrop tap
- [ ] Multiple detour banners stack correctly
- [ ] Banner hidden during trip planning mode

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(detour): complete rider-facing detour UI — banner, details sheet, affected stops"
```
