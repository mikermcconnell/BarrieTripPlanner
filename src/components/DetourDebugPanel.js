/**
 * DetourDebugPanel
 *
 * Dev-only diagnostic panel showing active and archived auto-detected detours.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SHADOWS } from '../config/theme';

const formatRelativeMinutes = (timestamp) => {
  if (!timestamp) return 'n/a';
  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return '<1m ago';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `${hours}h ${minutes}m ago`;
};

const formatConfidence = (detour) => {
  const scoreText =
    typeof detour.confidenceScore === 'number' ? `${Math.round(detour.confidenceScore)}%` : 'n/a';
  return `${detour.confidenceLevel || 'suspected'} (${scoreText})`;
};

const getStatusColor = (status) => {
  if (status === 'cleared') return COLORS.info;
  if (status === 'expired') return COLORS.grey600;
  return COLORS.warning;
};

const DetourCard = ({ detour, archived = false }) => {
  const status = archived ? detour.archiveReason || detour.status || 'archived' : detour.status || 'suspected';
  const statusColor = getStatusColor(status);

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <Text style={styles.routeText}>Route {detour.routeId || 'unknown'}</Text>
        <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
          <Text style={styles.statusPillText}>{status}</Text>
        </View>
      </View>
      <Text style={styles.metaLine}>Confidence: {formatConfidence(detour)}</Text>
      <Text style={styles.metaLine}>Evidence: {detour.evidenceCount || 0} vehicles</Text>
      {detour.segmentLabel ? <Text style={styles.metaLine}>Segment: {detour.segmentLabel}</Text> : null}
      {detour.officialAlert?.matched ? (
        <Text style={styles.metaLine}>
          Alert match: {detour.officialAlert.effect || 'official detour alert'}
        </Text>
      ) : null}
      <Text style={styles.timeLine}>
        First seen: {formatRelativeMinutes(detour.firstDetectedAt)} | Last seen:{' '}
        {formatRelativeMinutes(detour.lastSeenAt)}
      </Text>
      {archived ? (
        <Text style={styles.timeLine}>Archived: {formatRelativeMinutes(detour.archivedAt)}</Text>
      ) : null}
    </View>
  );
};

const DetourDebugPanel = ({
  visible,
  onClose,
  activeDetours = [],
  detourHistory = [],
}) => {
  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.panel}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Detour Debug</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.summaryLine}>
          Active: {activeDetours.length} | Archived: {detourHistory.length}
        </Text>

        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionTitle}>Active Detours</Text>
          {activeDetours.length === 0 ? (
            <Text style={styles.emptyText}>No active detours.</Text>
          ) : (
            activeDetours.map((detour) => (
              <DetourCard key={`active-${detour.id}`} detour={detour} />
            ))
          )}

          <Text style={styles.sectionTitle}>Archived Detours</Text>
          {detourHistory.length === 0 ? (
            <Text style={styles.emptyText}>No archived detours.</Text>
          ) : (
            detourHistory.map((detour, index) => (
              <DetourCard key={`history-${detour.id}-${index}`} detour={detour} archived />
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9, 30, 66, 0.28)',
    zIndex: 2200,
  },
  panel: {
    width: '92%',
    maxWidth: 560,
    maxHeight: '82%',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.large,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 14px 36px rgba(9, 30, 66, 0.24)',
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  closeButton: {
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.round,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  closeText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
  },
  summaryLine: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  scrollArea: {
    marginTop: SPACING.sm,
  },
  scrollContent: {
    paddingBottom: SPACING.md,
  },
  sectionTitle: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  card: {
    backgroundColor: COLORS.grey50,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  routeText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  statusPill: {
    paddingVertical: 2,
    paddingHorizontal: SPACING.xs,
    borderRadius: BORDER_RADIUS.round,
  },
  statusPillText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
    textTransform: 'uppercase',
  },
  metaLine: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  timeLine: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
});

export default DetourDebugPanel;
