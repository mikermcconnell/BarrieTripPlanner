import { useCallback, useEffect, useRef, useState } from 'react';
import { enrichItineraryWithWalking } from '../../services/walkingService';
import logger from '../../utils/logger';

const trackNavigationStarted = (itinerary) => {
  try {
    const { trackEvent } = require('../../services/analyticsService');
    trackEvent('navigation_started', {
      leg_count: itinerary.legs?.length || 0,
    });
  } catch {}
};

export const useNavigationItineraryController = ({
  initialItinerary,
  navigation,
  trackStart = false,
}) => {
  const [itinerary, setItinerary] = useState(initialItinerary);
  const itineraryRevisionRef = useRef(0);

  const replaceItinerary = useCallback((nextItinerary) => {
    itineraryRevisionRef.current += 1;
    setItinerary(nextItinerary);
  }, []);

  useEffect(() => {
    if (trackStart && initialItinerary) {
      trackNavigationStarted(initialItinerary);
    }
  }, [initialItinerary, trackStart]);

  useEffect(() => {
    if (!initialItinerary) {
      navigation.goBack();
      return undefined;
    }

    let cancelled = false;
    const enrichmentRevision = itineraryRevisionRef.current;
    enrichItineraryWithWalking(initialItinerary)
      .then((enriched) => {
        if (!cancelled && itineraryRevisionRef.current === enrichmentRevision) {
          logger.log('Walking directions enriched for navigation');
          setItinerary(enriched);
        }
      })
      .catch(() => {}); // Keep using estimate-based itinerary
    return () => { cancelled = true; };
  }, [initialItinerary, navigation]);

  return {
    itinerary,
    setItinerary: replaceItinerary,
  };
};

export default useNavigationItineraryController;
