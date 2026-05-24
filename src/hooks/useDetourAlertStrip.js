/**
 * useDetourAlertStrip Hook
 *
 * Shared state and logic for the DetourAlertStrip component.
 * Both native (.js) and web (.web.js) import this hook and only
 * differ in platform-specific rendering / styles.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { LayoutAnimation, Platform } from 'react-native';
import { filterRiderVisibleDetours } from '../utils/detourVisibility';
import { buildActiveDetourEvents } from '../utils/detourEvents';
import { getRouteFamilyId } from '../utils/routeDetourMatching';

export const BASE_TOP = 140;
export const ALERT_OFFSET = 64;
const MAX_EXPANDED = 5;

const normalizeConfidence = (confidence) => (
  confidence == null ? '' : String(confidence).trim().toLowerCase()
);

const getDetourConfidence = (detour) => normalizeConfidence(detour?.confidence);

const getStatusLabel = (item) => {
  if (item?.state === 'clear-pending') return 'Clearing...';
  return getDetourConfidence(item) === 'high' ? 'Active detour' : 'Likely detour';
};

const getBannerPrefix = (events) => (events.length === 1 ? 'Active detour' : 'Active detours');

const formatRouteSummary = (groups) => {
  const routeNames = groups.map((group) => group.displayName).filter(Boolean);
  if (routeNames.length === 0) return '';
  const prefix = routeNames.length === 1 ? 'Route' : 'Routes';
  return `${prefix} ${routeNames.join(', ')}`;
};

export const useDetourAlertStrip = ({ activeDetours, alertBannerVisible, routes = [] }) => {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpanded((prev) => !prev);
  }, []);

  const collapseTimerRef = useRef(null);

  // Auto-collapse after 10s. Resets when activeDetours changes so a new
  // detour appearing keeps the strip visible for another full 10s.
  useEffect(() => {
    if (expanded) {
      collapseTimerRef.current = setTimeout(() => {
        if (Platform.OS !== 'web') {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        }
        setExpanded(false);
      }, 10000);
    }
    return () => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
      }
    };
  }, [expanded, activeDetours]);

  const routeIds = useMemo(() => {
    if (!activeDetours || typeof activeDetours !== 'object') return [];
    return Object.keys(filterRiderVisibleDetours(activeDetours));
  }, [activeDetours]);

  const visibleDetours = useMemo(
    () => filterRiderVisibleDetours(activeDetours),
    [activeDetours]
  );
  const detourEvents = useMemo(
    () => buildActiveDetourEvents(activeDetours),
    [activeDetours]
  );

  const topOffset = alertBannerVisible ? BASE_TOP + ALERT_OFFSET : BASE_TOP;

  const getRouteName = useMemo(() => {
    const map = {};
    routes.forEach((r) => {
      map[r.id] = r.shortName || r.id;
    });
    return (routeId) => map[routeId] || routeId;
  }, [routes]);

  const routeGroups = useMemo(() => {
    const groupsByFamily = new Map();

    routeIds.forEach((routeId) => {
      const familyId = getRouteFamilyId(routeId);
      if (!groupsByFamily.has(familyId)) {
        groupsByFamily.set(familyId, []);
      }
      groupsByFamily.get(familyId).push(routeId);
    });

    return Array.from(groupsByFamily.entries()).map(([familyId, ids]) => {
      const hasHigh = ids.some((routeId) => getDetourConfidence(visibleDetours[routeId]) === 'high');
      return {
        familyId,
        routeIds: ids,
        firstRouteId: ids[0],
        displayName: ids.length > 1 ? familyId : getRouteName(ids[0]),
        confidence: hasHigh ? 'high' : 'medium',
      };
    });
  }, [getRouteName, routeIds, visibleDetours]);

  const visibleIds = routeIds.slice(0, MAX_EXPANDED);
  const visibleEvents = detourEvents.slice(0, MAX_EXPANDED);
  const overflowCount = detourEvents.length - MAX_EXPANDED;
  const collapsedSummaryGroups = routeGroups.slice(0, 4);
  const collapsedOverflowCount = routeGroups.length - collapsedSummaryGroups.length;
  const routeSummary = formatRouteSummary(collapsedSummaryGroups);
  const bannerPrefix = getBannerPrefix(detourEvents);

  const countText =
    detourEvents.length === 1
      ? `${bannerPrefix}: ${detourEvents[0].title}`
      : `${bannerPrefix}: ${detourEvents.length} locations`;

  const getDetourStatusLabel = useCallback(
    (routeId) => getStatusLabel(visibleDetours[routeId]),
    [visibleDetours]
  );
  const getEventStatusLabel = useCallback(
    (event) => getStatusLabel(event),
    []
  );

  return {
    expanded,
    toggleExpanded,
    routeIds,
    detourEvents,
    routeGroups,
    topOffset,
    getRouteName,
    getDetourStatusLabel,
    getEventStatusLabel,
    visibleIds,
    visibleEvents,
    overflowCount,
    countText,
    shouldRender: detourEvents.length > 0,
  };
};
