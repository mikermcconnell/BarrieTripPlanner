import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { COLORS, SPACING } from '../../config/theme';

const STAR_SIZE = 40;

const StarRatingInput = ({ value, maxStars = 5, onChange }) => {
  const stars = [];
  for (let i = 1; i <= maxStars; i++) {
    const filled = i <= (value || 0);
    stars.push(
      <TouchableOpacity
        key={i}
        onPress={() => onChange(i)}
        style={styles.starButton}
        accessibilityLabel={`${i} star${i !== 1 ? 's' : ''}`}
        accessibilityRole="button"
      >
        <Text style={[styles.star, filled && styles.starFilled]}>
          {filled ? '\u2605' : '\u2606'}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.starsRow}>{stars}</View>
      {value > 0 && (
        <Text style={styles.label}>{value} / {maxStars}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  starsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  starButton: {
    padding: SPACING.xs,
  },
  star: {
    fontSize: STAR_SIZE,
    color: COLORS.grey300,
  },
  starFilled: {
    color: COLORS.accent,
  },
  label: {
    marginTop: SPACING.sm,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});

export default StarRatingInput;
