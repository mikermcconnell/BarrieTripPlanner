import {
  rankItinerariesForRider,
  scoreItineraryForRider,
  sortRecommendedItineraryFirst,
} from '../utils/tripItineraryRanking';

const BASE_TIME = new Date('2026-03-06T10:00:00Z').getTime();

const makeItinerary = ({
  id,
  durationMinutes,
  arrivalMinutes,
  transfers = 0,
  walkDistance = 0,
  legs = [],
}) => ({
  id,
  duration: durationMinutes * 60,
  startTime: BASE_TIME,
  endTime: BASE_TIME + arrivalMinutes * 60 * 1000,
  transfers,
  walkDistance,
  legs,
});

describe('tripItineraryRanking', () => {
  test('adds a transfer time penalty without changing actual trip duration', () => {
    const itinerary = makeItinerary({
      id: 'one-transfer',
      durationMinutes: 25,
      arrivalMinutes: 25,
      transfers: 1,
    });

    const scored = scoreItineraryForRider(itinerary, {
      transferPenaltySeconds: 7 * 60,
    });

    expect(scored.duration).toBe(25 * 60);
    expect(scored.riderCostSeconds).toBe(32 * 60);
    expect(scored.transferPenaltySeconds).toBe(7 * 60);
  });

  test('does not penalize a same-bus A/B branch flip as a transfer', () => {
    const itinerary = makeItinerary({
      id: 'same-bus-branch-flip',
      durationMinutes: 25,
      arrivalMinutes: 25,
      transfers: 1,
      legs: [
        {
          mode: 'BUS',
          startTime: BASE_TIME,
          endTime: BASE_TIME + 10 * 60 * 1000,
          route: { shortName: '7A' },
          headsign: 'North',
        },
        {
          mode: 'BUS',
          startTime: BASE_TIME + 10 * 60 * 1000,
          endTime: BASE_TIME + 20 * 60 * 1000,
          route: { shortName: '7B' },
          headsign: 'South',
        },
      ],
    });

    const scored = scoreItineraryForRider(itinerary, {
      transferPenaltySeconds: 7 * 60,
    });

    expect(scored.transfers).toBe(0);
    expect(scored.transferPenaltySeconds).toBe(0);
    expect(scored.riskyTransferPenaltySeconds).toBe(0);
  });

  test('ranks a direct trip ahead of a transfer trip unless the transfer saves enough time', () => {
    const directTrip = makeItinerary({
      id: 'direct',
      durationMinutes: 30,
      arrivalMinutes: 30,
      transfers: 0,
    });
    const transferTrip = makeItinerary({
      id: 'transfer',
      durationMinutes: 25,
      arrivalMinutes: 25,
      transfers: 1,
    });

    const ranked = rankItinerariesForRider([transferTrip, directTrip], {
      transferPenaltySeconds: 7 * 60,
    });

    expect(ranked.map((itinerary) => itinerary.id)).toEqual(['direct', 'transfer']);
  });

  test('keeps a transfer trip first when it saves more time than the transfer penalty', () => {
    const directTrip = makeItinerary({
      id: 'direct',
      durationMinutes: 35,
      arrivalMinutes: 35,
      transfers: 0,
    });
    const muchFasterTransferTrip = makeItinerary({
      id: 'faster-transfer',
      durationMinutes: 20,
      arrivalMinutes: 20,
      transfers: 1,
    });

    const ranked = rankItinerariesForRider([directTrip, muchFasterTransferTrip], {
      transferPenaltySeconds: 7 * 60,
    });

    expect(ranked.map((itinerary) => itinerary.id)).toEqual(['faster-transfer', 'direct']);
  });

  test('moves the recommended trip to the top while keeping the remaining best-trip order', () => {
    const ranked = [
      makeItinerary({ id: 'next-best', durationMinutes: 20, arrivalMinutes: 20 }),
      makeItinerary({ id: 'recommended', durationMinutes: 24, arrivalMinutes: 24 }),
      makeItinerary({ id: 'third-best', durationMinutes: 30, arrivalMinutes: 30 }),
    ];
    ranked[1].isRecommended = true;
    ranked[1].labels = ['Recommended'];

    expect(sortRecommendedItineraryFirst(ranked).map((itinerary) => itinerary.id)).toEqual([
      'recommended',
      'next-best',
      'third-best',
    ]);
  });
});
