jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const { recalculateItineraryAfterWalkingEnrichment } = require('../services/walkingService');

describe('walking enrichment timing', () => {
  test('anchors an updated access walk to the fixed bus departure and recalculates totals', () => {
    const busStart = new Date('2026-07-14T10:00:00-04:00').getTime();
    const itinerary = {
      startTime: busStart - 5 * 60 * 1000,
      endTime: busStart + 20 * 60 * 1000,
      duration: 25 * 60,
      legs: [],
    };
    const legs = [
      {
        mode: 'WALK',
        startTime: busStart - 5 * 60 * 1000,
        endTime: busStart,
        duration: 10 * 60,
        distance: 700,
      },
      {
        mode: 'BUS',
        startTime: busStart,
        endTime: busStart + 20 * 60 * 1000,
        duration: 20 * 60,
      },
    ];

    const result = recalculateItineraryAfterWalkingEnrichment(itinerary, legs);

    expect(result.legs[0].startTime).toBe(busStart - 10 * 60 * 1000);
    expect(result.legs[0].endTime).toBe(busStart);
    expect(result.startTime).toBe(busStart - 10 * 60 * 1000);
    expect(result.duration).toBe(30 * 60);
    expect(result.walkTime).toBe(10 * 60);
    expect(result.walkDistance).toBe(700);
  });

  test('keeps consecutive walking legs sequential when aligning them to a bus', () => {
    const busStart = new Date('2026-07-14T10:00:00-04:00').getTime();
    const result = recalculateItineraryAfterWalkingEnrichment({ legs: [] }, [
      { mode: 'WALK', duration: 3 * 60, distance: 200 },
      { mode: 'WALK', duration: 2 * 60, distance: 120 },
      { mode: 'BUS', startTime: busStart, endTime: busStart + 10 * 60 * 1000, duration: 10 * 60 },
    ]);

    expect(result.legs[0].startTime).toBe(busStart - 5 * 60 * 1000);
    expect(result.legs[0].endTime).toBe(busStart - 2 * 60 * 1000);
    expect(result.legs[1].startTime).toBe(result.legs[0].endTime);
    expect(result.legs[1].endTime).toBe(busStart);
    expect(result.walkTime).toBe(5 * 60);
  });
});
