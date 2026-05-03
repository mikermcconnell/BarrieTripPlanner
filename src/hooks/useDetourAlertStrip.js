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
import { getRouteFamilyId } from '../utils/routeDetourMatching';

export const BASE_TOP = 140;
export const ALERT_OFFSET = 64;
const MAX_EXPANDED = 5;

const normalizeConfidence = (confidence) => (
  confidence == null ? '' : String(confidence).trim().toLowerCase()
);

const getDetourConfidence = (detour) => normalizeConfidence(detour?.confidence);

const getStatusLabel = (detour) => {
  if (detour?.state === 'clear-pending') return 'Clearing...';
  return getDetourConfidence(detour) === 'high' ? 'Confirmed detour' : 'Likely detour';
};

const getBannerPrefix = (groups) => {
  const count = groups.length;
  const hasHigh = groups.some((group) => group.confidence === 'high');
  const hasMedium = groups.some((group) => group.confidence === 'medium');
  const suffix = count === 1 ? 'detour' : 'detours';

  if (hasHigh && !hasMedium) return `Confirmed ${suffix}`;
  if (hasMedium && !hasHigh) return `Likely ${suffix}`;
  if (hasHigh) return `Confirmed ${suffix}`;
  return count === 1 ? 'Detour' : 'Detours';
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
  const overflowCount = routeIds.length - MAX_EXPANDED;
  const collapsedSummaryGroups = routeGroups.slice(0, 4);
  const collapsedOverflowCount = routeGroups.length - collapsedSummaryGroups.length;
  const routeSummary = collapsedSummaryGroups.map((group) => group.displayName).join(', ');
  const bannerPrefix = getBannerPrefix(routeGroups);

  const countText =
    routeGroups.length === 1
      ? `${bannerPrefix}: ${routeSummary}`
      : collapsedOverflowCount > 0
        ? `${bannerPrefix}: ${routeSummary} +${collapsedOverflowCount}`
        : `${bannerPrefix}: ${routeSummary}`;

  const getDetourStatusLabel = useCallback(
    (routeId) => getStatusLabel(visibleDetours[routeId]),
    [visibleDetours]
  );

  return {
    expanded,
    toggleExpanded,
    routeIds,
    routeGroups,
    topOffset,
    getRouteName,
    getDetourStatusLabel,
    visibleIds,
    overflowCount,
    countText,
    shouldRender: routeIds.length > 0,
  };
};
