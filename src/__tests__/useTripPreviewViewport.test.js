global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');
const { useTripPreviewViewport } = require('../hooks/useTripPreviewViewport');

describe('useTripPreviewViewport', () => {
  let consoleErrorSpy = null;
  let renderer = null;

  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      const [firstArg] = args;
      if (typeof firstArg === 'string' && firstArg.includes('react-test-renderer is deprecated')) {
        return;
      }
      jest.requireActual('console').error(...args);
    });
  });

  afterAll(() => {
    consoleErrorSpy?.mockRestore();
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer.unmount();
      });
      renderer = null;
    }
  });

  test('fits itinerary coordinates with configured padding and animation', () => {
    const fitToCoordinates = jest.fn();
    let hookApi = null;

    function Harness() {
      hookApi = useTripPreviewViewport({
        isFocused: true,
        isTripPlanningMode: true,
        fitToCoordinates,
        edgePadding: { top: 200, right: 50, bottom: 350, left: 50 },
        animated: true,
      });

      return null;
    }

    act(() => {
      renderer = create(React.createElement(Harness));
    });

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

    expect(hookApi.fitMapToItinerary(itinerary)).toBe(true);
    expect(fitToCoordinates).toHaveBeenCalledWith(
      expect.arrayContaining([
        { latitude: 44.38, longitude: -79.69 },
        { latitude: 44.4, longitude: -79.67 },
        { latitude: 44.39, longitude: -79.68 },
      ]),
      {
        edgePadding: { top: 200, right: 50, bottom: 350, left: 50 },
        animated: true,
      }
    );
  });

  test('returns false when itinerary has no mappable coordinates', () => {
    const fitToCoordinates = jest.fn();
    let hookApi = null;

    function Harness() {
      hookApi = useTripPreviewViewport({
        isFocused: true,
        isTripPlanningMode: true,
        fitToCoordinates,
        edgePadding: { top: 0, right: 0, bottom: 0, left: 0 },
      });

      return null;
    }

    act(() => {
      renderer = create(React.createElement(Harness));
    });

    expect(hookApi.fitMapToItinerary({ legs: [{}] })).toBe(false);
    expect(fitToCoordinates).not.toHaveBeenCalled();
  });
});
