import { useEffect, useMemo, useRef, useState } from 'react';
import { reverseGeocode } from '../services/locationIQService';
import {
  buildDetourRoadSummary,
  extractRoadName,
  getDetourLookupPoints,
} from '../utils/detourRoadSummary';

export const useDetourRoadSummary = ({ detour, enabled = true }) => {
  const [state, setState] = useState({
    roadNames: [],
    loading: false,
  });
  const requestIdRef = useRef(0);

  const lookupPoints = useMemo(() => (
    enabled ? getDetourLookupPoints(detour) : []
  ), [detour, enabled]);

  useEffect(() => {
    if (!enabled || lookupPoints.length === 0) {
      setState({ roadNames: [], loading: false });
      return undefined;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((current) => ({ ...current, loading: true }));

    let cancelled = false;

    Promise.all(
      lookupPoints.map((point) => reverseGeocode(point.latitude, point.longitude))
    )
      .then((results) => {
        if (cancelled || requestIdRef.current !== requestId) return;

        const roadNames = buildDetourRoadSummary(results.map(extractRoadName));
        setState({
          roadNames,
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled || requestIdRef.current !== requestId) return;
        setState({
          roadNames: [],
          loading: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, lookupPoints]);

  return state;
};
