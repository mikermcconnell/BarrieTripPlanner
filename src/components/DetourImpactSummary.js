import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BORDER_RADIUS, COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../config/theme';

const StopList = ({ title, subtitle, stops = [], variant = 'default', emptyMessage }) => {
  const markerStyle = variant === 'warning' ? styles.stopMarkerWarning : styles.stopMarkerDefault;
  const titleStyle = variant === 'warning' ? styles.listTitleWarning : styles.listTitle;

  return (
    <View style={styles.listBlock}>
      <Text style={titleStyle}>{title}</Text>
      {subtitle ? <Text style={styles.listSubtitle}>{subtitle}</Text> : null}
      {stops.length > 0 ? (
        <View style={styles.stopList}>
          {stops.map((stop, index) => (
            <View key={`${title}-${stop?.id ?? stop?.code ?? stop?.name ?? index}-${index}`} style={styles.stopRow}>
              <View style={[styles.stopMarker, markerStyle]} />
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

const getRouteImpactLabel = (routeId) => (routeId ? `Route ${routeId}` : 'this route');

const SegmentSummary = ({ routeId, section, index, showHeading }) => {
  const affectedStops = Array.isArray(section?.affectedStops) ? section.affectedStops : [];
  const skippedStops = Array.isArray(section?.skippedStops) ? section.skippedStops : [];
  const unaffectedStops = Array.isArray(section?.unaffectedStops) ? section.unaffectedStops : [];
  const startStopName = section?.entryStopName ?? section?.entryStop?.name ?? null;
  const endStopName = section?.exitStopName ?? section?.exitStop?.name ?? null;
  const routeLabel = getRouteImpactLabel(routeId);

  return (
    <View style={styles.card}>
      {showHeading ? <Text style={styles.cardTitle}>Affected Section {index + 1}</Text> : null}

      <View style={styles.startEndRow}>
        <View style={styles.startEndCard}>
          <Text style={styles.startEndLabel}>Detour starts</Text>
          <Text style={styles.startEndValue}>{startStopName ?? 'Start point still resolving'}</Text>
        </View>
        <View style={styles.startEndCard}>
          <Text style={styles.startEndLabel}>Detour ends</Text>
          <Text style={styles.startEndValue}>{endStopName ?? 'End point still resolving'}</Text>
        </View>
      </View>

      <StopList
        title={`Impacted stops (${affectedStops.length})`}
        subtitle={`Stops inside the current ${routeLabel} detour section, including the start and end boundary stops.`}
        stops={affectedStops}
        emptyMessage="Impacted stops are still resolving for this detour."
      />

      <StopList
        title={`Not served on ${routeLabel} (${skippedStops.length})`}
        subtitle={`Regular ${routeLabel} stops the detoured bus is skipping right now.`}
        stops={skippedStops}
        variant="warning"
        emptyMessage="No skipped stops were identified inside this detour section."
      />

      <StopList
        title={`Still served on ${routeLabel} (${unaffectedStops.length})`}
        subtitle={`${routeLabel} stops outside the detour section that remain on the scheduled path.`}
        stops={unaffectedStops}
        emptyMessage="All known route stops fall inside the current affected section."
      />
    </View>
  );
};

const DetourImpactSummary = ({ routeId, sections = [] }) => {
  const normalizedSections = Array.isArray(sections) ? sections.filter(Boolean) : [];

  if (normalizedSections.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionHeading}>Stop Impact</Text>
        <View style={styles.card}>
          <Text style={styles.emptyText}>Detour stop impact is still resolving.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeading}>Stop Impact</Text>
      {normalizedSections.map((section, index) => (
        <SegmentSummary
          key={`detour-impact-section-${index}`}
          routeId={routeId}
          section={section}
          index={index}
          showHeading={normalizedSections.length > 1}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  sectionHeading: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
  startEndRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  startEndCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.grey200,
  },
  startEndLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  startEndValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  listBlock: {
    gap: SPACING.xs,
  },
  listTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  listTitleWarning: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.error,
  },
  listSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 18,
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
