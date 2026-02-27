import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';

function formatDetourTime(detectedAt) {
  if (!detectedAt) return null;
  const date = detectedAt instanceof Date ? detectedAt : new Date(detectedAt);
  if (isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 60) {
    return `Since ${diffMin} min ago`;
  }
  return `Since ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

const DetourDetailsSheet = ({ routeId, detour, affectedStops, onClose, onViewOnMap }) => {
  const [slideAnim] = useState(new Animated.Value(100));
  // Keep a ref to onClose so the Escape key handler never captures a stale value
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Slide-in animation on mount
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, []);

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 100,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onCloseRef.current?.());
  }, [slideAnim]);

  // Escape key handler — uses ref so it's never stale
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleClose]);

  const routeColor = ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT;
  const timeLabel = formatDetourTime(detour?.detectedAt);

  return (
    <>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
        accessibilityLabel="Close detour details"
      />
      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: [0, 400],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.handleBar} />

        <View style={styles.header}>
          <View style={[styles.routeDot, { backgroundColor: routeColor }]} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Route {routeId} — Detour Active</Text>
            {timeLabel && <Text style={styles.timeLabel}>{timeLabel}</Text>}
          </View>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close detour details"
          >
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
          {affectedStops && affectedStops.length > 0 ? (
            <View style={styles.stopsSection}>
              <Text style={styles.sectionHeader}>Skipped Stops</Text>
              {affectedStops.map((stop) => (
                <View key={stop.id} style={styles.stopRow}>
                  <Text style={styles.stopIcon}>✕</Text>
                  <Text style={styles.stopName}>{stop.name}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>Detour detected — stop details pending</Text>
          )}

          <TouchableOpacity
            style={styles.viewButton}
            onPress={onViewOnMap}
            accessibilityRole="button"
            accessibilityLabel="View detour on map"
          >
            <Text style={styles.viewButtonText}>View on Map</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 999,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '60%',
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
    zIndex: 1000,
    paddingBottom: SPACING.xl,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.grey300,
    alignSelf: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  routeDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: SPACING.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  timeLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeButton: {
    padding: SPACING.sm,
    cursor: 'pointer',
  },
  closeIcon: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.grey200,
    marginVertical: SPACING.md,
    marginHorizontal: SPACING.lg,
  },
  scrollArea: {
    paddingHorizontal: SPACING.lg,
  },
  scrollContent: {
    paddingBottom: SPACING.lg,
  },
  stopsSection: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  stopIcon: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
    marginRight: SPACING.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  stopName: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginBottom: SPACING.lg,
  },
  viewButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  viewButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default DetourDetailsSheet;
