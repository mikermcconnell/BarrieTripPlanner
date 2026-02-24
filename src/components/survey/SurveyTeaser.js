import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { surveyService } from '../../services/firebase/surveyService';
import { useSurveyAggregates } from '../../hooks/useSurveyAggregates';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../config/theme';

/**
 * Small card showing community rating stat + CTA to take the survey.
 * Renders on ProfileScreen. Hides if no active survey or already submitted.
 */
const SurveyTeaser = ({ onPress }) => {
  const [survey, setSurvey] = useState(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const { aggregates } = useSurveyAggregates(survey?.id);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const active = await surveyService.getActiveSurvey();
      if (cancelled || !active) return;
      setSurvey(active);

      const submitted = await surveyService.checkAlreadySubmitted(active.id);
      if (!cancelled) setAlreadySubmitted(submitted);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (!survey) return null;

  const starStats = aggregates?.questionStats
    ? Object.values(aggregates.questionStats).find((s) => s.type === 'star_rating')
    : null;
  const average = starStats?.average;
  const count = aggregates?.totalResponses || 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.row}>
        <View style={styles.ratingContainer}>
          {average != null ? (
            <>
              <Text style={styles.stars}>
                {'\u2605'.repeat(Math.round(average))}
                {'\u2606'.repeat(5 - Math.round(average))}
              </Text>
              <Text style={styles.average}>{average}/5</Text>
              <Text style={styles.count}>({count})</Text>
            </>
          ) : (
            <Text style={styles.noData}>Be the first to rate!</Text>
          )}
        </View>
        <Text style={styles.cta}>
          {alreadySubmitted ? 'View Results \u203A' : 'Take Survey \u203A'}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.primarySubtle,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.small,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  stars: {
    fontSize: 16,
    color: COLORS.accent,
  },
  average: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  count: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  noData: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  cta: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },
});

export default SurveyTeaser;
