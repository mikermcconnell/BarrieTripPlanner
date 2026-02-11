jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: {
    create: (styles) => styles,
  },
}));

jest.mock('react-native-maps', () => ({
  Marker: {
    Animated: 'MarkerAnimated',
  },
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Path: 'Path',
}));

jest.mock('../hooks/useAnimatedMarker', () => ({
  useAnimatedMarker: (coordinate) => coordinate,
}));

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
});
