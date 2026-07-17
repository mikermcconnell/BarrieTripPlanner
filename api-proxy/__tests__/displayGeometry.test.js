'use strict';

const {
  clearDisplayGeometry,
  copyRefinedDisplayGeometry,
  deleteDisplayGeometry,
} = require('../detour/displayGeometry');

describe('display geometry contract', () => {
  test('clears stale refined geometry to consistent public defaults', () => {
    const target = {
      keep: true,
      displayBoundaryRefined: true,
      displayEntryPoint: { latitude: 1, longitude: 2 },
      displaySkippedStops: [{ stopId: '1' }],
    };

    clearDisplayGeometry(target);

    expect(target).toMatchObject({
      keep: true,
      displayBoundaryRefined: false,
      displayBoundaryReason: null,
      displayEntryPoint: null,
      displaySkippedStops: [],
      displaySkippedStopIds: [],
      displaySkippedStopCodes: [],
    });
  });

  test('copies only refined display geometry and normalizes optional arrays', () => {
    const target = {};
    copyRefinedDisplayGeometry(target, {
      displayBoundaryRefined: true,
      displayBoundaryReason: 'trimmed-normal-route-approaches',
      displayEntryPoint: { latitude: 1, longitude: 2 },
      displaySkippedStops: null,
      displaySkippedStopIds: ['10'],
      displaySeparatedRunMeters: 125,
    });

    expect(target).toMatchObject({
      displayBoundaryRefined: true,
      displayBoundaryReason: 'trimmed-normal-route-approaches',
      displayEntryPoint: { latitude: 1, longitude: 2 },
      displaySkippedStops: [],
      displaySkippedStopIds: ['10'],
      displaySkippedStopCodes: [],
      displaySeparatedRunMeters: 125,
    });
  });

  test('deletes all display geometry fields without touching lifecycle geometry', () => {
    const target = {
      skippedSegmentPolyline: ['lifecycle'],
      displayBoundaryRefined: true,
      displayEntryPoint: { latitude: 1, longitude: 2 },
      displaySkippedStopIds: ['10'],
    };

    deleteDisplayGeometry(target);

    expect(target).toEqual({ skippedSegmentPolyline: ['lifecycle'] });
  });
});
