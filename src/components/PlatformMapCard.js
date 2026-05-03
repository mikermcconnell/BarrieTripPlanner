import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';

const PlatformMapCard = ({ platformMap, onPress }) => {
  const handlePress = useCallback(() => {
    if (platformMap) onPress?.(platformMap);
  }, [onPress, platformMap]);

  if (!platformMap) return null;

  return (
    <View style={styles.card}>
      <View style={styles.iconBadge}>
        <Text style={styles.iconText}>🗺️</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Platform map available</Text>
        <Text style={styles.body}>{`Find your bus platform at ${platformMap.displayName}.`}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={`Open platform map for ${platformMap.displayName}`}
        >
          <Text style={styles.buttonText}>Open platform map</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.primarySubtle,
    backgroundColor: COLORS.primarySubtle,
    gap: SPACING.md,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  iconText: {
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xxs,
  },
  body: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginBottom: SPACING.sm,
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  buttonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.white,
  },
});

export default PlatformMapCard;

