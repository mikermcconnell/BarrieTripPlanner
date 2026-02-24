import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SHADOWS } from '../../config/theme';

const NUDGE_FLAG_KEY = '@barrie_transit_show_survey_nudge';
const DISMISS_COUNT_KEY = '@barrie_transit_survey_nudge_dismiss_count';
const MAX_DISMISSALS = 3;

/**
 * Dismissible post-trip banner: "How was your trip? Share feedback"
 * Shows when NUDGE_FLAG_KEY is set. Suppresses after MAX_DISMISSALS.
 * Placed absolutely on HomeScreen.
 */
const SurveyNudgeBanner = ({ onTakeSurvey, style }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const nudgeFlag = await AsyncStorage.getItem(NUDGE_FLAG_KEY);
      if (nudgeFlag !== 'true') return;

      const dismissCount = parseInt(await AsyncStorage.getItem(DISMISS_COUNT_KEY) || '0', 10);
      if (dismissCount >= MAX_DISMISSALS) {
        // Permanently suppressed — clean up the flag
        await AsyncStorage.removeItem(NUDGE_FLAG_KEY);
        return;
      }

      if (!cancelled) setVisible(true);
    }
    check();
    return () => { cancelled = true; };
  }, []);

  const handleDismiss = async () => {
    setVisible(false);
    const current = parseInt(await AsyncStorage.getItem(DISMISS_COUNT_KEY) || '0', 10);
    await AsyncStorage.setItem(DISMISS_COUNT_KEY, String(current + 1));
    await AsyncStorage.removeItem(NUDGE_FLAG_KEY);
  };

  const handleTakeSurvey = async () => {
    setVisible(false);
    await AsyncStorage.removeItem(NUDGE_FLAG_KEY);
    // Reset dismiss count on engagement
    await AsyncStorage.removeItem(DISMISS_COUNT_KEY);
    if (onTakeSurvey) onTakeSurvey();
  };

  if (!visible) return null;

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity style={styles.content} onPress={handleTakeSurvey} activeOpacity={0.9}>
        <View style={styles.textContainer}>
          <Text style={styles.title}>How was your trip?</Text>
          <Text style={styles.subtitle}>Share feedback to help improve transit</Text>
        </View>
        <Text style={styles.cta}>Rate {'\u203A'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss}>
        <Text style={styles.dismissText}>{'\u2715'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100,
    left: SPACING.md,
    right: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primarySubtle,
    borderRadius: BORDER_RADIUS.lg,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.medium,
    zIndex: 997,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 16px rgba(76, 175, 80, 0.15)',
    }),
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.sm,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  cta: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
    marginLeft: SPACING.sm,
  },
  dismissButton: {
    padding: SPACING.md,
  },
  dismissText: {
    fontSize: 16,
    color: COLORS.grey500,
  },
});

export default SurveyNudgeBanner;
