import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS } from '../config/theme';

const LoadingSkeleton = ({ width, height, borderRadius = BORDER_RADIUS.md, style }) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
};

// Pre-built skeleton components
export const SkeletonCard = ({ style }) => (
  <View style={[styles.card, style]}>
    <View style={styles.cardHeader}>
      <LoadingSkeleton width={48} height={48} borderRadius={24} />
      <View style={styles.cardHeaderText}>
        <LoadingSkeleton width={150} height={16} style={styles.marginBottom} />
        <LoadingSkeleton width={100} height={12} />
      </View>
    </View>
    <LoadingSkeleton width="100%" height={40} style={styles.marginTop} />
  </View>
);

export const SkeletonListItem = ({ style }) => (
  <View style={[styles.listItem, style]}>
    <LoadingSkeleton width={44} height={44} borderRadius={22} />
    <View style={styles.listItemContent}>
      <LoadingSkeleton width={180} height={14} style={styles.marginBottom} />
      <LoadingSkeleton width={120} height={12} />
    </View>
    <LoadingSkeleton width={60} height={24} borderRadius={BORDER_RADIUS.sm} />
  </View>
);

export const SkeletonMapOverlay = () => (
  <View style={styles.mapOverlay}>
    <LoadingSkeleton width="90%" height={40} borderRadius={BORDER_RADIUS.lg} style={styles.marginBottom} />
    <View style={styles.filterRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <LoadingSkeleton
          key={i}
          width={50}
          height={28}
          borderRadius={BORDER_RADIUS.round}
          style={styles.filterItem}
        />
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: COLORS.grey300,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderText: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  marginBottom: {
    marginBottom: SPACING.xs,
  },
  marginTop: {
    marginTop: SPACING.md,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  listItemContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  mapOverlay: {
    position: 'absolute',
    top: 50,
    left: SPACING.md,
    right: SPACING.md,
  },
  filterRow: {
    flexDirection: 'row',
    marginTop: SPACING.sm,
  },
  filterItem: {
    marginRight: SPACING.xs,
  },
});

export default LoadingSkeleton;
