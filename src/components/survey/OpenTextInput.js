import React from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../../config/theme';

const MAX_CHARS = 500;

const OpenTextInput = ({ value = '', onChange, placeholder = 'Type your response...' }) => {
  const charCount = (value || '').length;

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(text) => onChange(text.slice(0, MAX_CHARS))}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textDisabled}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        maxLength={MAX_CHARS}
        accessibilityLabel="Open text response"
      />
      <Text style={[styles.counter, charCount >= MAX_CHARS && styles.counterLimit]}>
        {charCount} / {MAX_CHARS}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: SPACING.md,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
    minHeight: 120,
  },
  counter: {
    alignSelf: 'flex-end',
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  counterLimit: {
    color: COLORS.error,
  },
});

export default OpenTextInput;
