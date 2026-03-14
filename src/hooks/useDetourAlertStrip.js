/**
 * useDetourAlertStrip Hook
 *
 * Shared state and logic for the DetourAlertStrip component.
 * Both native (.js) and web (.web.js) import this hook and only
 * differ in platform-specific rendering / styles.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { LayoutAnimation, Platform } from 'react-native';

export const BASE_TOP = 140;
export const ALERT_OFFSET = 64;
const MAX_EXPANDED = 5;

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
    return Object.keys(activeDetours).filter(
      (id) => activeDetours[id]?.state !== 'cleared'
    );
  }, [activeDetours]);

  const topOffset = alertBannerVisible ? BASE_TOP + ALERT_OFFSET : BASE_TOP;

  const getRouteName = useMemo(() => {
    const map = {};
    routes.forEach((r) => {
      map[r.id] = r.shortName || r.id;
    });
    return (routeId) => map[routeId] || routeId;
  }, [routes]);

  const visibleIds = routeIds.slice(0, MAX_EXPANDED);
  const overflowCount = routeIds.length - MAX_EXPANDED;
  const collapsedSummaryIds = routeIds.slice(0, 4);
  const collapsedOverflowCount = routeIds.length - collapsedSummaryIds.length;
  const routeSummary = collapsedSummaryIds.map((routeId) => getRouteName(routeId)).join(', ');

  const countText =
    routeIds.length === 1
      ? `Detour: ${routeSummary}`
      : collapsedOverflowCount > 0
        ? `Detours: ${routeSummary} +${collapsedOverflowCount}`
        : `Detours: ${routeSummary}`;

  return {
    expanded,
    toggleExpanded,
    routeIds,
    topOffset,
    getRouteName,
    visibleIds,
    overflowCount,
    countText,
    shouldRender: routeIds.length > 0,
  };
};
