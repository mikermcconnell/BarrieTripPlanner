const { validateTripInputs } = require('../utils/tripValidation');
const { getErrorConfig } = require('../config/errorMessages');

describe('trip validation messaging', () => {
  test('explains that trip planning must stay within Barrie or supported on-demand zones', () => {
    const result = validateTripInputs({
      from: { lat: 44.6, lon: -79.69 },
      to: { lat: 44.39, lon: -79.68 },
      onDemandZones: {},
    });

    expect(result).toEqual({
      valid: false,
      errorCode: 'OUTSIDE_SERVICE_AREA',
      errorMessage: 'Your starting location is outside Barrie Transit service area. Trip planning works for trips within Barrie and supported on-demand zones.',
    });
  });

  test('outside-service-area error card uses the same clearer guidance', () => {
    expect(getErrorConfig('OUTSIDE_SERVICE_AREA')).toEqual(expect.objectContaining({
      title: 'Outside Service Area',
      message: 'Trip planning works for trips within Barrie and supported on-demand zones.',
      suggestions: expect.arrayContaining([
        'Choose a start and destination within Barrie or a supported on-demand zone',
      ]),
    }));
  });

  test('no-nearby-stops error card does not say the rider is outside Barrie', () => {
    expect(getErrorConfig('NO_NEARBY_STOPS')).toEqual(expect.objectContaining({
      title: 'No nearby bus stops',
      message: 'This location is in the service area, but it is far from the nearest bus stop.',
      suggestions: expect.arrayContaining([
        'Try using a nearby stop or major intersection',
      ]),
    }));
  });
});
