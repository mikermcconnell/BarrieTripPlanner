import { getTripPreviewAutoFitKey, shouldAutoFitTripPreview } from '../utils/tripPreviewAutoFit';

const itinerary = {
  startTime: 1000,
  endTime: 2000,
  legs: [
    { mode: 'WALK' },
    { mode: 'BUS', tripId: 'trip-a', route: { id: '8A' } },
  ],
};

describe('trip preview auto-fit helpers', () => {
  test('creates a stable key for a selected itinerary', () => {
    expect(getTripPreviewAutoFitKey({ itinerary, selectedItineraryIndex: 0 })).toBe('0:1000:2000:WALK|trip-a');
  });

  test('allows the initial trip preview fit once', () => {
    expect(shouldAutoFitTripPreview({
      isTripPreviewMode: true,
      selectedItinerary: itinerary,
      selectedItineraryIndex: 0,
      lastFitKey: null,
      userHasMovedMap: false,
    })).toEqual({ shouldFit: true, fitKey: '0:1000:2000:WALK|trip-a' });
  });

  test('does not keep refitting the same preview after the user moves the map', () => {
    expect(shouldAutoFitTripPreview({
      isTripPreviewMode: true,
      selectedItinerary: itinerary,
      selectedItineraryIndex: 0,
      lastFitKey: '0:1000:2000:WALK|trip-a',
      userHasMovedMap: true,
    })).toEqual({ shouldFit: false, fitKey: '0:1000:2000:WALK|trip-a' });
  });
});
