# UI Polish Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 10 UI polish improvements to bring the app from 7.5/10 to 8.5+ perceived smoothness.

**Architecture:** Each improvement is self-contained. Changes hit shared hooks/context (both platforms), native screens, and web counterparts. Dark mode requires a theme provider wrapper. Vehicle diffing is a performance optimization in TransitContext. All other changes are localized to individual files.

**Tech Stack:** React Native, react-native-reanimated, @react-navigation/native-stack, Animated API, LayoutAnimation, expo-location

---

## Task 1: Animated Alert Accordion (AlertsScreen.js)

**Files:**
- Modify: `src/screens/AlertsScreen.js`

**Step 1: Add LayoutAnimation import**

At the top of `AlertsScreen.js`, add `LayoutAnimation` to the react-native import:

```js
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
```

**Step 2: Enable LayoutAnimation on Android**

Add this block right after the imports (before the component):

```js
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
```

**Step 3: Animate the expand/collapse toggle**

In the `renderAlert` function, replace line 54:
```js
onPress={() => setExpandedId(isExpanded ? null : item.id)}
```

With:
```js
onPress={() => {
  LayoutAnimation.configureNext(LayoutAnimation.create(
    250,
    LayoutAnimation.Types.easeInEaseOut,
    LayoutAnimation.Properties.opacity,
  ));
  setExpandedId(isExpanded ? null : item.id);
}}
```

**Step 4: Replace text chevron with animated rotation**

Replace line 69:
```js
<Text style={styles.chevron}>{isExpanded ? '▼' : '▶'}</Text>
```

With:
```js
<Text style={[styles.chevron, isExpanded && styles.chevronExpanded]}>▶</Text>
```

Add to styles:
```js
chevronExpanded: {
  transform: [{ rotate: '90deg' }],
},
```

**Step 5: Build and verify**

Run: `npx expo start` — open AlertsScreen, tap an alert. Should see smooth height animation + chevron rotation.

**Step 6: Commit**

```
feat: add animated accordion to AlertsScreen
```

---

## Task 2: Map Loading Skeleton (HomeScreen.js)

**Files:**
- Modify: `src/screens/HomeScreen.js` (lines 784-790)

**Step 1: Import LoadingSkeleton**

Add to HomeScreen.js imports:
```js
import LoadingSkeleton from '../components/LoadingSkeleton';
```

**Step 2: Replace inline loading banner with skeleton overlay**

Replace the loading banner block (lines 784-790):
```js
{isLoadingStatic && (
  <View style={styles.loadingBanner}>
    <PulsingSpinner size={18} />
    <Text style={styles.loadingBannerText}>Loading transit data...</Text>
  </View>
)}
```

With a richer overlay:
```js
{isLoadingStatic && (
  <View style={styles.loadingOverlay}>
    <View style={styles.loadingCard}>
      <PulsingSpinner size={24} />
      <View style={styles.loadingCardContent}>
        <Text style={styles.loadingCardTitle}>Loading transit data...</Text>
        <View style={styles.loadingSkeletonRow}>
          <LoadingSkeleton width={120} height={12} style={{ marginRight: SPACING.sm }} />
          <LoadingSkeleton width={80} height={12} />
        </View>
        <LoadingSkeleton width={200} height={8} style={{ marginTop: SPACING.xs }} />
      </View>
    </View>
  </View>
)}
```

**Step 3: Add styles**

Add to the StyleSheet:
```js
loadingOverlay: {
  position: 'absolute',
  top: Platform.OS === 'android' ? Constants.statusBarHeight + 140 : 140,
  left: SPACING.md,
  right: SPACING.md,
  zIndex: 10,
},
loadingCard: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: COLORS.surface,
  borderRadius: BORDER_RADIUS.lg,
  padding: SPACING.lg,
  ...SHADOWS.medium,
},
loadingCardContent: {
  flex: 1,
  marginLeft: SPACING.md,
},
loadingCardTitle: {
  fontSize: FONT_SIZES.md,
  fontWeight: '600',
  color: COLORS.textPrimary,
  marginBottom: SPACING.sm,
},
loadingSkeletonRow: {
  flexDirection: 'row',
},
```

**Step 4: Remove old loadingBanner styles if they exist and are now unused.**

**Step 5: Build and verify**

Run: `npx expo start` — clear cache, reload. Should see a card with skeleton shimmer during GTFS fetch.

**Step 6: Commit**

```
feat: add skeleton loading card during GTFS data fetch
```

---

## Task 3: Vehicle Position Diffing (TransitContext.js)

**Files:**
- Modify: `src/context/TransitContext.js` (lines 281-296)

**Step 1: Add a ref for previous vehicles**

After `vehicleIntervalRef` (line 90), add:
```js
const prevVehiclesRef = useRef([]);
```

**Step 2: Add diff utility function**

Add this helper inside TransitProvider, before `loadVehiclePositions`:
```js
const diffVehicles = useCallback((newVehicles, prevVehicles) => {
  if (prevVehicles.length === 0) return newVehicles;

  const prevMap = new Map(prevVehicles.map(v => [v.id, v]));
  let hasChanges = false;

  const merged = newVehicles.map(v => {
    const prev = prevMap.get(v.id);
    if (prev &&
        prev.coordinate?.latitude === v.coordinate?.latitude &&
        prev.coordinate?.longitude === v.coordinate?.longitude &&
        prev.bearing === v.bearing &&
        prev.routeId === v.routeId) {
      return prev; // Same reference — React.memo skips re-render
    }
    hasChanges = true;
    return v;
  });

  if (!hasChanges && merged.length === prevVehicles.length) {
    return prevVehicles; // Identical — skip setState entirely
  }

  return merged;
}, []);
```

**Step 3: Update loadVehiclePositions to use diff**

Replace lines 286-288:
```js
const rawVehicles = await fetchVehiclePositions();
const formattedVehicles = formatVehiclesForMap(rawVehicles, tripMapping);
setVehicles(formattedVehicles);
```

With:
```js
const rawVehicles = await fetchVehiclePositions();
const formattedVehicles = formatVehiclesForMap(rawVehicles, tripMapping);
const diffed = diffVehicles(formattedVehicles, prevVehiclesRef.current);
if (diffed !== prevVehiclesRef.current) {
  prevVehiclesRef.current = diffed;
  setVehicles(diffed);
}
```

**Step 4: Build and verify**

Run: `npx expo start` — map should still show buses, but console should show fewer re-renders if you add a debug log in BusMarker.

**Step 5: Commit**

```
perf: diff vehicle positions to skip unchanged marker re-renders
```

---

## Task 4: Stack Screen Transitions (TabNavigator.js)

**Files:**
- Modify: `src/navigation/TabNavigator.js`

**Step 1: Import transition utilities**

Replace line 3:
```js
import { createNativeStackNavigator } from '@react-navigation/native-stack';
```

With:
```js
import { createNativeStackNavigator } from '@react-navigation/native-stack';
```

Note: `createNativeStackNavigator` already has built-in slide animations on iOS and fade on Android. The issue is `headerShown: false` disables some default transitions. We need to add `animation` options.

**Step 2: Add animation to MapStack screens**

Replace the MapStack (lines 50-64):
```js
const MapStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="MapMain" component={HomeScreen} />
    <Stack.Screen name="NearbyStops" component={NearbyStopsScreen} options={{ animation: 'slide_from_bottom' }} />
    <Stack.Screen name="Alerts" component={AlertsScreen} options={{ animation: 'slide_from_bottom' }} />
    <Stack.Screen name="TripDetails" component={TripDetailsScreen} />
    <Stack.Screen
      name="Navigation"
      component={NavigationScreen}
      options={{
        presentation: 'fullScreenModal',
        gestureEnabled: false,
        animation: 'fade',
      }}
    />
  </Stack.Navigator>
);
```

**Step 3: Add animation to ProfileStack screens**

Replace the ProfileStack (lines 67-79):
```js
const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="ProfileMain" component={ProfileScreen} />
    <Stack.Screen name="SignIn" component={SignInScreen} options={{ animation: 'slide_from_bottom' }} />
    <Stack.Screen name="SignUp" component={SignUpScreen} options={{ animation: 'slide_from_bottom' }} />
    <Stack.Screen name="Favorites" component={FavoritesScreen} />
    <Stack.Screen name="Settings" component={SettingsScreen} />
    <Stack.Screen name="News" component={NewsScreen} />
    <Stack.Screen name="Survey" component={SurveyScreen} />
    <Stack.Screen name="SurveyResults" component={SurveyResultsScreen} />
  </Stack.Navigator>
);
```

**Step 4: Build and verify**

Run: `npx expo start` — navigate between screens. Should see slide-from-right for push, slide-from-bottom for modals like NearbyStops/Alerts, fade for Navigation.

**Step 5: Commit**

```
feat: add screen transition animations to navigation stacks
```

---

## Task 5: Navigation GPS Loading State (NavigationScreen.js)

**Files:**
- Modify: `src/screens/NavigationScreen.js`

**Step 1: Import PulsingSpinner**

Add to imports (after existing imports around line 36):
```js
import PulsingSpinner from '../components/PulsingSpinner';
```

**Step 2: Track GPS acquisition state**

After the `useNavigationLocation()` hook call (around line 127), add:
```js
const [isAcquiringGPS, setIsAcquiringGPS] = useState(true);
```

**Step 3: Clear GPS loading when first location arrives**

Add a useEffect after the isAcquiringGPS state (around the same area):
```js
useEffect(() => {
  if (userLocation) {
    setIsAcquiringGPS(false);
  }
}, [userLocation]);
```

**Step 4: Auto-start tracking**

Add a useEffect to start tracking on mount:
```js
useEffect(() => {
  startTracking();
}, [startTracking]);
```

**Step 5: Add GPS overlay in the render**

After the map `</View>` closing tag (after line 635 area), before the NavigationHeader, add:
```js
{/* GPS acquisition overlay */}
{isAcquiringGPS && (
  <View style={styles.gpsOverlay}>
    <View style={styles.gpsCard}>
      <PulsingSpinner size={28} />
      <Text style={styles.gpsText}>Acquiring GPS signal...</Text>
      <Text style={styles.gpsSubtext}>Move to an open area for better signal</Text>
    </View>
  </View>
)}
```

**Step 6: Add styles**

Add to NavigationScreen styles:
```js
gpsOverlay: {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: 'rgba(0, 0, 0, 0.4)',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 100,
},
gpsCard: {
  backgroundColor: COLORS.surface,
  borderRadius: BORDER_RADIUS.xl,
  padding: SPACING.xl,
  alignItems: 'center',
  maxWidth: 280,
  ...SHADOWS.large,
},
gpsText: {
  fontSize: FONT_SIZES.lg,
  fontWeight: '600',
  color: COLORS.textPrimary,
  marginTop: SPACING.md,
},
gpsSubtext: {
  fontSize: FONT_SIZES.sm,
  color: COLORS.textSecondary,
  marginTop: SPACING.xs,
  textAlign: 'center',
},
```

**Step 7: Build and verify**

Run: `npx expo start` — start navigation. Should see GPS overlay that dismisses once location is acquired.

**Step 8: Commit**

```
feat: add GPS acquisition overlay to NavigationScreen
```

---

## Task 6: Dark Mode Theme Support

**Files:**
- Modify: `src/config/theme.js`
- Create: `src/context/ThemeContext.js`
- Modify: `App.js` (or root layout) — wrap with ThemeProvider

**Step 1: Define dark color palette in theme.js**

Add after the existing `COLORS` object (after line 75):
```js
export const COLORS_DARK = {
  primary: '#66BB6A',
  primaryLight: '#81C784',
  primaryDark: '#4CAF50',
  primarySubtle: '#1B3A1D',

  secondary: '#42A5F5',
  secondaryLight: '#64B5F6',
  secondaryDark: '#1E88E5',
  secondarySubtle: '#0D2744',

  accent: '#FFB74D',
  accentLight: '#FFCC02',
  accentDark: '#FFA726',
  accentSubtle: '#3D2E0A',

  success: '#66BB6A',
  successSubtle: '#1B3A1D',
  warning: '#FFB74D',
  warningSubtle: '#3D2E0A',
  error: '#EF5350',
  errorSubtle: '#3D1414',
  info: '#42A5F5',
  infoSubtle: '#0D2744',

  white: '#FFFFFF',
  black: '#E0E0E0',
  grey50: '#1A1A1A',
  grey100: '#212121',
  grey200: '#2C2C2C',
  grey300: '#383838',
  grey400: '#5C5C5C',
  grey500: '#8A8A8A',
  grey600: '#AAAAAA',
  grey700: '#C0C0C0',
  grey800: '#D6D6D6',
  grey900: '#EEEEEE',

  background: '#121212',
  surface: '#1E1E1E',
  surfaceElevated: '#252525',
  surfaceHover: '#2C2C2C',
  surfacePressed: '#333333',

  textPrimary: '#EEEEEE',
  textSecondary: '#AAAAAA',
  textDisabled: '#666666',
  textInverse: '#121212',
  textBrand: '#66BB6A',

  border: '#383838',
  borderLight: '#2C2C2C',
  borderFocus: '#66BB6A',

  realtime: '#66BB6A',
  scheduled: '#8A8A8A',
  delayed: '#EF5350',

  glassWhite: 'rgba(30, 30, 30, 0.95)',
  glassDark: 'rgba(238, 238, 238, 0.8)',
};
```

**Step 2: Create ThemeContext**

Create `src/context/ThemeContext.js`:
```js
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS as COLORS_LIGHT, COLORS_DARK } from '../config/theme';

const ThemeContext = createContext(null);

const THEME_STORAGE_KEY = '@bttp_theme_preference';

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState('system'); // 'system' | 'light' | 'dark'
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(stored => {
      if (stored) setPreference(stored);
      setIsLoaded(true);
    }).catch(() => setIsLoaded(true));
  }, []);

  const isDark = preference === 'system'
    ? systemScheme === 'dark'
    : preference === 'dark';

  const colors = isDark ? COLORS_DARK : COLORS_LIGHT;

  const setThemePreference = useCallback(async (pref) => {
    setPreference(pref);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, pref);
  }, []);

  const value = {
    isDark,
    colors,
    preference,
    setThemePreference,
  };

  if (!isLoaded) return null;

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
```

**Step 3: Wrap App with ThemeProvider**

In the root `App.js` (or equivalent), wrap the app:
```js
import { ThemeProvider } from './src/context/ThemeContext';

// Wrap existing providers:
<ThemeProvider>
  {/* existing TransitProvider, AuthProvider, NavigationContainer, etc. */}
</ThemeProvider>
```

**Step 4: Add theme toggle to SettingsScreen**

Add a "Theme" setting with three options: System, Light, Dark. Use `useTheme()` hook to read/write preference.

**Step 5: Build and verify**

Run: `npx expo start` — toggle dark mode in system settings OR in app settings. Colors should invert cleanly.

**Note:** Full dark mode adoption across all screens requires incrementally replacing `COLORS.xxx` references with `colors.xxx` from `useTheme()` in each screen. This task sets up the infrastructure; screen-by-screen migration can be done incrementally.

**Step 6: Commit**

```
feat: add dark mode infrastructure with ThemeContext and dark palette
```

---

## Task 7: Search Typing Indicator (useTripPlanner.js)

**Files:**
- Modify: `src/hooks/useTripPlanner.js`

**Step 1: Add typing state to reducer**

Add two new action types after the existing ones (after line 34):
```js
const SET_FROM_TYPING = 'SET_FROM_TYPING';
const SET_TO_TYPING = 'SET_TO_TYPING';
```

Add to initialState (after `showToSuggestions: false`):
```js
isTypingFrom: false,
isTypingTo: false,
```

Add cases to the reducer (inside the switch, before `default`):
```js
case SET_FROM_TYPING:
  return { ...state, isTypingFrom: action.payload };
case SET_TO_TYPING:
  return { ...state, isTypingTo: action.payload };
```

**Step 2: Set typing=true immediately, clear on results**

In `searchFromAddress` (line 218), after the `if (text.length < 3)` block but before the setTimeout, add:
```js
dispatch({ type: SET_FROM_TYPING, payload: true });
```

Inside the setTimeout callback, after results are dispatched (after `dispatch({ type: SHOW_FROM_SUGGESTIONS ... })`), add:
```js
dispatch({ type: SET_FROM_TYPING, payload: false });
```

Also in the catch block:
```js
dispatch({ type: SET_FROM_TYPING, payload: false });
```

And inside the early return when `text.length < 3`:
```js
dispatch({ type: SET_FROM_TYPING, payload: false });
```

Repeat the same pattern for `searchToAddress` with `SET_TO_TYPING`.

**Step 3: Export the new state**

The `state` object is already returned from the hook. `state.isTypingFrom` and `state.isTypingTo` are now available to consumers.

**Step 4: Update TripSearchHeader to show typing indicator**

In `TripSearchHeader.js` (and `.web.js`), when rendering suggestion lists, show a small "Searching..." text or ActivityIndicator when `state.isTypingFrom` / `state.isTypingTo` is true and no suggestions are shown yet.

This is consumer-side UI — just check for `state.isTypingFrom` and render:
```js
{state.isTypingFrom && state.fromSuggestions.length === 0 && (
  <View style={styles.typingIndicator}>
    <ActivityIndicator size="small" color={COLORS.primary} />
    <Text style={styles.typingText}>Searching...</Text>
  </View>
)}
```

**Step 5: Build and verify**

Run: `npx expo start` — enter trip planning mode, type an address. Should see "Searching..." during debounce window.

**Step 6: Commit**

```
feat: add typing indicator during address autocomplete debounce
```

---

## Task 8: Web Bottom Sheet Smooth Transitions (TripBottomSheet.web.js)

**Files:**
- Modify: `src/components/TripBottomSheet.web.js`

**Step 1: Add CSS transition to container height**

In `TripBottomSheet.web.js`, the container uses `getSheetHeight()` which returns a string like `'42%'`. The issue is no transition when height changes.

Find the container style in the render (around line 198):
```js
<View style={[styles.container, { height: getSheetHeight() }]}>
```

Replace with:
```js
<View style={[styles.container, { height: getSheetHeight(), transition: 'height 0.3s ease-in-out' }]}>
```

**Note:** React Native Web supports the `transition` CSS property directly in style objects.

**Step 2: Verify the styles.container has overflow hidden**

In the StyleSheet, ensure `container` has:
```js
container: {
  // ... existing styles
  overflow: 'hidden',
},
```

**Step 3: Build and verify**

Run: `npm run web:dev` — open trip planner, toggle sheet state. Height should animate smoothly.

**Step 4: Commit**

```
feat: add smooth height transitions to web TripBottomSheet
```

---

## Task 9: useTripVisualization useCallback Optimization

**Files:**
- Modify: `src/hooks/useTripVisualization.js`

**Step 1: Wrap snapToPolyline in useCallback**

This function is currently a module-level pure function (line 12-18). It's already efficient since it's not recreated per render. **No change needed** — this is correctly implemented as a static helper.

**Step 2: Verify memoization dependencies are stable**

Review the dependency arrays:
- `decodedLegPolylines` depends on `[selectedItinerary]` — correct
- `tripRouteCoordinates` depends on `[selectedItinerary, decodedLegPolylines]` — correct
- `tripMarkers` depends on `[selectedItinerary]` — correct
- `intermediateStopMarkers` depends on `[selectedItinerary, decodedLegPolylines]` — correct
- `boardingAlightingMarkers` depends on `[selectedItinerary, decodedLegPolylines]` — correct
- `tripVehicles` depends on `[selectedItinerary, vehicles]` — correct

All dependency arrays are tight and reference-stable. **This hook is already well-optimized.**

**Step 3: Add one micro-optimization — early return guard on tripVehicles**

The `tripVehicles` memo (line 181) iterates all vehicles. Add a length check:

Replace:
```js
const tripVehicles = useMemo(() => {
  if (!selectedItinerary) return [];
```

With:
```js
const tripVehicles = useMemo(() => {
  if (!selectedItinerary || vehicles.length === 0) return [];
```

**Step 4: Build and verify**

Run: `npx expo start` — trip planning should work identically.

**Step 5: Commit**

```
perf: add early-exit guard to tripVehicles memoization
```

---

## Task 10: SearchScreen Address Typing Indicator

**Files:**
- Modify: `src/screens/SearchScreen.js`

**Step 1: Add typing indicator in address search results area**

SearchScreen already has `addressLoading` state (line 28) that is set `true` immediately when debounce starts (line 47) and cleared when results arrive (line 61).

Find where address results are rendered. After the search type tabs and before the FlatList results, add a visual indicator when `addressLoading` is true and the search type is 'addresses':

```js
{searchType === 'addresses' && addressLoading && (
  <View style={styles.searchingIndicator}>
    <ActivityIndicator size="small" color={COLORS.primary} />
    <Text style={styles.searchingText}>Searching addresses...</Text>
  </View>
)}
```

**Step 2: Add styles**

```js
searchingIndicator: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: SPACING.md,
  gap: SPACING.sm,
},
searchingText: {
  fontSize: FONT_SIZES.sm,
  color: COLORS.textSecondary,
},
```

**Step 3: Build and verify**

Run: `npx expo start` — go to Search tab, switch to "addresses", type. Should see "Searching addresses..." during debounce.

**Step 4: Commit**

```
feat: add searching indicator to SearchScreen address autocomplete
```

---

## Summary & Commit Order

| # | Task | Risk | Platform |
|---|------|------|----------|
| 1 | Alert accordion animation | Low | Native |
| 2 | Map loading skeleton | Low | Native |
| 3 | Vehicle position diffing | Medium | Both |
| 4 | Stack screen transitions | Low | Native |
| 5 | Navigation GPS overlay | Low | Native |
| 6 | Dark mode infrastructure | Medium | Both |
| 7 | Trip planner typing indicator | Low | Both |
| 8 | Web bottom sheet transitions | Low | Web |
| 9 | useTripVisualization optimization | Low | Both |
| 10 | SearchScreen typing indicator | Low | Native |

**Recommended execution order:** 9, 1, 4, 10, 7, 2, 5, 8, 3, 6

Start with lowest-risk, highest-confidence tasks. Dark mode (6) is last because it's infrastructure-only — full screen migration is a follow-up.
