const {
  collectItineraryEndpointCoordinates,
  collectItineraryViewportCoordinates,
  computeCoordinateBounds,
  computeLegBounds,
} = require('../utils/itineraryViewport');

describe('itineraryViewport', () => {
  test('collects endpoint, geometry, and intermediate stop coordinates for trip preview fitting', () => {
    const itinerary = {
      legs: [
        {
          from: { lat: 44.38, lon: -79.69 },
          to: { lat: 44.4, lon: -79.67 },
          legGeometry: {
            points: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
          },
          intermediateStops: [
            { lat: 44.39, lon: -79.68 },
          ],
        },
      ],
    };

    const coordinates = collectItineraryViewportCoordinates(itinerary);

    expect(coordinates).toEqual(
      expect.arrayContaining([
        { latitude: 44.38, longitude: -79.69 },
        { latitude: 44.4, longitude: -79.67 },
        { latitude: 44.39, longitude: -79.68 },
        { latitude: 38.5, longitude: -120.2 },
      ])
    );
    expect(coordinates).toHaveLength(6);
  });

  test('computes consistent bounds for endpoint-only trip and leg fitting', () => {
    const itinerary = {
      legs: [
        {
          from: { lat: 44.38, lon: -79.69 },
          to: { lat: 44.4, lon: -79.67 },
        },
      ],
    };

    const endpointCoordinates = collectItineraryEndpointCoordinates(itinerary);
    const tripBounds = computeCoordinateBounds(endpointCoordinates);
    const legBounds = computeLegBounds(itinerary.legs[0]);

    expect(endpointCoordinates).toEqual([
      { latitude: 44.38, longitude: -79.69 },
      { latitude: 44.4, longitude: -79.67 },
    ]);
    expect(tripBounds).toEqual({
      minLat: 44.38,
      maxLat: 44.4,
      minLon: -79.69,
      maxLon: -79.67,
      ne: [-79.67, 44.4],
      sw: [-79.69, 44.38],
    });
    expect(legBounds).toEqual(tripBounds);
  });
});
