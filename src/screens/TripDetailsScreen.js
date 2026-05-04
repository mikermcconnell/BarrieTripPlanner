import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import TripStep from '../components/TripStep';
import FareInfoPanel from '../components/FareInfoPanel';
import { formatDuration, formatTimeFromTimestamp, formatDistance } from '../services/tripService';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';
import Icon from '../components/Icon';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';
import {
  getEffectiveTransferCount,
  isSameBusContinuation,
} from '../utils/routeContinuity';

const isRideLeg = (leg) => (
  leg?.isOnDemand ||
  leg?.mode === 'BUS' ||
  leg?.mode === 'TRANSIT' ||
  leg?.mode === 'ON_DEMAND'
);

const formatStopName = (stop) => {
  if (!stop) return 'transfer stop';
  const code = stop.stopCode || stop.stopId || stop.code;
  const name = stop.name || 'transfer stop';
  return code ? `${name} (#${code})` : name;
};

const getRideLabel = (leg) => {
  if (leg?.isOnDemand || leg?.mode === 'ON_DEMAND') return leg?.zoneName || 'on-demand ride';
  return `Route ${leg?.route?.shortName || 'bus'}`;
};

const getTransferAfterLeg = (legs, index) => {
  const currentLeg = legs[index];
  if (!isRideLeg(currentLeg)) return null;

  const nextRideIndex = legs.findIndex((leg, legIndex) => legIndex > index && isRideLeg(leg));
  if (nextRideIndex === -1) return null;

  const nextRideLeg = legs[nextRideIndex];
  if (
    isSameBusContinuation(
      { leg: currentLeg, index },
      { leg: nextRideLeg, index: nextRideIndex },
      legs
    )
  ) {
    return null;
  }
  if (!Number.isFinite(currentLeg.endTime) || !Number.isFinite(nextRideLeg.startTime)) return null;

  const transferSeconds = Math.max(0, Math.round((nextRideLeg.startTime - currentLeg.endTime) / 1000));
  const transferWalkSeconds = legs
    .slice(index + 1, nextRideIndex)
    .filter((leg) => leg.mode === 'WALK' && Number.isFinite(leg.duration))
    .reduce((total, leg) => total + leg.duration, 0);

  return {
    transferSeconds,
    transferWalkSeconds,
    location: nextRideLeg.from || currentLeg.to,
    getOffLabel: getRideLabel(currentLeg),
    boardLabel: getRideLabel(nextRideLeg),
    getOffTime: currentLeg.endTime,
    boardTime: nextRideLeg.startTime,
  };
};

const TransferWaitStep = ({ transfer, sequence = null, total = null }) => {
  if (!transfer) return null;

  const transferDuration = formatDuration(transfer.transferSeconds);
  const getOffTime = formatTimeFromTimestamp(transfer.getOffTime);
  const boardTime = formatTimeFromTimestamp(transfer.boardTime);
  const transferLabel = sequence && total && total > 1
    ? `Transfer ${sequence} of ${total}`
    : 'Transfer';

  return (
    <View style={styles.transferStep}>
      <View style={styles.transferTimeline}>
        <View style={styles.transferDot} />
        <View style={styles.transferLine} />
      </View>
      <View style={styles.transferContent}>
        <Text style={styles.transferEyebrow}>{transferLabel}</Text>
        <View style={styles.transferCard}>
          <View style={styles.transferHeaderRow}>
            <Icon name="Transfer" size={18} color={COLORS.primaryDark} />
            <Text style={styles.transferTitle}>{transferDuration} between buses</Text>
          </View>
          <Text style={styles.transferLocation}>{formatStopName(transfer.location)}</Text>
          <Text style={styles.transferDetail}>
            Get off {transfer.getOffLabel} at {getOffTime}
          </Text>
          <Text style={styles.transferDetail}>
            Board {transfer.boardLabel} at {boardTime}
          </Text>
          {transfer.transferWalkSeconds > 0 ? (
            <Text style={styles.transferMeta}>
              Includes about {formatDuration(transfer.transferWalkSeconds)} walking between stops.
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const TripDetailsScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);
  const { itinerary } = route.params;

  const startTime = formatTimeFromTimestamp(itinerary.startTime);
  const endTime = formatTimeFromTimestamp(itinerary.endTime);
  const duration = formatDuration(itinerary.duration);
  const walkDistance = formatDistance(itinerary.walkDistance);
  const walkTime = formatDuration(itinerary.walkTime);
  const effectiveTransfers = getEffectiveTransferCount(itinerary);
  const transferSteps = new Map();
  let transferStepCount = 0;
  itinerary.legs.forEach((_, index) => {
    const transfer = getTransferAfterLeg(itinerary.legs, index);
    if (transfer) {
      transferStepCount += 1;
      transferSteps.set(index, {
        transfer,
        sequence: transferStepCount,
      });
    }
  });

  // Start in-app navigation
  const startNavigation = () => {
    if (!itinerary.legs || itinerary.legs.length === 0) {
      Alert.alert('Navigation Unavailable', 'No route data available for navigation.');
      return;
    }

    // Navigate to the in-app navigation screen
    navigation.navigate('Navigation', { itinerary });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="X" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Details</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: addSafeBottomPadding(SPACING.md, bottomInset) }}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Card */}
        <View style={styles.summaryCard}>
          {/* Hero duration */}
          <Text style={styles.durationHero}>{duration}</Text>

          {/* Time range row */}
          <View style={styles.timeRangeRow}>
            <Text style={styles.timeText}>{startTime}</Text>
            <Icon name="Route" size={20} color={COLORS.textSecondary} />
            <Text style={styles.timeText}>{endTime}</Text>
          </View>

          {/* Compact chips */}
          <View style={styles.chipsRow}>
            <View style={styles.chip}>
              <Icon name="Walk" size={16} color={COLORS.textSecondary} />
              <Text style={styles.chipText}>{walkDistance} walk</Text>
            </View>
            {effectiveTransfers > 0 && (
              <View style={styles.chip}>
                <Icon name="Transfer" size={16} color={COLORS.textSecondary} />
                <Text style={styles.chipText}>{effectiveTransfers} transfer{effectiveTransfers !== 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Step-by-Step Directions */}
        <View style={styles.stepsContainer}>
          <Text style={styles.stepsTitle}>Step-by-Step Directions</Text>

          {itinerary.legs.map((leg, index) => (
            <React.Fragment key={index}>
              <TripStep
                leg={leg}
                isFirst={index === 0}
                isLast={index === itinerary.legs.length - 1}
              />
              <TransferWaitStep
                transfer={transferSteps.get(index)?.transfer}
                sequence={transferSteps.get(index)?.sequence}
                total={transferStepCount}
              />
            </React.Fragment>
          ))}
        </View>

        {/* Fare Information */}
        <FareInfoPanel />

      </ScrollView>

      {/* Start Navigation Button */}
      <View style={[
        styles.footer,
        { paddingBottom: addSafeBottomPadding(SPACING.md, bottomInset) },
      ]}>
        <TouchableOpacity style={styles.startButton} onPress={startNavigation}>
          <Text style={styles.startButtonText}>Start Navigation</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.textPrimary,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    margin: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.small,
  },
  durationHero: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  timeRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  timeText: {
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  chipsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.grey100,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  chipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  chipIcon: {
    fontSize: 14,
  },
  stepsContainer: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.small,
  },
  stepsTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  transferStep: {
    flexDirection: 'row',
  },
  transferTimeline: {
    width: 24,
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  transferDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  transferLine: {
    flex: 1,
    width: 2,
    backgroundColor: COLORS.grey300,
    marginVertical: 4,
  },
  transferContent: {
    flex: 1,
    paddingBottom: SPACING.md,
  },
  transferEyebrow: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  transferCard: {
    backgroundColor: COLORS.primarySubtle,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginLeft: 50,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  transferHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: 2,
  },
  transferTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  transferLocation: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  transferDetail: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  transferMeta: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primaryDark,
    fontWeight: '600',
    marginTop: SPACING.xs,
  },
  footer: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  startButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  startButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
});

export default TripDetailsScreen;
