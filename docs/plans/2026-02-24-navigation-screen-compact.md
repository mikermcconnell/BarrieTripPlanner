# Navigation Screen Compact Redesign

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Halve the bottom UI on the navigation screen to give more map space, add a destination banner with stop name/number and walk/departure times, and add a "Next Step" button to skip to the next trip leg.

**Architecture:** Slim down WalkingInstructionCard by removing the next-turn preview, progress bar, ETA badge, and bus catch indicator. Add a new DestinationBanner component that shows where the user is heading (with stop name and number), walk time, and bus departure countdown. Add a "Next Step" button to the instruction card that calls advanceLeg(). Trim StepOverviewSheet toggle text. Apply all changes to both native and web files.

**Tech Stack:** React Native, Expo, Leaflet (web), MapLibre (native)

---

### Task 1: Create DestinationBanner Component

**Files:**
- Create: `src/components/navigation/DestinationBanner.js`
- Test: Manual visual verification (UI component)

**Step 1: Create the DestinationBanner component**

```jsx
// src/components/navigation/DestinationBanner.js
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../config/theme';
import { formatMinutes } from '../../services/tripService';

/**
 * Format a stop/location with its code/number when available.
 * Accepts OTP leg endpoint objects ({ name, stopCode, stopId }).
 */
const formatStopLabel = (stop) => {
  if (!stop) return 'Destination';
  const code = stop.stopCode || stop.stopId;
  return code ? `${stop.name} (#${code})` : stop.name;
};

/**
 * Calculate walking time in minutes from distance in meters.
 * Average walking speed: 5 km/h = 83.3 m/min.
 */
const walkingMinutes = (distanceMeters) => {
  if (!distanceMeters || distanceMeters <= 0) return 0;
  return Math.ceil(distanceMeters / 83.3);
};

const DestinationBanner = ({
  currentLeg,
  nextTransitLeg,
  distanceRemaining,
  totalLegDistance,
  isLastWalkingLeg,
}) => {
  if (!currentLeg) return null;

  const isWalking = currentLeg.mode === 'WALK';
  const isTransit = currentLeg.mode === 'BUS' || currentLeg.mode === 'TRANSIT';
  const isOnDemand = currentLeg.isOnDemand === true;

  // Destination label with stop number
  const destinationLabel = formatStopLabel(currentLeg.to);

  // Icon and prefix based on leg type
  const { icon, prefix } = useMemo(() => {
    if (isOnDemand) return { icon: '\u{1F4DE}', prefix: 'On-demand to' };
    if (isTransit) {
      return { icon: '\u{1F68C}', prefix: 'Riding to' };
    }
    if (isWalking && isLastWalkingLeg) {
      return { icon: '\u{1F4CD}', prefix: 'Walking to' };
    }
    if (isWalking) {
      return { icon: '\u{1F68F}', prefix: 'Walking to' };
    }
    return { icon: '\u{1F4CD}', prefix: 'Heading to' };
  }, [isWalking, isTransit, isOnDemand, isLastWalkingLeg]);

  // Walk time estimate
  const walkTime = useMemo(() => {
    if (!isWalking) return null;
    const distance = distanceRemaining || totalLegDistance || currentLeg.distance;
    return walkingMinutes(distance);
  }, [isWalking, distanceRemaining, totalLegDistance, currentLeg.distance]);

  // Bus departure info (only when walking to a bus stop)
  const busDepartureInfo = useMemo(() => {
    if (!isWalking || !nextTransitLeg) return null;
    const departureTime = nextTransitLeg.startTime;
    if (!departureTime) return null;

    const now = Date.now();
    const minutesUntil = Math.max(0, Math.ceil((departureTime - now) / 60000));

    return {
      minutesUntil,
      routeName: nextTransitLeg.route?.shortName || 'Bus',
    };
  }, [isWalking, nextTransitLeg]);

  // Transit status line (stops remaining)
  const transitStatusText = useMemo(() => {
    if (!isTransit) return null;
    const stops = currentLeg.intermediateStops?.length;
    if (typeof stops === 'number' && stops > 0) {
      return `${stops} stop${stops !== 1 ? 's' : ''} remaining`;
    }
    return null;
  }, [isTransit, currentLeg.intermediateStops]);

  // Waiting status line
  const isWaiting = isTransit && !currentLeg._isOnBoard;

  // Pace color: green if plenty of time, yellow if tight, red if late
  const paceColor = useMemo(() => {
    if (!busDepartureInfo || walkTime === null) return COLORS.success;
    const buffer = busDepartureInfo.minutesUntil - walkTime;
    if (buffer < -2) return COLORS.error;
    if (buffer < 0) return COLORS.warning;
    return COLORS.success;
  }, [busDepartureInfo, walkTime]);

  return (
    <View style={styles.container}>
      {/* Line 1: Icon + destination */}
      <View style={styles.destinationRow}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.prefix}>{prefix}: </Text>
        <Text style={styles.destinationName} numberOfLines={1}>{destinationLabel}</Text>
      </View>

      {/* Line 2: Walk time + bus departure (walking legs) */}
      {isWalking && (
        <View style={styles.timingRow}>
          <Text style={styles.timingText}>
            {'\u{1F6B6}'} {formatMinutes(walkTime)} walk
          </Text>
          {busDepartureInfo && (
            <>
              <Text style={styles.timingSeparator}> · </Text>
              <Text style={[styles.timingText, { color: paceColor }]}>
                {'\u{1F550}'} Bus departs in {formatMinutes(busDepartureInfo.minutesUntil)}
              </Text>
            </>
          )}
        </View>
      )}

      {/* Line 2: Transit status (transit legs) */}
      {isTransit && transitStatusText && (
        <View style={styles.timingRow}>
          <Text style={styles.timingText}>{transitStatusText}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.grey100,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 14,
    marginRight: SPACING.xs,
  },
  prefix: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  destinationName: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    fontWeight: '700',
    flex: 1,
  },
  timingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  timingText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  timingSeparator: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.grey400,
  },
});

export default DestinationBanner;
```

**Step 2: Commit**

```bash
git add src/components/navigation/DestinationBanner.js
git commit -m "feat(nav): add DestinationBanner component with stop name/number and timing"
```

---

### Task 2: Slim Down WalkingInstructionCard + Add Next Step Button

**Files:**
- Modify: `src/components/navigation/WalkingInstructionCard.js`

**What to remove:**
- The `nextInstruction` section (lines 303-321) — the "THEN" preview
- The `progressContainer` section (lines 325-344) — progress bar
- The `etaContainer` in mainRow (lines 235-240) — ETA badge
- The `busCatchContainer` section (lines 244-299) — bus catch indicator
- All associated styles for removed sections
- Remove `nextStep` and `nextTransitLeg` props (no longer needed)
- Remove `calculatePaceStatus`, `calculateETA`, `busDepartureInfo`, `paceStatus` logic

**What to add:**
- `onNextStep` prop — callback for the Next Step button
- A "Next Step" pill button on the right side of the `mainRow`

**Step 1: Edit WalkingInstructionCard.js**

The component should become:

```jsx
const WalkingInstructionCard = ({
  currentStep,
  distanceRemaining,
  totalLegDistance,
  onNextStep,
}) => {
  if (!currentStep) return null;

  const directionArrow = getDirectionArrow(currentStep.type, currentStep.modifier);
  const arrowColor = getArrowColor(currentStep.type, currentStep.modifier);
  const stepDistance = currentStep.distance ? formatDistance(currentStep.distance) : '';
  const formattedInstruction = formatInstruction(currentStep);

  return (
    <View style={styles.container}>
      <View style={styles.mainRow}>
        {/* Direction Arrow */}
        <View style={[styles.arrowContainer, { backgroundColor: arrowColor }]}>
          <Text style={styles.directionArrow}>{directionArrow}</Text>
        </View>

        {/* Instruction Details */}
        <View style={styles.instructionDetails}>
          <Text style={styles.instructionText} numberOfLines={2}>
            {formattedInstruction}
          </Text>
          <View style={styles.distanceRow}>
            <Text style={styles.stepDistance}>
              {stepDistance ? `${stepDistance} to next turn` : 'Starting point'}
            </Text>
          </View>
        </View>

        {/* Next Step Button */}
        {onNextStep && (
          <TouchableOpacity style={styles.nextStepButton} onPress={onNextStep}>
            <Text style={styles.nextStepButtonText}>Next Step</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
```

New styles to add:
```js
nextStepButton: {
  backgroundColor: COLORS.primary,
  paddingHorizontal: SPACING.md,
  paddingVertical: SPACING.sm,
  borderRadius: BORDER_RADIUS.round,
  marginLeft: SPACING.sm,
},
nextStepButtonText: {
  color: COLORS.white,
  fontSize: FONT_SIZES.sm,
  fontWeight: '700',
},
```

Styles to remove: `etaContainer`, `etaTime`, `etaLabel`, `busCatchContainer`, `busCatchHeader`, `busIcon`, `busCatchLabel`, `liveBadge`, `liveBadgeText`, `timeComparisonRow`, `timeBlock`, `timeBlockIcon`, `timeBlockValue`, `timeBlockLabel`, `timeDivider`, `timeDividerText`, `departureTimeSmall`, `paceIndicator`, `paceIndicatorDot`, `paceIndicatorText`, `nextInstruction`, `nextIconContainer`, `nextIcon`, `nextTextContainer`, `nextLabel`, `nextText`, `nextDistance`, `progressContainer`, `progressInfo`, `progressLabel`, `progressBar`, `progressFill`, `remainingText`.

Import to add: `TouchableOpacity` from react-native.
Imports to remove: `useMemo` from react (no longer used), `formatMinutes` from tripService (no longer used).

**Step 2: Commit**

```bash
git add src/components/navigation/WalkingInstructionCard.js
git commit -m "feat(nav): slim WalkingInstructionCard, add Next Step button"
```

---

### Task 3: Trim StepOverviewSheet Toggle Text

**Files:**
- Modify: `src/components/navigation/StepOverviewSheet.js`

**Step 1: Remove the toggle text, keep only the handle bar**

In `StepOverviewSheet.js`, change the `toggleHeader` content from:

```jsx
<TouchableOpacity style={styles.toggleHeader} onPress={toggleExpanded}>
  <View style={styles.handleBar} />
  <Text style={styles.toggleText}>
    {isExpanded ? '▼ Hide steps' : '▲ View all steps'}
  </Text>
</TouchableOpacity>
```

To:

```jsx
<TouchableOpacity style={styles.toggleHeader} onPress={toggleExpanded}>
  <View style={styles.handleBar} />
</TouchableOpacity>
```

Update `toggleHeader` style to reduce padding:

```js
toggleHeader: {
  alignItems: 'center',
  paddingVertical: SPACING.xs,
},
```

Remove `toggleText` style and `borderBottomWidth`/`borderBottomColor` from `toggleHeader`.

**Step 2: Commit**

```bash
git add src/components/navigation/StepOverviewSheet.js
git commit -m "feat(nav): trim StepOverviewSheet to handle-bar only"
```

---

### Task 4: Wire DestinationBanner + Next Step into NavigationScreen (Native)

**Files:**
- Modify: `src/screens/NavigationScreen.js`

**Step 1: Add import for DestinationBanner**

Add at top with other navigation component imports:
```js
import DestinationBanner from '../components/navigation/DestinationBanner';
```

**Step 2: Compute `isLastWalkingLeg`**

Add a useMemo after the existing `nextTransitLeg` memo:
```js
const isLastWalkingLeg = useMemo(() => {
  if (!isWalkingLeg || !itinerary?.legs) return false;
  // Last walking leg = no more transit legs after this one
  for (let i = currentLegIndex + 1; i < itinerary.legs.length; i++) {
    if (itinerary.legs[i].mode === 'BUS' || itinerary.legs[i].mode === 'TRANSIT') return false;
  }
  return true;
}, [isWalkingLeg, itinerary, currentLegIndex]);
```

**Step 3: Add DestinationBanner to the bottom section**

In the `bottomSection` View, add the banner as the first child (before the walking/transit cards):

```jsx
<View style={styles.bottomSection}>
  {/* Destination Banner */}
  <DestinationBanner
    currentLeg={currentLeg}
    nextTransitLeg={nextTransitLeg}
    distanceRemaining={distanceToDestination}
    totalLegDistance={currentLeg?.distance || 0}
    isLastWalkingLeg={isLastWalkingLeg}
  />

  {/* Walking Instruction Card */}
  {isWalkingLeg && (
    <WalkingInstructionCard
      currentStep={currentWalkingStep}
      distanceRemaining={distanceToDestination}
      totalLegDistance={currentLeg?.distance || 0}
      onNextStep={advanceLeg}
    />
  )}

  {/* ... rest of bottom section unchanged ... */}
```

Note: Remove `nextStep={nextWalkingStep}` and `nextTransitLeg={nextTransitLeg}` props from WalkingInstructionCard since those props were removed in Task 2.

**Step 4: Commit**

```bash
git add src/screens/NavigationScreen.js
git commit -m "feat(nav): wire DestinationBanner and Next Step into native NavigationScreen"
```

---

### Task 5: Wire DestinationBanner + Next Step into NavigationScreen.web.js

**Files:**
- Modify: `src/screens/NavigationScreen.web.js`

**Step 1: Same changes as Task 4, applied to the web file**

- Add `import DestinationBanner` at top
- Add `isLastWalkingLeg` useMemo
- Add `<DestinationBanner>` as first child in `bottomSection`
- Update `<WalkingInstructionCard>` props: remove `nextStep` and `nextTransitLeg`, add `onNextStep={advanceLeg}`

**Step 2: Commit**

```bash
git add src/screens/NavigationScreen.web.js
git commit -m "feat(nav): wire DestinationBanner and Next Step into web NavigationScreen"
```

---

### Task 6: Verify Build and Test

**Step 1: Run tests**
```bash
npm test
```

**Step 2: Verify no build errors**
```bash
npx expo start --no-dev --minify 2>&1 | head -20
```

**Step 3: Final commit if any fixes needed**

---

## File Change Summary

| File | Action |
|------|--------|
| `src/components/navigation/DestinationBanner.js` | CREATE |
| `src/components/navigation/WalkingInstructionCard.js` | MODIFY (strip down + add Next Step) |
| `src/components/navigation/StepOverviewSheet.js` | MODIFY (remove toggle text) |
| `src/screens/NavigationScreen.js` | MODIFY (add banner + wire props) |
| `src/screens/NavigationScreen.web.js` | MODIFY (same as native) |
