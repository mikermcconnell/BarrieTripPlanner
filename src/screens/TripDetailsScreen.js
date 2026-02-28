import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TripStep from '../components/TripStep';
import FareInfoPanel from '../components/FareInfoPanel';
import { formatDuration, formatTimeFromTimestamp, formatDistance } from '../services/tripService';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';
import Icon from '../components/Icon';

const TripDetailsScreen = ({ route, navigation }) => {
  const { itinerary } = route.params;

  const startTime = formatTimeFromTimestamp(itinerary.startTime);
  const endTime = formatTimeFromTimestamp(itinerary.endTime);
  const duration = formatDuration(itinerary.duration);
  const walkDistance = formatDistance(itinerary.walkDistance);
  const walkTime = formatDuration(itinerary.walkTime);

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

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
              <Text style={styles.chipIcon}>🚶</Text>
              <Text style={styles.chipText}>{walkDistance} walk</Text>
            </View>
            {itinerary.transfers > 0 && (
              <View style={styles.chip}>
                <Text style={styles.chipIcon}>🔄</Text>
                <Text style={styles.chipText}>{itinerary.transfers} transfer{itinerary.transfers !== 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Step-by-Step Directions */}
        <View style={styles.stepsContainer}>
          <Text style={styles.stepsTitle}>Step-by-Step Directions</Text>

          {itinerary.legs.map((leg, index) => (
            <TripStep
              key={index}
              leg={leg}
              isFirst={index === 0}
              isLast={index === itinerary.legs.length - 1}
            />
          ))}
        </View>

        {/* Fare Information */}
        <FareInfoPanel />

      </ScrollView>

      {/* Start Navigation Button */}
      <View style={styles.footer}>
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
