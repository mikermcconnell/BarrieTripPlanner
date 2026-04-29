import { useEffect, useState } from 'react';
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
    enrichItineraryWithWalking(initialItinerary)
      .then((enriched) => {
        if (!cancelled) {
          logger.log('Walking directions enriched for navigation');
          setItinerary(enriched);
        }
      })
      .catch(() => {}); // Keep using estimate-based itinerary
    return () => { cancelled = true; };
  }, [initialItinerary, navigation]);

  return {
    itinerary,
    setItinerary,
  };
};

export default useNavigationItineraryController;
