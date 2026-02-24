import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../../config/theme';

const SingleSelectInput = ({ options = [], value, onChange }) => {
  return (
    <View style={styles.container}>
      {options.map((option) => {
        const selected = value === option;
        return (
          <TouchableOpacity
            key={option}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => onChange(option)}
            accessibilityLabel={option}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected && <View style={styles.radioInner} />}
            </View>
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
              {option}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySubtle,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.grey400,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  radioSelected: {
    borderColor: COLORS.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  chipText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
  },
  chipTextSelected: {
    fontWeight: '600',
    color: COLORS.primaryDark,
  },
});

export default SingleSelectInput;
