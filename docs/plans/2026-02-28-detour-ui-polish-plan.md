# Detour Detection UI Polish — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the plain white detour banners with a collapsible amber alert strip, add a vertical timeline to the details sheet, and add animations + map integration polish.

**Architecture:** New `DetourAlertStrip` component replaces `DetourBanner` (both native + web). New `DetourTimeline` sub-component renders inside `DetourDetailsSheet`. Both HomeScreens swap imports. All data already exists in `TransitContext` — no backend changes needed.

**Tech Stack:** React Native, Expo, `@gorhom/bottom-sheet` (native), `Animated` (web), `react-leaflet` (web maps), `MapLibreGL` (native maps)

**Design Doc:** `docs/plans/2026-02-28-detour-ui-polish-design.md`

---

## Phase 1: Alert Strip + Icon Polish

### Task 1: Create DetourAlertStrip.js (native)

**Files:**
- Create: `src/components/DetourAlertStrip.js`
- Reference: `src/components/DetourBanner.js` (will be replaced)
- Reference: `src/config/constants.js:72-84` (ROUTE_COLORS)
- Reference: `src/config/theme.js` (COLORS, SPACING, etc.)

**Step 1: Create the new DetourAlertStrip component**

Create `src/components/DetourAlertStrip.js` with collapsed/expanded states:

```jsx
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, SHADOWS, BORDER_RADIUS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';
import Icon from './Icon';

const BASE_TOP = 140;
const ALERT_OFFSET = 64;
const MAX_EXPANDED_ROWS = 5;

const DetourAlertStrip = ({ activeDetours, onPress, alertBannerVisible, routes, style }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const routeIds = activeDetours
    ? Object.keys(activeDetours).filter((id) => activeDetours[id]?.state !== 'cleared')
    : [];

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  if (routeIds.length === 0) return null;

  const topOffset = alertBannerVisible ? BASE_TOP + ALERT_OFFSET : BASE_TOP;
  const visibleIds = routeIds.slice(0, MAX_EXPANDED_ROWS);
  const overflowCount = routeIds.length - MAX_EXPANDED_ROWS;

  // Helper to get route short name
  const getRouteName = (routeId) => {
    const route = routes?.find((r) => String(r.id) === String(routeId));
    return route?.shortName || routeId;
  };

  // Helper to get affected stop count text
  const getStopCountText = (routeId) => {
    const detour = activeDetours[routeId];
    // affectedStops isn't directly available here — we show generic text
    // The details sheet shows the full stop list
    return detour?.state === 'clear-pending' ? 'Clearing...' : 'On detour';
  };

  return (
    <View style={[styles.container, { top: topOffset }, style]} pointerEvents="box-none">
      {/* Collapsed Bar */}
      <TouchableOpacity
        style={styles.collapsedBar}
        onPress={toggleExpand}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${routeIds.length} route${routeIds.length > 1 ? 's' : ''} on detour. Tap to ${isExpanded ? 'collapse' : 'expand'}`}
      >
        <Icon name="Warning" size={16} color={COLORS.warning} />
        <Text style={styles.collapsedText}>
          {routeIds.length} route{routeIds.length > 1 ? 's' : ''} on detour
        </Text>
        <View style={styles.inlineBadges}>
          {routeIds.slice(0, 4).map((routeId) => (
            <View
              key={routeId}
              style={[styles.routeBadge, {
                backgroundColor: ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT,
              }]}
            >
              <Text style={styles.routeBadgeText}>{getRouteName(routeId)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* Expanded Panel */}
      {isExpanded && (
        <View style={styles.expandedPanel}>
          {visibleIds.map((routeId) => {
            const routeColor = ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT;
            const isClearPending = activeDetours[routeId]?.state === 'clear-pending';
            return (
              <TouchableOpacity
                key={routeId}
                style={[
                  styles.detourRow,
                  { borderLeftColor: routeColor },
                  isClearPending && styles.detourRowClearPending,
                ]}
                onPress={() => onPress?.(routeId)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Route ${getRouteName(routeId)} detour details`}
              >
                <View style={[styles.routeBadge, { backgroundColor: routeColor }]}>
                  <Text style={styles.routeBadgeText}>{getRouteName(routeId)}</Text>
                </View>
                <Text style={[styles.rowText, isClearPending && styles.rowTextClearPending]} numberOfLines={1}>
                  Route {getRouteName(routeId)} — {getStopCountText(routeId)}
                </Text>
                {isClearPending ? (
                  <Text style={styles.clearingLabel}>Clearing...</Text>
                ) : (
                  <Text style={styles.rowChevron}>›</Text>
                )}
              </TouchableOpacity>
            );
          })}
          {overflowCount > 0 && (
            <Text style={styles.overflowLink}>+{overflowCount} more</Text>
          )}
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
  collapsedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningSubtle,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: 44,
    ...SHADOWS.small,
    gap: SPACING.sm,
  },
  collapsedText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    flex: 1,
  },
  inlineBadges: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  routeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
    minWidth: 28,
    alignItems: 'center',
  },
  routeBadgeText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  chevron: {
    fontSize: FONT_SIZES.xxs,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  expandedPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    marginTop: 2,
    ...SHADOWS.small,
    overflow: 'hidden',
  },
  detourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderLeftWidth: 3,
    gap: SPACING.sm,
    minHeight: 44,
  },
  detourRowClearPending: {
    opacity: 0.5,
  },
  rowText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    flex: 1,
  },
  rowTextClearPending: {
    color: COLORS.textSecondary,
  },
  rowChevron: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
  clearingLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  overflowLink: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.medium,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
});

export default DetourAlertStrip;
```

**Step 2: Verify no syntax errors**

Run: `npx react-native-community/cli start --check` or just `npm test -- --passWithNoTests`
Expected: No import errors

**Step 3: Commit**

```bash
git add src/components/DetourAlertStrip.js
git commit -m "feat(detour): add DetourAlertStrip component (native)"
```

---

### Task 2: Create DetourAlertStrip.web.js

**Files:**
- Create: `src/components/DetourAlertStrip.web.js`
- Reference: `src/components/DetourAlertStrip.js` (Task 1)
- Reference: `src/components/DetourBanner.web.js` (will be replaced)

**Step 1: Create the web version**

Create `src/components/DetourAlertStrip.web.js`. Same logic as native, but uses `boxShadow` and `cursor: 'pointer'` instead of native SHADOWS:

```jsx
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';
import Icon from './Icon';

const BASE_TOP = 140;
const ALERT_OFFSET = 64;
const MAX_EXPANDED_ROWS = 5;

const DetourAlertStrip = ({ activeDetours, onPress, alertBannerVisible, routes, style }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const routeIds = activeDetours
    ? Object.keys(activeDetours).filter((id) => activeDetours[id]?.state !== 'cleared')
    : [];

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  if (routeIds.length === 0) return null;

  const topOffset = alertBannerVisible ? BASE_TOP + ALERT_OFFSET : BASE_TOP;
  const visibleIds = routeIds.slice(0, MAX_EXPANDED_ROWS);
  const overflowCount = routeIds.length - MAX_EXPANDED_ROWS;

  const getRouteName = (routeId) => {
    const route = routes?.find((r) => String(r.id) === String(routeId));
    return route?.shortName || routeId;
  };

  const getStopCountText = (routeId) => {
    const detour = activeDetours[routeId];
    return detour?.state === 'clear-pending' ? 'Clearing...' : 'On detour';
  };

  return (
    <View style={[styles.container, { top: topOffset }, style]} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.collapsedBar}
        onPress={toggleExpand}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${routeIds.length} route${routeIds.length > 1 ? 's' : ''} on detour`}
      >
        <Icon name="Warning" size={16} color={COLORS.warning} />
        <Text style={styles.collapsedText}>
          {routeIds.length} route{routeIds.length > 1 ? 's' : ''} on detour
        </Text>
        <View style={styles.inlineBadges}>
          {routeIds.slice(0, 4).map((routeId) => (
            <View
              key={routeId}
              style={[styles.routeBadge, {
                backgroundColor: ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT,
              }]}
            >
              <Text style={styles.routeBadgeText}>{getRouteName(routeId)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.expandedPanel}>
          {visibleIds.map((routeId) => {
            const routeColor = ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT;
            const isClearPending = activeDetours[routeId]?.state === 'clear-pending';
            return (
              <TouchableOpacity
                key={routeId}
                style={[
                  styles.detourRow,
                  { borderLeftColor: routeColor },
                  isClearPending && styles.detourRowClearPending,
                ]}
                onPress={() => onPress?.(routeId)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Route ${getRouteName(routeId)} detour details`}
              >
                <View style={[styles.routeBadge, { backgroundColor: routeColor }]}>
                  <Text style={styles.routeBadgeText}>{getRouteName(routeId)}</Text>
                </View>
                <Text style={[styles.rowText, isClearPending && styles.rowTextClearPending]} numberOfLines={1}>
                  Route {getRouteName(routeId)} — {getStopCountText(routeId)}
                </Text>
                {isClearPending ? (
                  <Text style={styles.clearingLabel}>Clearing...</Text>
                ) : (
                  <Text style={styles.rowChevron}>›</Text>
                )}
              </TouchableOpacity>
            );
          })}
          {overflowCount > 0 && (
            <Text style={styles.overflowLink}>+{overflowCount} more</Text>
          )}
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
  collapsedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningSubtle,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: 44,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    cursor: 'pointer',
    gap: SPACING.sm,
  },
  collapsedText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    flex: 1,
  },
  inlineBadges: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  routeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
    minWidth: 28,
    alignItems: 'center',
  },
  routeBadgeText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  chevron: {
    fontSize: FONT_SIZES.xxs,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  expandedPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    marginTop: 2,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    overflow: 'hidden',
  },
  detourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderLeftWidth: 3,
    gap: SPACING.sm,
    minHeight: 44,
    cursor: 'pointer',
  },
  detourRowClearPending: {
    opacity: 0.5,
  },
  rowText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    flex: 1,
  },
  rowTextClearPending: {
    color: COLORS.textSecondary,
  },
  rowChevron: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
  clearingLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  overflowLink: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.medium,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    cursor: 'pointer',
  },
});

export default DetourAlertStrip;
```

**Step 2: Commit**

```bash
git add src/components/DetourAlertStrip.web.js
git commit -m "feat(detour): add DetourAlertStrip component (web)"
```

---

### Task 3: Wire DetourAlertStrip into HomeScreens (replace DetourBanner)

**Files:**
- Modify: `src/screens/HomeScreen.js:50,892-896` (swap import + render)
- Modify: `src/screens/HomeScreen.web.js:41,808-812` (swap import + render)

**Step 1: Update HomeScreen.js**

At line 50, change:
```js
// OLD
import DetourBanner from '../components/DetourBanner';
// NEW
import DetourAlertStrip from '../components/DetourAlertStrip';
```

At lines 892-896, change:
```jsx
// OLD
<DetourBanner
  activeDetours={activeDetours}
  onPress={setDetourSheetRouteId}
  alertBannerVisible={serviceAlerts && serviceAlerts.length > 0}
/>
// NEW
<DetourAlertStrip
  activeDetours={activeDetours}
  onPress={setDetourSheetRouteId}
  alertBannerVisible={serviceAlerts && serviceAlerts.length > 0}
  routes={routes}
/>
```

Note: The new component accepts a `routes` prop for route short names. `routes` is already available from TransitContext destructuring at line ~115.

**Step 2: Update HomeScreen.web.js**

At line 41, change:
```js
// OLD
import DetourBanner from '../components/DetourBanner';
// NEW
import DetourAlertStrip from '../components/DetourAlertStrip';
```

At lines 808-812, change:
```jsx
// OLD
<DetourBanner
  activeDetours={activeDetours}
  onPress={setDetourSheetRouteId}
  alertBannerVisible={serviceAlerts && serviceAlerts.length > 0}
/>
// NEW
<DetourAlertStrip
  activeDetours={activeDetours}
  onPress={setDetourSheetRouteId}
  alertBannerVisible={serviceAlerts && serviceAlerts.length > 0}
  routes={routes}
/>
```

`routes` is already available from TransitContext at line ~136.

**Step 3: Verify build**

Run: `npm test -- --passWithNoTests`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/screens/HomeScreen.js src/screens/HomeScreen.web.js
git commit -m "feat(detour): wire DetourAlertStrip into HomeScreens"
```

---

### Task 4: Replace ✕ text with Icon X in DetourDetailsSheet

**Files:**
- Modify: `src/components/DetourDetailsSheet.js:1,61` (add Icon import, replace ✕)
- Modify: `src/components/DetourDetailsSheet.web.js:1,95,107` (add Icon import, replace ✕ in close button + stop list)

**Step 1: Update native DetourDetailsSheet.js**

Add `Icon` import at the top (after line 4):
```js
import Icon from './Icon';
```

At line 61, replace:
```jsx
// OLD
<Text style={styles.stopIcon}>✕</Text>
// NEW
<Icon name="X" size={14} color={COLORS.error} />
```

Update the `stopRow` style (line 137-140) to accommodate the icon (the existing `marginRight: SPACING.sm` on the old `stopIcon` text style needs to be applied via a wrapper or gap). Add `gap: SPACING.sm` to `stopRow`:
```js
// OLD
stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
},
// NEW
stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
},
```

Remove the `stopIcon` style (lines 141-146) since it's no longer needed.

**Step 2: Update web DetourDetailsSheet.web.js**

Add `Icon` import at the top (after line 4):
```js
import Icon from './Icon';
```

At line 95, replace the close button:
```jsx
// OLD
<Text style={styles.closeIcon}>✕</Text>
// NEW
<Icon name="X" size={18} color={COLORS.textSecondary} />
```

At line 107, replace the stop icon:
```jsx
// OLD
<Text style={styles.stopIcon}>✕</Text>
// NEW
<Icon name="X" size={14} color={COLORS.error} />
```

Add `gap: SPACING.sm` to `stopRow` style (line 217-221):
```js
// OLD
stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
},
// NEW
stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
},
```

Remove `stopIcon` and `closeIcon` styles since they're no longer needed.

**Step 3: Run tests**

Run: `npm test -- --passWithNoTests`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/components/DetourDetailsSheet.js src/components/DetourDetailsSheet.web.js
git commit -m "feat(detour): replace ✕ text with Icon X in DetourDetailsSheet"
```

---

### Task 5: Dark mode color readiness in detour components

**Files:**
- Modify: `src/components/DetourDetailsSheet.js:85` (COLORS.white → COLORS.surface)
- Modify: `src/components/DetourDetailsSheet.web.js:146` (COLORS.white → COLORS.surface)

**Step 1: Update native DetourDetailsSheet.js**

Line 85, in `sheetBackground` style:
```js
// OLD
backgroundColor: COLORS.white,
// NEW
backgroundColor: COLORS.surface,
```

**Step 2: Update web DetourDetailsSheet.web.js**

Line 146, in `sheet` style:
```js
// OLD
backgroundColor: COLORS.white,
// NEW
backgroundColor: COLORS.surface,
```

Note: `COLORS.surface` is `#FFFFFF` in light mode (identical to `COLORS.white`) and `#1E1E1E` in dark mode, so this is a zero-visual-change swap that enables future dark mode.

**Step 3: Commit**

```bash
git add src/components/DetourDetailsSheet.js src/components/DetourDetailsSheet.web.js
git commit -m "refactor(detour): use COLORS.surface for dark mode readiness"
```

---

## Phase 2: Timeline + Details Sheet Enhancements

### Task 6: Create DetourTimeline sub-component

**Files:**
- Create: `src/components/DetourTimeline.js`
- Reference: `src/hooks/useAffectedStops.js` (returns `affectedStops`, `entryStopName`, `exitStopName`)

**Step 1: Create DetourTimeline.js**

This is a cross-platform component (no `.web.js` needed — pure View/Text, no native APIs).

```jsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';
import Icon from './Icon';

const DetourTimeline = ({ affectedStops, entryStopName, exitStopName }) => {
  if (!affectedStops || affectedStops.length === 0) {
    return (
      <View style={styles.pendingContainer}>
        <Icon name="Hourglass" size={16} color={COLORS.textSecondary} />
        <Text style={styles.pendingText}>Detecting affected stops...</Text>
      </View>
    );
  }

  // Stops between entry and exit (exclusive of entry/exit themselves) are skipped
  const skippedStops = affectedStops.length > 2
    ? affectedStops.slice(1, -1)
    : [];

  return (
    <View style={styles.container}>
      {/* Normal service node */}
      <View style={styles.nodeRow}>
        <View style={styles.nodeColumn}>
          <View style={[styles.dot, styles.greenDot]} />
          <View style={[styles.line, styles.greyLine]} />
        </View>
        <Text style={styles.normalText}>Normal service</Text>
      </View>

      {/* Entry node */}
      {entryStopName && (
        <View style={styles.nodeRow}>
          <View style={styles.nodeColumn}>
            <View style={[styles.dot, styles.orangeDiamond]} />
            <View style={[styles.line, styles.redLine]} />
          </View>
          <Text style={styles.entryExitText}>{entryStopName}</Text>
        </View>
      )}

      {/* Skipped stops */}
      {skippedStops.map((stop) => (
        <View key={stop.id} style={styles.nodeRow}>
          <View style={styles.nodeColumn}>
            <View style={styles.skipIconContainer}>
              <Icon name="X" size={12} color={COLORS.error} />
            </View>
            <View style={[styles.line, styles.redLine]} />
          </View>
          <Text style={styles.skippedText}>{stop.name}</Text>
        </View>
      ))}

      {/* Exit node */}
      {exitStopName && (
        <View style={styles.nodeRow}>
          <View style={styles.nodeColumn}>
            <View style={[styles.dot, styles.orangeDiamond]} />
            <View style={[styles.line, styles.greyLine]} />
          </View>
          <Text style={styles.entryExitText}>{exitStopName}</Text>
        </View>
      )}

      {/* Normal service resumes node */}
      <View style={styles.nodeRow}>
        <View style={styles.nodeColumn}>
          <View style={[styles.dot, styles.greenDot]} />
        </View>
        <Text style={styles.normalText}>Normal service resumes</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: SPACING.sm,
  },
  pendingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  pendingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 28,
  },
  nodeColumn: {
    width: 24,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  greenDot: {
    backgroundColor: COLORS.success,
  },
  orangeDiamond: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: COLORS.warning,
    transform: [{ rotate: '45deg' }],
  },
  skipIconContainer: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 12,
  },
  greyLine: {
    backgroundColor: COLORS.grey300,
  },
  redLine: {
    backgroundColor: COLORS.error,
  },
  normalText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
    paddingTop: 0,
  },
  entryExitText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    marginLeft: SPACING.sm,
  },
  skippedText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
    textDecorationLine: 'line-through',
  },
});

export default DetourTimeline;
```

**Step 2: Commit**

```bash
git add src/components/DetourTimeline.js
git commit -m "feat(detour): add DetourTimeline sub-component"
```

---

### Task 7: Add confidence chip and duration to DetourDetailsSheet header

**Files:**
- Modify: `src/components/DetourDetailsSheet.js:7-18,46-52` (header + time format)
- Modify: `src/components/DetourDetailsSheet.web.js:6-18,83-97` (header + time format)

**Step 1: Update formatDetourTime in both files**

Change from "Since X min ago" to "Active for X min":

In both `DetourDetailsSheet.js:7-18` and `DetourDetailsSheet.web.js:6-18`:
```js
// OLD
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

// NEW
function formatDetourTime(detectedAt) {
  if (!detectedAt) return null;
  const date = detectedAt instanceof Date ? detectedAt : new Date(detectedAt);
  if (isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 60) {
    return `Active for ${diffMin} min`;
  }
  const hours = Math.floor(diffMin / 60);
  return `Active for ${hours}h ${diffMin % 60}m`;
}
```

**Step 2: Add confidence chip helper**

Add this function after `formatDetourTime` in both files:

```js
function getConfidenceChip(confidence) {
  switch (confidence) {
    case 'high':
      return { label: 'Confirmed', color: COLORS.success, bgColor: COLORS.successSubtle };
    case 'medium':
      return { label: 'Detecting...', color: COLORS.warning, bgColor: COLORS.warningSubtle };
    default:
      return { label: 'Low confidence', color: COLORS.textSecondary, bgColor: COLORS.grey200 };
  }
}
```

**Step 3: Update header in native DetourDetailsSheet.js**

Replace the header section (lines 46-52) to include route badge + confidence chip:

```jsx
// OLD
<View style={styles.header}>
  <View style={[styles.routeDot, { backgroundColor: routeColor }]} />
  <View style={styles.headerText}>
    <Text style={styles.title}>Route {routeId} — Detour Active</Text>
    {timeLabel && <Text style={styles.timeLabel}>{timeLabel}</Text>}
  </View>
</View>

// NEW
<View style={styles.header}>
  <View style={[styles.routeBadge, { backgroundColor: routeColor }]}>
    <Text style={styles.routeBadgeText}>{routeId}</Text>
  </View>
  <View style={styles.headerText}>
    <Text style={styles.title}>Route {routeId} — Detour Active</Text>
    <View style={styles.headerMeta}>
      {timeLabel && <Text style={styles.timeLabel}>{timeLabel}</Text>}
      {detour?.confidence && (() => {
        const chip = getConfidenceChip(detour.confidence);
        return (
          <View style={[styles.confidenceChip, { backgroundColor: chip.bgColor }]}>
            <Text style={[styles.confidenceText, { color: chip.color }]}>{chip.label}</Text>
          </View>
        );
      })()}
    </View>
  </View>
</View>
```

Add these styles to the native stylesheet:
```js
routeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
    minWidth: 28,
    alignItems: 'center',
    marginRight: SPACING.md,
},
routeBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
},
headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 2,
},
confidenceChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.round,
},
confidenceText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
},
```

Remove the old `routeDot` style (lines 101-106) since it's replaced by `routeBadge`.

**Step 4: Update header in web DetourDetailsSheet.web.js**

Apply the same header changes as the native version (lines 83-97).

Add the same `routeBadge`, `routeBadgeText`, `headerMeta`, `confidenceChip`, `confidenceText` styles to the web stylesheet.

Remove the old `routeDot` style (lines 167-171).

**Step 5: Run tests**

Run: `npm test -- --passWithNoTests`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/components/DetourDetailsSheet.js src/components/DetourDetailsSheet.web.js
git commit -m "feat(detour): add confidence chip and duration to details header"
```

---

### Task 8: Wire DetourTimeline into DetourDetailsSheet

**Files:**
- Modify: `src/components/DetourDetailsSheet.js:56-68` (replace flat stop list with timeline)
- Modify: `src/components/DetourDetailsSheet.web.js:101-114` (replace flat stop list with timeline)

**Step 1: Update native DetourDetailsSheet.js**

Add import at top:
```js
import DetourTimeline from './DetourTimeline';
```

Change the component props to accept `entryStopName` and `exitStopName`:
```jsx
// OLD
const DetourDetailsSheet = ({ routeId, detour, affectedStops, onClose, onViewOnMap }) => {
// NEW
const DetourDetailsSheet = ({ routeId, detour, affectedStops, entryStopName, exitStopName, onClose, onViewOnMap }) => {
```

Replace lines 56-68 (the stops section):
```jsx
// OLD
{affectedStops && affectedStops.length > 0 ? (
  <View style={styles.stopsSection}>
    <Text style={styles.sectionHeader}>Skipped Stops</Text>
    {affectedStops.map((stop) => (
      <View key={stop.id} style={styles.stopRow}>
        <Icon name="X" size={14} color={COLORS.error} />
        <Text style={styles.stopName}>{stop.name}</Text>
      </View>
    ))}
  </View>
) : (
  <Text style={styles.emptyText}>Detour detected — stop details pending</Text>
)}

// NEW
<DetourTimeline
  affectedStops={affectedStops}
  entryStopName={entryStopName}
  exitStopName={exitStopName}
/>
```

Remove unused styles: `stopsSection`, `sectionHeader`, `stopRow`, `stopName`, `stopIcon`, `emptyText`.

**Step 2: Update web DetourDetailsSheet.web.js**

Same changes as native:
- Add `import DetourTimeline from './DetourTimeline';`
- Add `entryStopName`, `exitStopName` to props
- Replace lines 101-114 with `<DetourTimeline ... />`
- Remove unused styles

**Step 3: Update HomeScreen.js to pass new props**

At lines 1023-1043, pass `entryStopName` and `exitStopName` to the details sheet. The `useAffectedStops` hook at lines 308-314 already returns these values. Update the destructuring:

At line 308:
```js
// OLD
const { affectedStops } = useAffectedStops({
// NEW
const { affectedStops, entryStopName, exitStopName } = useAffectedStops({
```

At line 1027, add the new props:
```jsx
<DetourDetailsSheet
  routeId={detourSheetRouteId}
  detour={selectedDetour}
  affectedStops={affectedStops}
  entryStopName={entryStopName}
  exitStopName={exitStopName}
  onClose={() => setDetourSheetRouteId(null)}
  onViewOnMap={...}
/>
```

**Step 4: Update HomeScreen.web.js similarly**

At line 195:
```js
// OLD
const { affectedStops } = useAffectedStops({
// NEW
const { affectedStops, entryStopName, exitStopName } = useAffectedStops({
```

At line 1000-1001, add new props:
```jsx
  affectedStops={affectedStops}
  entryStopName={entryStopName}
  exitStopName={exitStopName}
```

**Step 5: Run tests**

Run: `npm test -- --passWithNoTests`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/components/DetourDetailsSheet.js src/components/DetourDetailsSheet.web.js \
  src/screens/HomeScreen.js src/screens/HomeScreen.web.js
git commit -m "feat(detour): wire DetourTimeline into DetourDetailsSheet"
```

---

## Phase 3: Animations + Map Integration

### Task 9: Pulsing detour dot animation on route chips

**Files:**
- Modify: `src/components/HomeScreenControls.js:1-2,161-167,222-232`

**Step 1: Add Animated import and pulsing logic**

At line 2, add `Animated` to the import:
```js
// OLD
import { View, Text, StyleSheet, TouchableOpacity, Platform, LayoutAnimation, UIManager } from 'react-native';
// NEW
import { View, Text, StyleSheet, TouchableOpacity, Platform, LayoutAnimation, UIManager, Animated } from 'react-native';
```

Add a pulsing dot sub-component inside the file (before the `HomeScreenControls` component):

```jsx
const PulsingDetourDot = () => {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [scaleAnim]);

  return (
    <Animated.View
      accessible={true}
      accessibilityLabel="Route is on detour"
      style={[
        styles.detourDot,
        { transform: [{ scale: scaleAnim }] },
      ]}
    />
  );
};
```

**Step 2: Replace static dot with pulsing dot**

At lines 161-167, replace:
```jsx
// OLD
{isRouteDetouring?.(r.id) && (
    <View
        accessible={true}
        accessibilityLabel={`Route ${r.shortName} is on detour`}
        style={styles.detourDot}
    />
)}
// NEW
{isRouteDetouring?.(r.id) && <PulsingDetourDot />}
```

**Step 3: Run tests**

Run: `npm test -- --passWithNoTests`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/components/HomeScreenControls.js
git commit -m "feat(detour): add pulsing animation to detour dot on route chips"
```

---

### Task 10: Add midpoint labels to DetourOverlay (native)

**Files:**
- Modify: `src/components/DetourOverlay.js` (add "Skipped" / "Detour route" labels)

**Step 1: Add label rendering to native overlay**

Add a helper to compute the midpoint of a polyline array. Add label Views as `PointAnnotation` children at midpoints.

After the existing imports (line 14):
```js
import { Text } from 'react-native';
```

Add midpoint helper:
```js
const getMidpoint = (polyline) => {
  if (!polyline || polyline.length < 2) return null;
  const mid = Math.floor(polyline.length / 2);
  const p = polyline[mid];
  return p?.latitude != null && p?.longitude != null ? p : null;
};
```

After the exit marker (line 83), add label annotations:
```jsx
{skippedSegmentPolyline?.length >= 2 && (() => {
  const mid = getMidpoint(skippedSegmentPolyline);
  return mid ? (
    <MapLibreGL.PointAnnotation
      id={`detour-label-skipped-${routeId}`}
      coordinate={[mid.longitude, mid.latitude]}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View style={styles.labelPill}>
        <Text style={styles.labelSkippedText}>Skipped</Text>
      </View>
    </MapLibreGL.PointAnnotation>
  ) : null;
})()}
{inferredDetourPolyline?.length >= 2 && (() => {
  const mid = getMidpoint(inferredDetourPolyline);
  return mid ? (
    <MapLibreGL.PointAnnotation
      id={`detour-label-path-${routeId}`}
      coordinate={[mid.longitude, mid.latitude]}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View style={styles.labelPillOrange}>
        <Text style={styles.labelDetourText}>Detour route</Text>
      </View>
    </MapLibreGL.PointAnnotation>
  ) : null;
})()}
```

Add label styles:
```js
labelPill: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
},
labelSkippedText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
},
labelPillOrange: {
    backgroundColor: '#f97316',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
},
labelDetourText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
},
```

**Step 2: Commit**

```bash
git add src/components/DetourOverlay.js
git commit -m "feat(detour): add midpoint labels to native DetourOverlay"
```

---

### Task 11: Add midpoint labels to DetourOverlay (web)

**Files:**
- Modify: `src/components/DetourOverlay.web.js` (add Tooltip/label markers at midpoints)

**Step 1: Add label rendering to web overlay**

For Leaflet, use `Tooltip` from react-leaflet to add labels at midpoints.

Add import:
```js
import { CircleMarker, Tooltip } from 'react-leaflet';
```

Add midpoint helper (same as native):
```js
const getMidpoint = (polyline) => {
  if (!polyline || polyline.length < 2) return null;
  const mid = Math.floor(polyline.length / 2);
  const p = polyline[mid];
  return p?.latitude != null && p?.longitude != null ? p : null;
};
```

After the exit marker (line 78), add label markers:
```jsx
{skippedSegmentPolyline?.length >= 2 && (() => {
  const mid = getMidpoint(skippedSegmentPolyline);
  return mid ? (
    <CircleMarker
      center={[mid.latitude, mid.longitude]}
      radius={0}
      interactive={false}
    >
      <Tooltip permanent direction="center" className="detour-label-skipped">
        Skipped
      </Tooltip>
    </CircleMarker>
  ) : null;
})()}
{inferredDetourPolyline?.length >= 2 && (() => {
  const mid = getMidpoint(inferredDetourPolyline);
  return mid ? (
    <CircleMarker
      center={[mid.latitude, mid.longitude]}
      radius={0}
      interactive={false}
    >
      <Tooltip permanent direction="center" className="detour-label-detour">
        Detour route
      </Tooltip>
    </CircleMarker>
  ) : null;
})()}
```

Note: CSS classes `detour-label-skipped` and `detour-label-detour` will need to be added to the app's global styles. Add to `public/index.html` or the web stylesheet:
```css
.detour-label-skipped .leaflet-tooltip-pane .leaflet-tooltip,
.detour-label-skipped {
  background: #ef4444;
  color: white;
  border: none;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 8px;
  box-shadow: none;
}
.detour-label-detour {
  background: #f97316;
  color: white;
  border: none;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 8px;
  box-shadow: none;
}
```

**Step 2: Commit**

```bash
git add src/components/DetourOverlay.web.js
git commit -m "feat(detour): add midpoint labels to web DetourOverlay"
```

---

### Task 12: Banner collapse/expand animation

**Files:**
- Modify: `src/components/DetourAlertStrip.js` (add LayoutAnimation to expand/collapse)
- Modify: `src/components/DetourAlertStrip.web.js` (same)

**Step 1: Add LayoutAnimation to native**

In `DetourAlertStrip.js`, add to imports:
```js
import { View, Text, StyleSheet, TouchableOpacity, Platform, LayoutAnimation, UIManager } from 'react-native';
```

Add at top level:
```js
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
```

Update `toggleExpand`:
```js
const toggleExpand = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded((prev) => !prev);
}, []);
```

**Step 2: Add LayoutAnimation to web**

Same import and LayoutAnimation changes in `DetourAlertStrip.web.js`.

Note: On web, `LayoutAnimation` is a no-op in react-native-web but is harmless to call. For actual web animation, CSS transitions handle it via the existing layout change.

**Step 3: Commit**

```bash
git add src/components/DetourAlertStrip.js src/components/DetourAlertStrip.web.js
git commit -m "feat(detour): add expand/collapse animation to alert strip"
```

---

### Task 13: Auto-collapse timer for expanded banner

**Files:**
- Modify: `src/components/DetourAlertStrip.js` (add useEffect timer)
- Modify: `src/components/DetourAlertStrip.web.js` (same)

**Step 1: Add auto-collapse in both files**

Add `useEffect` and `useRef` to imports. After the `toggleExpand` callback, add:

```js
// Auto-collapse after 10 seconds of inactivity
const collapseTimerRef = useRef(null);

useEffect(() => {
  if (isExpanded) {
    collapseTimerRef.current = setTimeout(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setIsExpanded(false);
    }, 10000);
  }
  return () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
    }
  };
}, [isExpanded]);
```

Add `useEffect` and `useRef` to the React import at the top of each file.

**Step 2: Commit**

```bash
git add src/components/DetourAlertStrip.js src/components/DetourAlertStrip.web.js
git commit -m "feat(detour): auto-collapse alert strip after 10s inactivity"
```

---

### Task 14: Final Phase 3 — run all tests and commit

**Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass (327+ tests)

**Step 2: Verify web dev build**

Run: `npx expo export --platform web --output-dir /tmp/detour-build-check 2>&1 | head -5`
Expected: No build errors

**Step 3: Final commit if any uncommitted changes remain**

```bash
git status
# If clean, skip. If any uncommitted changes:
git add -A
git commit -m "chore(detour): final polish and cleanup"
```

---

## Summary of All Files

| File | Change | Phase |
|------|--------|-------|
| `src/components/DetourAlertStrip.js` | **New** | 1 |
| `src/components/DetourAlertStrip.web.js` | **New** | 1 |
| `src/components/DetourBanner.js` | **Replaced** (no longer imported) | 1 |
| `src/components/DetourBanner.web.js` | **Replaced** (no longer imported) | 1 |
| `src/components/DetourDetailsSheet.js` | **Major modify** | 1-2 |
| `src/components/DetourDetailsSheet.web.js` | **Major modify** | 1-2 |
| `src/components/DetourTimeline.js` | **New** | 2 |
| `src/components/DetourOverlay.js` | **Minor modify** (labels) | 3 |
| `src/components/DetourOverlay.web.js` | **Minor modify** (labels) | 3 |
| `src/components/HomeScreenControls.js` | **Minor modify** (pulse) | 3 |
| `src/screens/HomeScreen.js` | **Minor modify** (swap import + props) | 1-2 |
| `src/screens/HomeScreen.web.js` | **Minor modify** (swap import + props) | 1-2 |
