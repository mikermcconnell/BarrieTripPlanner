import { getItineraryNavigationBlock } from './tripNavigationSafety';

const stripRecommended = (itinerary, navigationBlock) => ({
  ...itinerary,
  labels: Array.isArray(itinerary?.labels)
    ? itinerary.labels.filter((label) => label !== 'Recommended')
    : itinerary?.labels,
  isRecommended: false,
  recommendationEligible: false,
  navigationBlock,
});

export const applyItineraryAvailabilityPolicy = (itineraries = []) => {
  const evaluated = (Array.isArray(itineraries) ? itineraries : []).map((itinerary) => ({
    itinerary,
    navigationBlock: getItineraryNavigationBlock(itinerary),
  }));
  const usable = evaluated.filter(({ navigationBlock }) => navigationBlock === null);

  if (usable.length > 0) {
    return {
      itineraries: usable.map(({ itinerary }) => itinerary),
      allBlocked: false,
      removedBlockedCount: evaluated.length - usable.length,
    };
  }

  return {
    itineraries: evaluated.map(({ itinerary, navigationBlock }) => (
      stripRecommended(itinerary, navigationBlock)
    )),
    allBlocked: evaluated.length > 0,
    removedBlockedCount: 0,
  };
};

export default applyItineraryAvailabilityPolicy;
