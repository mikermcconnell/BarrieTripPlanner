const { applyItineraryAvailabilityPolicy } = require('../utils/itineraryAvailabilityPolicy');

const usable = {
  id: 'usable',
  labels: ['Recommended'],
  isRecommended: true,
  legs: [{ mode: 'BUS', startTime: 0, endTime: 1000 }],
};

const blocked = {
  id: 'blocked',
  labels: ['Recommended', 'Direct'],
  isRecommended: true,
  legs: [{ mode: 'BUS', startTime: 0, endTime: 1000 }],
  stopClosureNotices: {
    hasTripImpact: true,
    impactedStops: [{ roles: ['boarding'] }],
  },
};

describe('itinerary availability policy', () => {
  test('removes blocked options when a usable alternative exists', () => {
    const result = applyItineraryAvailabilityPolicy([blocked, usable]);
    expect(result.itineraries.map((item) => item.id)).toEqual(['usable']);
    expect(result.allBlocked).toBe(false);
    expect(result.removedBlockedCount).toBe(1);
  });

  test('keeps explanations but removes recommendations when every option is blocked', () => {
    const result = applyItineraryAvailabilityPolicy([blocked]);
    expect(result.allBlocked).toBe(true);
    expect(result.itineraries[0].labels).toEqual(['Direct']);
    expect(result.itineraries[0].isRecommended).toBe(false);
    expect(result.itineraries[0].navigationBlock.code).toBe('STOP_CLOSED');
  });
});
