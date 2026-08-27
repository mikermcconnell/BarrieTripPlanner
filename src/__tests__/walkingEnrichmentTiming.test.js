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

jest.mock('../services/proxyAuth', () => ({
  getApiProxyRequestOptions: jest.fn(),
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { getApiProxyRequestOptions } = require('../services/proxyAuth');
const {
  enrichTripPlanWithWalking,
  getWalkingDirections,
  recalculateItineraryAfterWalkingEnrichment,
} = require('../services/walkingService');

describe('walking directions timeout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.getItem.mockResolvedValue(null);
  });

  test('falls back to an estimate when proxy authentication stalls', async () => {
    getApiProxyRequestOptions.mockImplementation(() => new Promise(() => {}));

    const result = await getWalkingDirections(
      44.38,
      -79.69,
      44.39,
      -79.68,
      { timeoutMs: 25 }
    );

    expect(result).toEqual(expect.objectContaining({
      geometry: null,
      source: 'estimate',
    }));
  });
});

describe('walking enrichment timing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

describe('walking enrichment recommendations', () => {
  const now = new Date('2026-08-11T12:00:00-04:00').getTime();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('keeps an ineligible walking-only option behind transit and does not recommend it', async () => {
    const startTime = now + 60 * 1000;
    const result = await enrichTripPlanWithWalking({
      itineraries: [
        {
          id: 'walking-only',
          isWalkingOnly: true,
          recommendationEligible: false,
          startTime,
          endTime: startTime + 7.5 * 60 * 1000,
          duration: 7.5 * 60,
          walkDistance: 600,
          transfers: 0,
          legs: [],
        },
        {
          id: 'transit',
          startTime,
          endTime: startTime + 9 * 60 * 1000,
          duration: 9 * 60,
          walkDistance: 100,
          transfers: 0,
          legs: [],
        },
      ],
    });

    expect(result.itineraries.map((itinerary) => itinerary.id)).toEqual([
      'transit',
      'walking-only',
    ]);
    expect(result.itineraries[0]).toEqual(expect.objectContaining({
      id: 'transit',
      isRecommended: true,
    }));
    expect(result.itineraries[1].isRecommended).toBe(false);
    expect(result.itineraries[1].labels || []).not.toContain('Recommended');
  });

  test('can recommend an eligible walking-only option even when its walk is high', async () => {
    const startTime = now + 60 * 1000;
    AsyncStorage.getItem.mockResolvedValue(JSON.stringify({
      timestamp: now,
      data: {
        distance: 1100,
        duration: 800,
        geometry: null,
        steps: [],
        source: 'cache',
      },
    }));

    const result = await enrichTripPlanWithWalking({
      itineraries: [
        {
          id: 'walking-only',
          isWalkingOnly: true,
          recommendationEligible: true,
          startTime,
          endTime: startTime + 800 * 1000,
          duration: 800,
          walkDistance: 1100,
          transfers: 0,
          legs: [
            {
              mode: 'WALK',
              from: { lat: 44.38, lon: -79.69 },
              to: { lat: 44.39, lon: -79.68 },
              startTime,
              endTime: startTime + 800 * 1000,
              duration: 800,
              distance: 1100,
            },
          ],
        },
        {
          id: 'transit',
          startTime,
          endTime: startTime + 20 * 60 * 1000,
          duration: 20 * 60,
          walkDistance: 100,
          transfers: 0,
          legs: [],
        },
      ],
    });

    expect(result.itineraries[0]).toEqual(expect.objectContaining({
      id: 'walking-only',
      hasHighWalk: true,
      isRecommended: true,
    }));
    expect(result.itineraries[0].labels).toContain('Recommended');
  });
});
