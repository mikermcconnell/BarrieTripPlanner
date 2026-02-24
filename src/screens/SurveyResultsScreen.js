import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSurveyAggregates } from '../hooks/useSurveyAggregates';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';

const SurveyResultsScreen = ({ navigation, route }) => {
  const surveyId = route?.params?.surveyId;
  const { aggregates, loading } = useSurveyAggregates(surveyId);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!aggregates) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>{'\u2190'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Community Results</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No results yet. Be the first to share feedback!</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>{'\u2190'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Community Results</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Total responses badge */}
        <View style={styles.totalCard}>
          <Text style={styles.totalValue}>{aggregates.totalResponses}</Text>
          <Text style={styles.totalLabel}>
            rider{aggregates.totalResponses !== 1 ? 's' : ''} responded
          </Text>
        </View>

        {/* Question breakdowns */}
        {Object.entries(aggregates.questionStats || {}).map(([questionId, stats]) => (
          <View key={questionId} style={styles.questionCard}>
            {stats.type === 'star_rating' && (
              <StarRatingResult stats={stats} />
            )}
            {stats.type === 'single_select' && (
              <SingleSelectResult stats={stats} />
            )}
            {stats.type === 'open_text' && (
              <OpenTextResult stats={stats} />
            )}
          </View>
        ))}

        <TouchableOpacity style={styles.doneButton} onPress={() => navigation.goBack()}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

// ─── Sub-components ────────────────────────────────────────────

const StarRatingResult = ({ stats }) => {
  const maxCount = Math.max(...Object.values(stats.distribution || {}), 1);

  return (
    <View>
      <View style={styles.ratingHeader}>
        <Text style={styles.ratingAverage}>{stats.average}</Text>
        <Text style={styles.ratingStars}>
          {'\u2605'.repeat(Math.round(stats.average))}
          {'\u2606'.repeat(5 - Math.round(stats.average))}
        </Text>
      </View>
      <Text style={styles.ratingCount}>{stats.count} ratings</Text>

      {/* Distribution bars */}
      {[5, 4, 3, 2, 1].map((star) => {
        const count = stats.distribution?.[String(star)] || 0;
        const pct = stats.count > 0 ? (count / stats.count) * 100 : 0;
        return (
          <View key={star} style={styles.barRow}>
            <Text style={styles.barLabel}>{star}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${(count / maxCount) * 100}%` }]} />
            </View>
            <Text style={styles.barPct}>{Math.round(pct)}%</Text>
          </View>
        );
      })}
    </View>
  );
};

const SingleSelectResult = ({ stats }) => {
  const total = stats.count || 1;
  const entries = Object.entries(stats.distribution || {}).sort((a, b) => b[1] - a[1]);
  const maxCount = entries.length > 0 ? entries[0][1] : 1;

  return (
    <View>
      <Text style={styles.selectCount}>{stats.count} responses</Text>
      {entries.map(([option, count]) => {
        const pct = (count / total) * 100;
        return (
          <View key={option} style={styles.barRow}>
            <Text style={[styles.barLabel, styles.barLabelWide]}>{option}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${(count / maxCount) * 100}%` }]} />
            </View>
            <Text style={styles.barPct}>{Math.round(pct)}%</Text>
          </View>
        );
      })}
    </View>
  );
};

const OpenTextResult = ({ stats }) => (
  <View style={styles.openTextContainer}>
    <Text style={styles.openTextCount}>{stats.count} written response{stats.count !== 1 ? 's' : ''}</Text>
    <Text style={styles.openTextNote}>Written feedback is reviewed by staff</Text>
  </View>
);

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
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
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxxl,
  },
  totalCard: {
    backgroundColor: COLORS.primarySubtle,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  totalValue: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '700',
    color: COLORS.primary,
  },
  totalLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primaryDark,
    marginTop: SPACING.xs,
  },
  questionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.small,
  },
  ratingHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  ratingAverage: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  ratingStars: {
    fontSize: FONT_SIZES.xl,
    color: COLORS.accent,
  },
  ratingCount: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  selectCount: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  barLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    width: 20,
    textAlign: 'center',
  },
  barLabelWide: {
    width: 100,
    textAlign: 'left',
  },
  barTrack: {
    flex: 1,
    height: 12,
    backgroundColor: COLORS.grey100,
    borderRadius: 6,
    marginHorizontal: SPACING.sm,
    overflow: 'hidden',
  },
  barFill: {
    height: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    minWidth: 4,
  },
  barPct: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    width: 36,
    textAlign: 'right',
  },
  openTextContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  openTextCount: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  openTextNote: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  doneButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  doneButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});

export default SurveyResultsScreen;
