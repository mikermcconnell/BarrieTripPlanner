import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS, FONT_FAMILIES } from '../config/theme';
import { getSystemHealthBannerState } from '../utils/systemHealthUI';

const toneStyles = {
  neutral: {
    backgroundColor: COLORS.grey100,
    borderColor: COLORS.grey300,
    textColor: COLORS.textPrimary,
    actionColor: COLORS.textPrimary,
  },
  warning: {
    backgroundColor: COLORS.warningSubtle,
    borderColor: COLORS.warning,
    textColor: COLORS.textPrimary,
    actionColor: COLORS.warning,
  },
  error: {
    backgroundColor: COLORS.errorSubtle,
    borderColor: COLORS.error,
    textColor: COLORS.textPrimary,
    actionColor: COLORS.error,
  },
};

export default function SystemHealthBanner({
  diagnostics,
  onRetryStatic,
  onRetryRealtime,
  onRetryProxy,
}) {
  const banner = useMemo(() => getSystemHealthBannerState(diagnostics), [diagnostics]);

  if (!banner) {
    return null;
  }

  const tone = toneStyles[banner.tone] || toneStyles.warning;
  const handlePress = banner.actionKey === 'static'
    ? onRetryStatic
    : banner.actionKey === 'realtime'
    ? onRetryRealtime
    : banner.actionKey === 'proxy'
    ? onRetryProxy
    : null;

  return (
    <View style={[styles.banner, { backgroundColor: tone.backgroundColor, borderLeftColor: tone.borderColor }]}>
      <Text style={[styles.title, { color: tone.textColor }]}>{banner.title}</Text>
      {banner.detail ? (
        <Text style={[styles.detail, { color: tone.textColor }]}>
          {banner.detail}
        </Text>
      ) : null}
      {banner.actionLabel && typeof handlePress === 'function' && (
        <TouchableOpacity onPress={handlePress} style={styles.actionButton}>
          <Text style={[styles.actionText, { color: tone.actionColor }]}>
            {banner.actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginTop: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderLeftWidth: 4,
    ...SHADOWS.small,
  },
  title: {
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.semibold,
  },
  detail: {
    marginTop: 2,
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.medium,
  },
  actionButton: {
    alignSelf: 'flex-start',
    marginTop: SPACING.xs,
  },
  actionText: {
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.semibold,
  },
});
