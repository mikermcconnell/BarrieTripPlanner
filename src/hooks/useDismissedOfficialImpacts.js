import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  dismissOfficialImpact,
  filterDismissedOfficialImpacts,
  loadDismissedOfficialImpactIds,
} from '../utils/officialImpactDismissals';
import logger from '../utils/logger';

export const useDismissedOfficialImpacts = (impacts = []) => {
  const [dismissedIds, setDismissedIds] = useState([]);

  useEffect(() => {
    let cancelled = false;

    loadDismissedOfficialImpactIds()
      .then((ids) => {
        if (!cancelled) setDismissedIds(ids);
      })
      .catch((error) => logger.warn('Could not load dismissed planned detour notices', error));

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleImpacts = useMemo(
    () => filterDismissedOfficialImpacts(impacts, dismissedIds),
    [dismissedIds, impacts]
  );

  const dismissImpact = useCallback(async (impactId) => {
    setDismissedIds((ids) => [...new Set([...ids, impactId].filter(Boolean))]);
    try {
      const ids = await dismissOfficialImpact(impactId);
      setDismissedIds(ids);
    } catch (error) {
      logger.warn('Could not save dismissed planned detour notice', error);
    }
  }, []);

  return {
    visibleImpacts,
    dismissImpact,
    dismissedIds,
  };
};

export default useDismissedOfficialImpacts;
