import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';
import Icon from './Icon';
import DetourImpactSummary from './DetourImpactSummary';
import { formatDetourStartedAt, formatDetourTime, getConfidenceChip } from '../utils/detourHelpers';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';
import { findRouteDetourNotice, getNoticeEndText } from '../utils/noticeTimingUtils';

const getDetourTitle = (routeId, state) => {
  const statusLabel = state === 'clear-pending' ? 'Detour Clearing' : 'Detour Active';
  return `Route ${routeId} - ${statusLabel}`;
};

const MAP_INTERACTION_HINT = 'Tap or click a highlighted route line on the map to open that route’s detour details.';
const COMPACT_SNAP_POINT = '22.5%';
const EXPANDED_SNAP_POINT = '78%';

const DetourDetailsSheet = ({
  routeId,
  detour,
  detourEvent = null,
  routeColor: routeColorOverride,
  routeColorByRouteId = {},
  segmentStopDetails = [],
  transitNews = [],
  detourExplorerLevel = 'route',
  selectedEventRouteId = null,
  onClose,
  onViewOnMap,
  onSelectEventRoute,
  onShowEvent,
  onShowAllDetours,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);
  const bottomSheetRef = useRef(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const snapPoints = useMemo(() => [COMPACT_SNAP_POINT, EXPANDED_SNAP_POINT], []);

  const handleSheetChanges = useCallback(
    (index) => {
      if (index === -1) onClose?.();
      else setSheetExpanded(index >= 1);
    },
    [onClose]
  );

  const toggleSheetExpanded = useCallback(() => {
    const nextIndex = sheetExpanded ? 0 : 1;
    bottomSheetRef.current?.snapToIndex?.(nextIndex);
    setSheetExpanded(!sheetExpanded);
  }, [sheetExpanded]);

  const routeColor = routeColorOverride || ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT;
  const getRouteColor = (id) => routeColorByRouteId[id] || ROUTE_COLORS[id] || routeColor;
  const eventRouteIds = Array.isArray(detourEvent?.routeIds) ? detourEvent.routeIds : [];
  const canSelectEventRoute = typeof onSelectEventRoute === 'function';
  const currentEventRouteId = selectedEventRouteId || routeId;
  const impactRouteLabel = detourEvent?.routeIds?.length > 1
    ? `Routes ${detourEvent.routeIds.join('/')}`
    : null;
  const timeLabel = formatDetourTime(detour?.detectedAt);
  const startedAtLabel = formatDetourStartedAt(detour?.detectedAt);
  const confidenceChip = detour?.confidence ? getConfidenceChip(detour.confidence) : null;
  const myRideNotice = findRouteDetourNotice(routeId, transitNews, Date.now(), { detour });
  const timingTitle = myRideNotice ? 'MyRide timing' : 'Unplanned detour';
  const myRideEndText = myRideNotice
    ? getNoticeEndText({ endsAt: myRideNotice.window?.endsAt ?? myRideNotice.endsAt }, 'Detour end date is not listed.')
    : 'End time unknown.';
  const myRideUrl = myRideNotice?.url ?? myRideNotice?.sourceUrl ?? null;
  const openMyRideNotice = () => {
    if (myRideUrl) Linking.openURL(myRideUrl).catch(() => {});
  };
  const handleEventRoutePress = (eventRouteId) => {
    if (canSelectEventRoute) onSelectEventRoute(eventRouteId);
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: addSafeBottomPadding(SPACING.xxl, bottomInset) },
        ]}
      >
        <View style={styles.header}>
          <View style={[styles.routeBadge, { backgroundColor: routeColor }]}>
            <Text style={styles.routeBadgeText}>{routeId}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>{detourEvent?.title || getDetourTitle(routeId, detour?.state)}</Text>
            {eventRouteIds.length > 0 && (
              <View style={styles.eventRoutesRow}>
                {eventRouteIds.map((eventRouteId) => {
                  const isSelectedRoute = eventRouteId === currentEventRouteId;
                  const Chip = canSelectEventRoute ? TouchableOpacity : View;

                  return (
                    <Chip
                      key={eventRouteId}
                      style={[
                        styles.eventRouteChip,
                        { backgroundColor: getRouteColor(eventRouteId) },
                        isSelectedRoute && styles.eventRouteChipSelected,
                      ]}
                      {...(canSelectEventRoute
                        ? {
                          onPress: () => handleEventRoutePress(eventRouteId),
                          activeOpacity: 0.8,
                          accessibilityRole: 'button',
                          accessibilityLabel: `Show Route ${eventRouteId} detour only`,
                          accessibilityState: { selected: isSelectedRoute },
                        }
                        : {})}
                    >
                      <Text style={styles.eventRouteChipText}>{eventRouteId}</Text>
                    </Chip>
                  );
                })}
              </View>
            )}
            <View style={styles.headerMeta}>
              {timeLabel && <Text style={styles.timeLabel}>{timeLabel}</Text>}
              {confidenceChip && (
                <View style={[styles.confidenceChip, { backgroundColor: confidenceChip.bgColor }]}>
                  <Text style={[styles.confidenceText, { color: confidenceChip.color }]}>{confidenceChip.label}</Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close detour details"
          >
            <Icon name="X" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.expandButton}
          onPress={toggleSheetExpanded}
          accessibilityRole="button"
          accessibilityLabel={sheetExpanded ? 'Collapse detour details' : 'Expand detour details'}
        >
          <Text style={styles.expandButtonText}>{sheetExpanded ? 'Show less' : 'More details'}</Text>
          <Text style={styles.expandButtonIcon}>{sheetExpanded ? '⌄' : '⌃'}</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        {(onShowAllDetours || (detourEvent && onShowEvent)) && (
          <View style={styles.explorerControls}>
            <Text style={styles.explorerLabel}>
              {detourExplorerLevel === 'event'
                ? 'Showing all routes in this detour'
                : `Selected: Route ${currentEventRouteId}`}
            </Text>
            <View style={styles.explorerButtonRow}>
              {detourExplorerLevel === 'route' && onShowEvent && eventRouteIds.length > 1 && (
                <TouchableOpacity
                  style={styles.explorerButton}
                  onPress={onShowEvent}
                  accessibilityRole="button"
                  accessibilityLabel="Show all routes in this detour event"
                >
                  <Text style={styles.explorerButtonText}>Event view</Text>
                </TouchableOpacity>
              )}
              {onShowAllDetours && (
                <TouchableOpacity
                  style={styles.explorerButton}
                  onPress={onShowAllDetours}
                  accessibilityRole="button"
                  accessibilityLabel="Show all active detours"
                >
                  <Text style={styles.explorerButtonText}>View all</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={styles.mapHintCard}>
          <View style={styles.mapHintIcon}>
            <Icon name="Route" size={16} color={COLORS.primaryDark} />
          </View>
          <View style={styles.mapHintCopy}>
            <Text style={styles.mapHintTitle}>Map tip</Text>
            <Text style={styles.mapHintText}>{MAP_INTERACTION_HINT}</Text>
          </View>
        </View>

        <View style={styles.timingCard}>
          <Text style={styles.timingTitle}>{timingTitle}</Text>
          {startedAtLabel && <Text style={styles.timingText}>Started: {startedAtLabel}</Text>}
          <Text style={styles.timingText}>{myRideEndText}</Text>
          {myRideNotice?.title && <Text style={styles.timingSource} numberOfLines={2}>{myRideNotice.title}</Text>}
          {myRideUrl && (
            <TouchableOpacity
              style={styles.noticeLinkButton}
              onPress={openMyRideNotice}
              accessibilityRole="button"
              accessibilityLabel="Open MyRide detour notice"
            >
              <Text style={styles.noticeLinkText}>Open MyRide notice</Text>
            </TouchableOpacity>
          )}
        </View>

        <DetourImpactSummary routeId={routeId} routeLabel={impactRouteLabel} sections={segmentStopDetails} />

        <TouchableOpacity
          style={styles.viewButton}
          onPress={onViewOnMap}
          accessibilityRole="button"
          accessibilityLabel="View detour on map"
        >
          <Text style={styles.viewButtonText}>View on Map</Text>
        </TouchableOpacity>
      </BottomSheetScrollView>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
  },
  handleIndicator: {
    backgroundColor: COLORS.grey300,
    width: 40,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
    minWidth: 28,
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  routeBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  headerText: {
    flex: 1,
  },
  closeButton: {
    padding: SPACING.sm,
  },
  expandButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.grey50,
    borderWidth: 1,
    borderColor: COLORS.grey200,
  },
  expandButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
  },
  expandButtonIcon: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
    lineHeight: FONT_SIZES.sm,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  eventRoutesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  eventRouteChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  eventRouteChipSelected: {
    borderColor: COLORS.white,
    shadowColor: COLORS.black,
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  eventRouteChipText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 2,
  },
  explorerControls: {
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.grey50,
    borderWidth: 1,
    borderColor: COLORS.grey200,
  },
  explorerLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  explorerButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  explorerButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.grey300,
  },
  explorerButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
  },
  mapHintCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.infoSubtle,
    borderWidth: 1,
    borderColor: COLORS.primarySubtle,
  },
  mapHintIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primarySubtle,
  },
  mapHintCopy: {
    flex: 1,
  },
  mapHintTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primaryDark,
    marginBottom: 2,
  },
  mapHintText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    lineHeight: 18,
  },
  timeLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  confidenceChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.round,
  },
  confidenceText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.grey200,
    marginVertical: SPACING.lg,
  },
  timingCard: {
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.warningSubtle,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  timingTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.warning,
    marginBottom: SPACING.xxs,
  },
  timingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  timingSource: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  noticeLinkButton: {
    alignSelf: 'flex-start',
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.white,
  },
  noticeLinkText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
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
