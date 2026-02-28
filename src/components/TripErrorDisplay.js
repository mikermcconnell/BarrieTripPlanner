/**
 * TripErrorDisplay - Rich error display component for trip planning errors
 * Shows error icon, title, message, suggestions (if any), and retry button (if retryable)
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SHADOWS } from '../config/theme';
import { getErrorConfig } from '../config/errorMessages';
import Icon from './Icon';

const TripErrorDisplay = ({ error, onRetry }) => {
  // Get error configuration based on error code
  const errorCode = error?.code || 'NETWORK_ERROR';
  const config = getErrorConfig(errorCode);

  // Map icon names to Icon components
  const getIcon = (iconName) => {
    const iconSize = 32;
    const iconColor = COLORS.error;
    switch (iconName) {
      case 'server':
        return <Text style={styles.icon}>🖥️</Text>;
      case 'wifi-off':
        return <Text style={styles.icon}>📶</Text>;
      case 'route':
        return <Icon name="Bus" size={iconSize} color={iconColor} />;
      case 'map-marker-off':
        return <Icon name="MapPin" size={iconSize} color={iconColor} />;
      case 'clock':
        return <Icon name="Clock" size={iconSize} color={iconColor} />;
      default:
        return <Icon name="Warning" size={iconSize} color={iconColor} />;
    }
  };

  return (
    <View style={styles.container}>
      {/* Icon */}
      <View style={styles.iconContainer}>
        {getIcon(config.icon)}
      </View>

      {/* Title */}
      <Text style={styles.title}>{config.title}</Text>

      {/* Message */}
      <Text style={styles.message}>{config.message}</Text>

      {/* Suggestions */}
      {config.suggestions && config.suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsTitle}>Suggestions:</Text>
          {config.suggestions.map((suggestion, index) => (
            <View key={index} style={styles.suggestionRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Retry Button */}
      {config.retryable && onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.7}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.small,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.errorSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  message: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: FONT_SIZES.md * 1.5,
    marginBottom: SPACING.md,
  },
  suggestionsContainer: {
    width: '100%',
    backgroundColor: COLORS.grey50,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  suggestionsTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.xs,
  },
  bullet: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginRight: SPACING.sm,
    marginTop: 1,
  },
  suggestionText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: FONT_SIZES.sm * 1.4,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.round,
    marginTop: SPACING.sm,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default TripErrorDisplay;
