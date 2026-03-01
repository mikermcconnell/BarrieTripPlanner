# Navigation Enterprise Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring NavigationScreen to enterprise-level quality with 9 improvements: error fix, SVG arrows, walking fallback, progress bar, step overview, trip completion, polyline dimming, stop names, tab bar fix.

**Architecture:** Each task is an independent component change. No shared state changes between tasks. All improvements modify existing navigation components or create new ones in `src/components/navigation/`. Both `.js` and `.web.js` platform files must be updated where noted.

**Tech Stack:** React Native, react-native-svg, Expo, MapLibre (native), Leaflet (web), Animated API

---

### Task 1: Fix Error Leaking to UI

The error "Walking directions error: TypeError: Network re..." is caused by `logger.error()` at `src/services/walkingService.js:130`. In React Native dev mode, `console.error` (which `logger.error` calls) triggers the LogBox red banner at the bottom of the screen. Since walking direction failures have a graceful fallback already, this should be `logger.warn` not `logger.error`.

**Files:**
- Modify: `src/services/walkingService.js:130`

**Step 1: Fix the log level**

Change line 130 from `logger.error` to `logger.warn`:

```js
// Before (line 130):
logger.error('Walking directions error:', error);

// After:
logger.warn('Walking directions failed, using fallback:', error.message || error);
```

This is safe because line 131 already returns `getFallbackDirections(...)` — the error is handled. Using `logger.warn` prevents LogBox from showing a red banner while still logging for debugging.

**Step 2: Verify no other error surfaces**

Search for any other `logger.error` calls in walkingService that could trigger the banner:

Run: `grep -n "logger.error" src/services/walkingService.js`

The only hit should be the line we just changed. The `clearWalkingCache` error at line 484 is unrelated.

**Step 3: Commit**

```bash
git add src/services/walkingService.js
git commit -m "fix: downgrade walking directions error to warn to prevent UI banner"
```

---

### Task 2: Replace Emoji Arrows with Geometric SVG Icons

Create clean, bold SVG direction arrow components using `react-native-svg` (already installed). These replace the unicode emoji arrows in `WalkingInstructionCard.js`.

**Files:**
- Create: `src/components/navigation/DirectionArrows.js`
- Modify: `src/components/navigation/WalkingInstructionCard.js:10-53,93-94,116-118,170-178`

**Step 1: Create DirectionArrows.js**

Create `src/components/navigation/DirectionArrows.js` with 10 SVG arrow components. Each is a function component accepting `size` and `color` props, rendering inside a `react-native-svg` `<Svg>` with `viewBox="0 0 24 24"`. All use `strokeLinecap="round"` and `strokeLinejoin="round"` for clean appearance.

Arrow components to create:
- `ArrowStraight` — bold upward arrow (like ↑)
- `ArrowLeft` — 90° left turn arrow
- `ArrowRight` — 90° right turn arrow
- `ArrowSharpLeft` — tight left hairpin
- `ArrowSharpRight` — tight right hairpin
- `ArrowSlightLeft` — gentle left curve
- `ArrowSlightRight` — gentle right curve
- `ArrowUturn` — U-turn loop
- `ArrowArrive` — checkmark inside circle
- `ArrowDepart` — upward arrow with dot at base

Export a `getDirectionIcon` function that maps `(type, modifier)` to the correct component (same signature as existing `getDirectionArrow`).

```js
import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

const ArrowStraight = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 4L12 20" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    <Path d="M6 10L12 4L18 10" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ArrowLeft = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 20V12H4" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M9 7L4 12L9 17" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ArrowRight = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 20V12H20" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M15 7L20 12L15 17" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ArrowSharpLeft = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M14 20V10H5" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M9 6L5 10L9 14" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ArrowSharpRight = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M10 20V10H19" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M15 6L19 10L15 14" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ArrowSlightLeft = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M14 20V14C14 11 12 9 9 7" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M13 4L9 7L13 10" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ArrowSlightRight = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M10 20V14C10 11 12 9 15 7" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M11 4L15 7L11 10" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ArrowUturn = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M8 20V10C8 6.68 10.69 4 14 4C17.31 4 20 6.68 20 10V14" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M4 14L8 10L12 14" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ArrowArrive = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
    <Path d="M8 12L11 15L16 9" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ArrowDepart = ({ size = 24, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 6L12 18" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    <Path d="M7 11L12 6L17 11" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx={12} cy={21} r={1.5} fill={color} />
  </Svg>
);

export const getDirectionIcon = (type, modifier, size = 32, color = '#FFFFFF') => {
  if (type === 'arrive') return <ArrowArrive size={size} color={color} />;
  if (type === 'depart') return <ArrowDepart size={size} color={color} />;

  const arrowMap = {
    left: ArrowLeft,
    right: ArrowRight,
    'sharp left': ArrowSharpLeft,
    'sharp right': ArrowSharpRight,
    'slight left': ArrowSlightLeft,
    'slight right': ArrowSlightRight,
    uturn: ArrowUturn,
    straight: ArrowStraight,
  };

  const Component = arrowMap[modifier] || ArrowStraight;
  return <Component size={size} color={color} />;
};
```

**Step 2: Update WalkingInstructionCard.js**

Remove the `DIRECTION_ARROWS` object (lines 17-28), `getDirectionArrow` function (lines 39-43), and the emoji `<Text>` rendering. Import and use the new SVG component instead.

Changes:
1. Add import: `import { getDirectionIcon } from './DirectionArrows';`
2. Remove lines 17-28 (`DIRECTION_ARROWS` object)
3. Remove lines 39-43 (`getDirectionArrow` function)
4. Replace line 93 (`const directionArrow = ...`) with: remove it entirely
5. Replace lines 116-118 (the `<Text style={styles.directionArrow}>{directionArrow}</Text>`) with:
   `{getDirectionIcon(currentStep.type, currentStep.modifier, 32, COLORS.white)}`
6. Remove the `directionArrow` style (lines 175-178) — no longer needed

**Step 3: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | head -20`
Expected: No import errors

**Step 4: Commit**

```bash
git add src/components/navigation/DirectionArrows.js src/components/navigation/WalkingInstructionCard.js
git commit -m "feat(nav): replace emoji arrows with clean geometric SVG direction icons"
```

---

### Task 3: Improve Walking Fallback When API Fails

When LocationIQ is unavailable, `getFallbackDirections` returns a single generic step "Walk to your destination". Enhance it to show compass bearing and destination name.

**Files:**
- Modify: `src/services/walkingService.js:182-203`
- Modify: `src/components/navigation/WalkingInstructionCard.js` (add fallback notice)

**Step 1: Add bearing calculation to walkingService.js**

Add a `calculateBearing` function above `getFallbackDirections` (before line 182):

```js
/**
 * Calculate initial compass bearing from point A to point B
 * @returns {string} Compass direction (N, NE, E, SE, S, SW, W, NW)
 */
const calculateBearing = (fromLat, fromLon, toLat, toLon) => {
  const dLon = (toLon - fromLon) * Math.PI / 180;
  const lat1 = fromLat * Math.PI / 180;
  const lat2 = toLat * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  return directions[Math.round(bearing / 45) % 8];
};
```

**Step 2: Enhance getFallbackDirections**

Replace the `getFallbackDirections` function (lines 182-203) to include bearing info:

```js
const getFallbackDirections = (fromLat, fromLon, toLat, toLon) => {
  const straightDistance = haversineDistance(fromLat, fromLon, toLat, toLon);
  const walkDistance = straightDistance * ROUTING_CONFIG.WALK_DISTANCE_BUFFER;
  const walkDuration = walkDistance / ROUTING_CONFIG.WALK_SPEED;
  const bearing = calculateBearing(fromLat, fromLon, toLat, toLon);

  return {
    distance: Math.round(walkDistance),
    duration: Math.round(walkDuration),
    geometry: null,
    steps: [
      {
        instruction: `Head ${bearing} toward your destination`,
        distance: Math.round(walkDistance),
        duration: Math.round(walkDuration),
        type: 'depart',
        modifier: null,
        name: '',
        bearing,
      },
    ],
    source: 'estimate',
  };
};
```

**Step 3: Show fallback notice in WalkingInstructionCard**

Add a `isFallback` prop detection and subtle notice. In `WalkingInstructionCard.js`, after the `distanceRow` View (after line 131), add:

```jsx
{/* Fallback notice when detailed directions unavailable */}
{currentStep?.type === 'depart' && !onNextStep && (
  <Text style={styles.fallbackNotice}>
    Follow the route on the map
  </Text>
)}
```

Add the style:
```js
fallbackNotice: {
  fontSize: FONT_SIZES.xs,
  color: COLORS.textSecondary,
  fontStyle: 'italic',
  marginTop: 4,
},
```

**Step 4: Commit**

```bash
git add src/services/walkingService.js src/components/navigation/WalkingInstructionCard.js
git commit -m "feat(nav): improve walking fallback with compass bearing and map notice"
```

---

### Task 4: Step Counter + Enhanced Progress Bar

Replace abstract dots with mode-aware leg indicators showing icons and durations.

**Files:**
- Modify: `src/components/navigation/NavigationProgressBar.js` (full rewrite)
- Modify: `src/components/navigation/WalkingInstructionCard.js` (add step counter)

**Step 1: Rewrite NavigationProgressBar.js**

Replace the entire component with a mode-aware progress bar. Each leg becomes a pill showing an icon + duration, connected by lines.

```js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../../config/theme';
import { formatDuration } from '../../services/tripService';
import Icon from '../Icon';

const NavigationProgressBar = ({ legs, currentLegIndex }) => {
  if (!legs || legs.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.progressRow}>
        {legs.map((leg, index) => {
          const isCompleted = index < currentLegIndex;
          const isCurrent = index === currentLegIndex;
          const isWalk = leg.mode === 'WALK';
          const isOnDemand = leg.isOnDemand;

          const iconName = isWalk ? 'Walk' : isOnDemand ? 'Phone' : 'Bus';
          const duration = formatDuration(leg.duration);

          return (
            <React.Fragment key={index}>
              {index > 0 && (
                <View
                  style={[
                    styles.connector,
                    isCompleted && styles.connectorCompleted,
                  ]}
                />
              )}
              <View
                style={[
                  styles.legPill,
                  isCurrent && styles.legPillCurrent,
                  isCompleted && styles.legPillCompleted,
                ]}
              >
                {isCompleted ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : (
                  <Icon
                    name={iconName}
                    size={14}
                    color={isCurrent ? COLORS.white : COLORS.textSecondary}
                  />
                )}
                {!isWalk && !isOnDemand && leg.route?.shortName && (
                  <View style={[styles.routeBadge, { backgroundColor: leg.route?.color || COLORS.primary }]}>
                    <Text style={styles.routeBadgeText}>{leg.route.shortName}</Text>
                  </View>
                )}
                <Text
                  style={[
                    styles.durationText,
                    isCurrent && styles.durationTextCurrent,
                    isCompleted && styles.durationTextCompleted,
                  ]}
                  numberOfLines={1}
                >
                  {duration}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connector: {
    height: 2,
    width: 12,
    backgroundColor: COLORS.grey300,
    marginHorizontal: 2,
  },
  connectorCompleted: {
    backgroundColor: COLORS.success,
  },
  legPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.grey100,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.round,
    gap: 4,
  },
  legPillCurrent: {
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.primaryDark,
  },
  legPillCompleted: {
    backgroundColor: COLORS.successSubtle,
  },
  checkmark: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '700',
  },
  routeBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.xs,
  },
  routeBadgeText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: '700',
  },
  durationText: {
    fontSize: FONT_SIZES.xxs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  durationTextCurrent: {
    color: COLORS.white,
  },
  durationTextCompleted: {
    color: COLORS.success,
  },
});

export default NavigationProgressBar;
```

**Step 2: Add step counter to WalkingInstructionCard**

Add `currentStepIndex` and `totalSteps` props. In `WalkingInstructionCard.js`, update the component signature to accept these new props:

```js
const WalkingInstructionCard = ({
  currentStep,
  onNextStep,
  destinationName,
  currentLeg,
  onNextLeg,
  isLastStep,
  currentStepIndex,   // NEW
  totalSteps,         // NEW
}) => {
```

After the `distanceRow` View (after line 131), add:

```jsx
{totalSteps > 1 && (
  <Text style={styles.stepCounter}>
    Step {currentStepIndex + 1} of {totalSteps}
  </Text>
)}
```

Add the style:
```js
stepCounter: {
  fontSize: FONT_SIZES.xxs,
  color: COLORS.textSecondary,
  marginTop: 2,
},
```

**Step 3: Pass new props from NavigationScreen**

In `NavigationScreen.js`, update the `WalkingInstructionCard` usage (around line 727) to pass the new props:

```jsx
<WalkingInstructionCard
  currentStep={currentWalkingStep}
  onNextStep={advanceStep}
  destinationName={currentLeg?.to?.name}
  currentLeg={currentLeg}
  isLastStep={currentStepIndex === (currentLeg?.steps || []).length - 1}
  onNextLeg={advanceLeg}
  currentStepIndex={currentStepIndex}
  totalSteps={(currentLeg?.steps || []).length}
/>
```

Do the same in `NavigationScreen.web.js` (find the corresponding `<WalkingInstructionCard` usage).

**Step 4: Commit**

```bash
git add src/components/navigation/NavigationProgressBar.js src/components/navigation/WalkingInstructionCard.js src/screens/NavigationScreen.js src/screens/NavigationScreen.web.js
git commit -m "feat(nav): add mode-aware progress bar and step counter"
```

---

### Task 5: StepOverviewSheet Improvements

Make the step overview discoverable by defaulting to expanded and adding a label.

**Files:**
- Modify: `src/components/navigation/StepOverviewSheet.js:33,53-55`

**Step 1: Default to expanded and add label**

In `StepOverviewSheet.js`:

1. Change line 33: `const [isExpanded, setIsExpanded] = useState(false)` → `useState(true)`
2. Change line 34: `const animatedHeight = useRef(new Animated.Value(0)).current` → `new Animated.Value(1)`
3. Replace the toggle header (lines 53-55) with:

```jsx
<TouchableOpacity style={styles.toggleHeader} onPress={toggleExpanded}>
  <View style={styles.toggleRow}>
    <View style={styles.handleBar} />
  </View>
  <View style={styles.toggleLabelRow}>
    <Text style={styles.toggleLabel}>
      {isExpanded ? 'Hide steps' : `All steps (${legs.length})`}
    </Text>
    <Text style={[styles.chevron, isExpanded && styles.chevronExpanded]}>›</Text>
  </View>
</TouchableOpacity>
```

Add styles:
```js
toggleRow: {
  alignItems: 'center',
  paddingTop: SPACING.xs,
},
toggleLabelRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  paddingBottom: SPACING.xs,
  gap: 4,
},
toggleLabel: {
  fontSize: FONT_SIZES.xs,
  color: COLORS.textSecondary,
  fontWeight: '600',
},
chevron: {
  fontSize: 16,
  color: COLORS.textSecondary,
  transform: [{ rotate: '90deg' }],
},
chevronExpanded: {
  transform: [{ rotate: '270deg' }],
},
```

**Step 2: Commit**

```bash
git add src/components/navigation/StepOverviewSheet.js
git commit -m "feat(nav): expand step overview by default with toggle label"
```

---

### Task 6: Trip Completion Screen

Replace `Alert.alert('Trip Complete!')` with a full-screen completion overlay.

**Files:**
- Create: `src/components/navigation/TripCompletionScreen.js`
- Modify: `src/screens/NavigationScreen.js:284-306` (replace Alert with component)
- Modify: `src/screens/NavigationScreen.web.js:430-441` (same)

**Step 1: Create TripCompletionScreen.js**

Create `src/components/navigation/TripCompletionScreen.js`:

```js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../config/theme';
import { formatDuration, formatDistance } from '../../services/tripService';
import Icon from '../Icon';

const TripCompletionScreen = ({ itinerary, onDone, navigationStartTime }) => {
  const [rating, setRating] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate checkmark then content
    Animated.sequence([
      Animated.spring(checkmarkScale, {
        toValue: 1,
        tension: 50,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Calculate trip stats
  const totalTime = navigationStartTime
    ? Math.round((Date.now() - navigationStartTime) / 60000)
    : null;
  const totalDistance = itinerary?.legs?.reduce((sum, leg) => sum + (leg.distance || 0), 0) || 0;
  const walkLegs = itinerary?.legs?.filter(l => l.mode === 'WALK').length || 0;
  const busLegs = itinerary?.legs?.filter(l => l.mode === 'BUS' || l.mode === 'TRANSIT').length || 0;

  const legsSummary = [
    walkLegs > 0 ? `${walkLegs} walk${walkLegs > 1 ? 's' : ''}` : null,
    busLegs > 0 ? `${busLegs} bus ride${busLegs > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(', ');

  const handleDone = async () => {
    if (rating > 0) {
      try {
        await AsyncStorage.setItem('@barrie_transit_last_trip_rating', JSON.stringify({
          rating,
          feedback: feedbackText || null,
          timestamp: Date.now(),
        }));
      } catch {}
    }
    onDone();
  };

  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.container} bounces={false}>
        {/* Animated Checkmark */}
        <Animated.View style={[styles.checkmarkCircle, { transform: [{ scale: checkmarkScale }] }]}>
          <Icon name="Celebration" size={48} color={COLORS.white} />
        </Animated.View>

        <Animated.View style={[styles.content, { opacity: contentOpacity }]}>
          <Text style={styles.heading}>You've arrived!</Text>

          {/* Trip Summary Card */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Trip Summary</Text>

            <View style={styles.statRow}>
              <View style={styles.stat}>
                <Icon name="Clock" size={18} color={COLORS.primary} />
                <Text style={styles.statValue}>
                  {totalTime ? `${totalTime} min` : formatDuration(itinerary?.duration)}
                </Text>
                <Text style={styles.statLabel}>Total time</Text>
              </View>
              <View style={styles.stat}>
                <Icon name="Walk" size={18} color={COLORS.primary} />
                <Text style={styles.statValue}>{formatDistance(totalDistance)}</Text>
                <Text style={styles.statLabel}>Total distance</Text>
              </View>
            </View>

            {legsSummary ? (
              <Text style={styles.legsSummary}>{legsSummary}</Text>
            ) : null}
          </View>

          {/* Rating */}
          <Text style={styles.ratingLabel}>How was your trip?</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                style={styles.starButton}
              >
                <Icon
                  name="Star"
                  size={36}
                  color={star <= rating ? COLORS.warning : COLORS.grey300}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Feedback */}
          {rating > 0 && !showFeedback && (
            <TouchableOpacity onPress={() => setShowFeedback(true)}>
              <Text style={styles.feedbackLink}>Add feedback</Text>
            </TouchableOpacity>
          )}

          {showFeedback && (
            <TextInput
              style={styles.feedbackInput}
              placeholder="Tell us about your experience..."
              placeholderTextColor={COLORS.textDisabled}
              value={feedbackText}
              onChangeText={setFeedbackText}
              multiline
              numberOfLines={3}
            />
          )}

          {/* Done Button */}
          <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.background,
    zIndex: 200,
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xxxl,
  },
  checkmarkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
    ...SHADOWS.large,
  },
  content: {
    width: '100%',
    alignItems: 'center',
  },
  heading: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xl,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    ...SHADOWS.medium,
  },
  summaryTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  legsSummary: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  ratingLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  starsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  starButton: {
    padding: SPACING.xs,
  },
  feedbackLink: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
    marginBottom: SPACING.lg,
  },
  feedbackInput: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: SPACING.lg,
  },
  doneButton: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.round,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  doneButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
});

export default TripCompletionScreen;
```

**Step 2: Wire into NavigationScreen.js**

Add state to track navigation start time. Near line 78 (after `const [itinerary, setItinerary] = ...`), add:

```js
const [navigationStartTime] = useState(Date.now());
```

Import the new component:
```js
import TripCompletionScreen from '../components/navigation/TripCompletionScreen';
```

Replace the completion Alert (lines 284-306). Remove the entire `useEffect` for `isNavigationComplete` that calls `Alert.alert`. Instead, render `TripCompletionScreen` conditionally. After the `ExitConfirmationModal` (around line 837), add:

```jsx
{/* Trip Completion Overlay */}
{isNavigationComplete && (
  <TripCompletionScreen
    itinerary={itinerary}
    navigationStartTime={navigationStartTime}
    onDone={() => {
      stopTracking();
      navigation.navigate('MapMain', { exitTripPlanning: true });
    }}
  />
)}
```

Keep the analytics tracking and survey nudge from the old useEffect, but move them to fire when `isNavigationComplete` becomes true (keep the useEffect but remove the Alert.alert and navigation.goBack):

```js
useEffect(() => {
  if (isNavigationComplete) {
    try {
      const { trackEvent } = require('../services/analyticsService');
      trackEvent('navigation_completed');
    } catch {}
    try {
      const { maybeRequestReview } = require('../services/reviewService');
      maybeRequestReview();
    } catch {}
    AsyncStorage.setItem('@barrie_transit_show_survey_nudge', 'true').catch(() => {});
  }
}, [isNavigationComplete]);
```

**Step 3: Wire into NavigationScreen.web.js**

Same pattern. Replace the `alert('You have arrived...')` and `navigation.goBack()` (lines 438-439) with the `TripCompletionScreen` overlay. Add the same `navigationStartTime` state and import.

**Step 4: Commit**

```bash
git add src/components/navigation/TripCompletionScreen.js src/screens/NavigationScreen.js src/screens/NavigationScreen.web.js
git commit -m "feat(nav): add trip completion screen with stats and rating"
```

---

### Task 7: Walked-Portion Polyline Dimming

Split the current leg's polyline at the user's position to show traveled vs remaining portions.

**Files:**
- Modify: `src/screens/NavigationScreen.js:333-397` (routePolylines useMemo)
- Modify: `src/screens/NavigationScreen.web.js:456-525` (routePolylines useMemo)

**Step 1: Update native routePolylines useMemo**

In `NavigationScreen.js`, modify the `routePolylines` useMemo (starting around line 333). Add `userLocation` to the dependency array. For the current leg, split the coordinates.

Replace the return statement for each leg (the object at lines 382-395). The new logic:

```js
const routePolylines = useMemo(() => {
  if (!itinerary?.legs) return [];
  const result = [];

  itinerary.legs.forEach((leg, index) => {
    let coordinates = [];
    const isWalk = leg.mode === 'WALK';
    const isTransit = leg.mode === 'BUS' || leg.mode === 'TRANSIT';

    // ... (keep existing coordinate resolution logic, lines 341-377)

    const isCurrentLeg = index === currentLegIndex;
    const isCompletedLeg = index < currentLegIndex;

    const baseColor = isCompletedLeg
      ? COLORS.grey400
      : isWalk
      ? COLORS.grey600
      : leg.isOnDemand
      ? (leg.zoneColor || COLORS.primary)
      : (leg.route?.color || COLORS.primary);

    // Split current leg at user position
    if (isCurrentLeg && userLocation && coordinates.length > 1) {
      const splitIdx = findClosestPointIndex(
        coordinates,
        userLocation.latitude,
        userLocation.longitude
      );

      if (splitIdx > 0 && splitIdx < coordinates.length - 1) {
        // Traveled portion
        result.push({
          id: `leg-${index}-traveled`,
          coordinates: coordinates.slice(0, splitIdx + 1),
          color: baseColor,
          strokeWidth: 5,
          lineDashPattern: isWalk ? [10, 5] : leg.isOnDemand ? [8, 6] : null,
          opacity: 0.3,
        });
        // Remaining portion
        result.push({
          id: `leg-${index}-remaining`,
          coordinates: coordinates.slice(splitIdx),
          color: baseColor,
          strokeWidth: 5,
          lineDashPattern: isWalk ? [10, 5] : leg.isOnDemand ? [8, 6] : null,
          opacity: 1,
        });
        return; // Skip the default push below
      }
    }

    result.push({
      id: `leg-${index}`,
      coordinates,
      color: baseColor,
      strokeWidth: isCurrentLeg ? 5 : 3,
      lineDashPattern: isWalk ? [10, 5] : leg.isOnDemand ? [8, 6] : null,
      opacity: isCompletedLeg ? 0.25 : 1,
    });
  });

  return result;
}, [itinerary, currentLegIndex, shapes, routeShapeMapping, userLocation]);
```

Note: The `forEach` + `result.push` pattern replaces the `.map` so we can conditionally push 1 or 2 entries per leg.

Import `findClosestPointIndex` is already imported at line 52.

**Step 2: Apply same logic to NavigationScreen.web.js**

Same pattern but using `positions` (Leaflet `[lat, lng]` format) instead of `coordinates`. The `findClosestPointIndex` expects `{latitude, longitude}` objects, so convert the user location:

```js
const splitIdx = findClosestPointIndex(
  positions.map(p => ({ latitude: p[0], longitude: p[1] })),
  userLocation.latitude,
  userLocation.longitude
);
```

Then split `positions` at `splitIdx`.

**Step 3: Commit**

```bash
git add src/screens/NavigationScreen.js src/screens/NavigationScreen.web.js
git commit -m "feat(nav): dim walked portion of polyline for progress visualization"
```

---

### Task 8: Intermediate Stop Names in BusProximityCard

Add an expandable stop list when riding the bus.

**Files:**
- Modify: `src/components/navigation/BusProximityCard.js`

**Step 1: Add props and state**

Add new props to `BusProximityCard`:
- `intermediateStops` — array of stop objects from `currentLeg.intermediateStops`
- `currentStopIndex` — which stop the bus is currently near (optional, for highlighting)

Add state:
```js
const [showStops, setShowStops] = useState(false);
const stopsHeight = useRef(new Animated.Value(0)).current;
```

**Step 2: Add stop list toggle and list**

After the stops visualization section (after line 282), add the expandable stop list:

```jsx
{/* Intermediate Stops List (on board only) */}
{isOnBoard && intermediateStops && intermediateStops.length > 0 && (
  <View style={styles.stopsSection}>
    <TouchableOpacity
      style={styles.stopsToggle}
      onPress={() => {
        const expanding = !showStops;
        Animated.timing(stopsHeight, {
          toValue: expanding ? 1 : 0,
          duration: 250,
          useNativeDriver: false,
        }).start();
        setShowStops(expanding);
      }}
    >
      <Text style={styles.stopsToggleText}>
        {showStops ? 'Hide stops' : `Show ${intermediateStops.length} stops`}
      </Text>
      <Text style={[styles.stopsChevron, showStops && styles.stopsChevronOpen]}>›</Text>
    </TouchableOpacity>

    <Animated.View style={{
      maxHeight: stopsHeight.interpolate({
        inputRange: [0, 1],
        outputRange: [0, intermediateStops.length * 36 + 40],
      }),
      overflow: 'hidden',
    }}>
      {intermediateStops.map((stop, idx) => {
        const isPassed = stopsUntilAlighting !== null && idx < (intermediateStops.length - stopsUntilAlighting);
        const isDestination = idx === intermediateStops.length - 1;
        const stopLabel = stop.stopCode ? `${stop.name} (#${stop.stopCode})` : stop.name;

        return (
          <View key={stop.stopId || idx} style={styles.stopItem}>
            <View style={[
              styles.stopItemDot,
              isPassed && styles.stopItemDotPassed,
              isDestination && styles.stopItemDotDestination,
            ]}>
              {isPassed && <Text style={styles.stopItemCheck}>✓</Text>}
            </View>
            <Text style={[
              styles.stopItemText,
              isPassed && styles.stopItemTextPassed,
              isDestination && styles.stopItemTextDestination,
            ]} numberOfLines={1}>
              {stopLabel}
            </Text>
          </View>
        );
      })}
    </Animated.View>
  </View>
)}
```

**Step 3: Add styles**

```js
stopsSection: {
  marginTop: SPACING.md,
  borderTopWidth: 1,
  borderTopColor: COLORS.borderLight,
  paddingTop: SPACING.sm,
},
stopsToggle: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: SPACING.xs,
  gap: 4,
},
stopsToggleText: {
  fontSize: FONT_SIZES.sm,
  color: COLORS.primary,
  fontWeight: '600',
},
stopsChevron: {
  fontSize: 16,
  color: COLORS.primary,
  transform: [{ rotate: '90deg' }],
},
stopsChevronOpen: {
  transform: [{ rotate: '270deg' }],
},
stopItem: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingVertical: SPACING.xs,
  paddingLeft: SPACING.sm,
  gap: SPACING.sm,
},
stopItemDot: {
  width: 12,
  height: 12,
  borderRadius: 6,
  backgroundColor: COLORS.grey300,
  justifyContent: 'center',
  alignItems: 'center',
},
stopItemDotPassed: {
  backgroundColor: COLORS.success,
},
stopItemDotDestination: {
  backgroundColor: COLORS.error,
  width: 14,
  height: 14,
  borderRadius: 7,
},
stopItemCheck: {
  fontSize: 8,
  color: COLORS.white,
  fontWeight: '700',
},
stopItemText: {
  fontSize: FONT_SIZES.sm,
  color: COLORS.textPrimary,
  flex: 1,
},
stopItemTextPassed: {
  color: COLORS.textDisabled,
},
stopItemTextDestination: {
  fontWeight: '700',
  color: COLORS.error,
},
```

**Step 4: Pass intermediateStops from NavigationScreen**

In both `NavigationScreen.js` and `NavigationScreen.web.js`, add the `intermediateStops` prop to the `BusProximityCard` usage:

```jsx
<BusProximityCard
  // ...existing props...
  intermediateStops={currentLeg?.intermediateStops}
/>
```

**Step 5: Commit**

```bash
git add src/components/navigation/BusProximityCard.js src/screens/NavigationScreen.js src/screens/NavigationScreen.web.js
git commit -m "feat(nav): add expandable intermediate stop list to bus proximity card"
```

---

### Task 9: Hide Tab Bar on NavigationScreen

Prevent the tab bar from showing through the fullScreenModal.

**Files:**
- Modify: `src/screens/NavigationScreen.js` (add useEffect)
- Modify: `src/screens/NavigationScreen.web.js` (add useEffect)

**Step 1: Add tab bar hiding to native NavigationScreen**

In `NavigationScreen.js`, inside the component (after the existing useEffects, around line 270), add:

```js
// Hide tab bar while navigation is active
useEffect(() => {
  const parent = navigation.getParent();
  parent?.setOptions({ tabBarStyle: { display: 'none' } });
  return () => {
    parent?.setOptions({ tabBarStyle: undefined });
  };
}, [navigation]);
```

**Step 2: Add same to web NavigationScreen**

Add the identical useEffect to `NavigationScreen.web.js` in the same location.

**Step 3: Verify**

Run the app, start navigation, confirm tab bar is hidden. Exit navigation, confirm tab bar returns.

**Step 4: Commit**

```bash
git add src/screens/NavigationScreen.js src/screens/NavigationScreen.web.js
git commit -m "fix(nav): hide tab bar during fullscreen navigation"
```

---

### Final Verification

After all tasks are complete:

1. Run: `npx expo export --platform web --no-minify 2>&1 | head -20` to verify no build errors
2. Run: `npm test` to verify no test regressions
3. Test the full navigation flow: plan trip → hit Go → walk → ride bus → arrive
4. Verify on both native (dev client) and web

```bash
git add -A
git commit -m "chore: final verification pass on navigation enterprise improvements"
```
