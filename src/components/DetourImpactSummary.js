import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BORDER_RADIUS, COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../config/theme';
import { getUniqueDetourSections } from '../utils/detourHelpers';

const uniqueStops = (stops = []) => {
  const seen = new Set();
  return stops.filter((stop) => {
    const key = String(stop?.id ?? stop?.stop_id ?? stop?.code ?? stop?.name ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const StopList = ({ stops = [], emptyMessage }) => {
  const displayStops = uniqueStops(stops);

  return (
    <View style={styles.listBlock}>
      {displayStops.length > 0 ? (
        <View style={styles.stopList}>
          {displayStops.map((stop, index) => (
            <View
              key={`stop-not-served-${stop?.id ?? stop?.code ?? stop?.name ?? index}-${index}`}
              style={styles.stopRow}
            >
              <View style={[styles.stopMarker, styles.stopMarkerWarning]} />
              <Text style={styles.stopName}>
                {stop?.name ?? 'Unnamed stop'}
                {stop?.code ? ` (#${stop.code})` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      )}
    </View>
  );
};

const DetourImpactSummary = ({ routeId, sections = [] }) => {
  const [expanded, setExpanded] = useState(false);
  const normalizedSections = getUniqueDetourSections(sections);
  const skippedStops = useMemo(
    () => uniqueStops(normalizedSections.flatMap((section) => (
      Array.isArray(section?.skippedStops) ? section.skippedStops : []
    ))),
    [normalizedSections]
  );
  const skippedCount = skippedStops.length;
  const routeLabel = routeId ? `Route ${routeId}` : 'This route';

  if (normalizedSections.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.cardTitle}>Affected stops</Text>
        <View style={styles.card}>
          <Text style={styles.emptyText}>Detour stop impact is still resolving.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{routeLabel} detour impact</Text>
        <Text style={styles.guidanceText}>
          {skippedCount > 0
            ? `${skippedCount} regular stop${skippedCount === 1 ? '' : 's'} may be missed.`
            : 'Stop impact is still being confirmed.'}
        </Text>
        <Text style={styles.guidanceHint}>
          Use an open stop before the detour starts or after the route rejoins.
        </Text>

        <TouchableOpacity
          style={styles.expandButton}
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Hide stops not served' : 'View stops not served'}
        >
          <Text style={styles.expandButtonText}>
            {expanded ? 'Hide stops' : `View stops not served (${skippedCount})`}
          </Text>
        </TouchableOpacity>

        {expanded ? (
          <StopList
            stops={skippedStops}
            emptyMessage="No skipped stops are confirmed yet. Check the map for the active detour area."
          />
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  cardTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  guidanceText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  guidanceHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  listBlock: {
    gap: SPACING.xs,
  },
  expandButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.grey300,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.round,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  expandButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
  },
  stopList: {
    gap: SPACING.xs,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  stopMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  stopMarkerDefault: {
    backgroundColor: COLORS.primary,
  },
  stopMarkerWarning: {
    backgroundColor: COLORS.error,
  },
  stopName: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    lineHeight: 20,
  },
});

export default DetourImpactSummary;
