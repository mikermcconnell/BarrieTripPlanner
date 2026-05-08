import {
  getEffectiveTransferCount,
  isSameBusContinuation,
} from '../utils/routeContinuity';

const BASE_TIME = new Date('2026-05-08T10:00:00Z').getTime();

const makeRoute8Leg = ({
  route = '8A',
  directionId,
  blockId = 'block-8',
  fromStopId,
  fromName,
  toStopId,
  toName,
  startMinutes,
  endMinutes,
}) => ({
  mode: 'BUS',
  route: { shortName: route },
  directionId,
  blockId,
  startTime: BASE_TIME + startMinutes * 60 * 1000,
  endTime: BASE_TIME + endMinutes * 60 * 1000,
  from: { stopId: fromStopId, name: fromName },
  to: { stopId: toStopId, name: toName },
});

describe('Route 8 same-bus continuation rules', () => {
  test('does not treat an 8A southbound to northbound change at Allandale as staying on the same bus', () => {
    const legs = [
      makeRoute8Leg({
        directionId: 1,
        fromStopId: 'georgian',
        fromName: 'Georgian College',
        toStopId: '9003',
        toName: 'Barrie Allandale Transit Terminal Platform 3',
        startMinutes: 0,
        endMinutes: 20,
      }),
      { mode: 'WALK', duration: 30, distance: 20 },
      makeRoute8Leg({
        directionId: 0,
        fromStopId: '9005',
        fromName: 'Barrie Allandale Transit Terminal Platform 5',
        toStopId: 'georgian',
        toName: 'Georgian College',
        startMinutes: 21,
        endMinutes: 45,
      }),
    ];

    expect(isSameBusContinuation(
      { leg: legs[0], index: 0 },
      { leg: legs[2], index: 2 },
      legs
    )).toBe(false);
    expect(getEffectiveTransferCount({ transfers: 1, legs })).toBe(1);
  });

  test('allows an 8B southbound to northbound same-block continuation at Barrie South GO', () => {
    const legs = [
      makeRoute8Leg({
        route: '8B',
        directionId: 1,
        fromStopId: 'georgian',
        fromName: 'Georgian College',
        toStopId: '725',
        toName: 'Barrie South GO Station',
        startMinutes: 0,
        endMinutes: 20,
      }),
      makeRoute8Leg({
        route: '8B',
        directionId: 0,
        fromStopId: '725',
        fromName: 'Barrie South GO Station',
        toStopId: 'georgian',
        toName: 'Georgian College',
        startMinutes: 28,
        endMinutes: 45,
      }),
    ];

    expect(isSameBusContinuation(
      { leg: legs[0], index: 0 },
      { leg: legs[1], index: 1 },
      legs
    )).toBe(true);
    expect(getEffectiveTransferCount({ transfers: 1, legs })).toBe(0);
  });

  test('does not allow a Route 8 direction flip without matching block data', () => {
    const legs = [
      makeRoute8Leg({
        directionId: 1,
        blockId: null,
        fromStopId: 'georgian',
        fromName: 'Georgian College',
        toStopId: '725',
        toName: 'Barrie South GO Station',
        startMinutes: 0,
        endMinutes: 20,
      }),
      makeRoute8Leg({
        directionId: 0,
        blockId: null,
        fromStopId: '725',
        fromName: 'Barrie South GO Station',
        toStopId: 'georgian',
        toName: 'Georgian College',
        startMinutes: 21,
        endMinutes: 45,
      }),
    ];

    expect(isSameBusContinuation(
      { leg: legs[0], index: 0 },
      { leg: legs[1], index: 1 },
      legs
    )).toBe(false);
  });
});
