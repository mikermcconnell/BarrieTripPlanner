jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Platform: { select: (obj) => obj.ios || obj.android || {} },
  StyleSheet: {
    create: (styles) => styles,
  },
}));

jest.mock('@maplibre/maplibre-react-native', () => ({
  MarkerView: 'MarkerView',
  PointAnnotation: 'PointAnnotation',
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Path: 'Path',
}), { virtual: true });

const { areBusMarkerPropsEqual } = require('../components/BusMarker');

const buildProps = (overrides = {}) => ({
  vehicle: {
    id: 'veh-1',
    routeId: '2A',
    bearing: 90,
    coordinate: {
      latitude: 44.39,
      longitude: -79.69,
    },
    ...overrides.vehicle,
  },
  color: '#E53935',
  ...overrides,
});

describe('BusMarker memo comparator', () => {
  test('returns true when relevant props are unchanged', () => {
    const prev = buildProps();
    const next = buildProps();

    expect(areBusMarkerPropsEqual(prev, next)).toBe(true);
  });

  test('returns false when latitude changes', () => {
    const prev = buildProps();
    const next = buildProps({
      vehicle: {
        coordinate: { latitude: 44.4, longitude: -79.69 },
      },
    });

    expect(areBusMarkerPropsEqual(prev, next)).toBe(false);
  });

  test('returns false when longitude changes', () => {
    const prev = buildProps();
    const next = buildProps({
      vehicle: {
        coordinate: { latitude: 44.39, longitude: -79.68 },
      },
    });

    expect(areBusMarkerPropsEqual(prev, next)).toBe(false);
  });

  test('returns false when snap path reference changes', () => {
    const prev = buildProps({ snapPath: [{ latitude: 44.38, longitude: -79.69 }, { latitude: 44.39, longitude: -79.69 }] });
    const next = buildProps({ snapPath: [{ latitude: 44.38, longitude: -79.69 }, { latitude: 44.39, longitude: -79.69 }] });

    expect(areBusMarkerPropsEqual(prev, next)).toBe(false);
  });
});
