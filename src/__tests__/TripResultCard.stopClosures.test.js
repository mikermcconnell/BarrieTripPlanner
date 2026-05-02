global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('../components/DelayBadge', () => 'DelayBadge');
jest.mock('../components/Icon', () => 'Icon');
jest.mock('../components/navigation/WalkingPaceIcon', () => 'WalkingPaceIcon');
jest.mock('../services/tripService', () => ({
  formatDuration: (seconds) => `${Math.round(seconds / 60)} min`,
  formatMinutes: (minutes) => `${minutes} min`,
  formatTimeFromTimestamp: () => '12:00 PM',
  formatDistance: (meters) => `${meters} m`,
}));
jest.mock('../utils/colorUtils', () => ({
  getContrastTextColor: () => '#FFFFFF',
}));

const TripResultCard = require('../components/TripResultCard').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const renderTexts = (element) => {
  let inst;
  act(() => {
    inst = create(element);
  });
  return inst.root.findAllByType('Text').flatMap((node) => collectText(node));
};

const renderTree = (element) => {
  let inst;
  act(() => {
    inst = create(element);
  });
  return inst.root;
};

describe('TripResultCard stop closure notices', () => {
  const baseItinerary = {
    id: 'trip-1',
    startTime: 0,
    endTime: 600000,
    duration: 600,
    walkDistance: 300,
    walkTime: 180,
    transfers: 0,
    legs: [
      { mode: 'WALK', duration: 180 },
      {
        mode: 'BUS',
        duration: 420,
        route: { shortName: '12B', color: '#0C8CE5' },
        from: { stopCode: '509', name: 'Mapleview at Lily' },
        to: { stopCode: '600', name: 'Downtown' },
      },
    ],
  };

  test('shows a clear warning when the trip uses a closed stop', () => {
    const texts = renderTexts(React.createElement(TripResultCard, {
      itinerary: {
        ...baseItinerary,
        stopClosureNotices: {
          hasTripImpact: true,
          impactedStops: [{ stopCode: '509', stopName: 'Mapleview at Lily', roles: ['boarding'] }],
          routeNotices: [],
        },
      },
      onPress: jest.fn(),
    }));

    expect(texts.join(' ')).toContain('Stop 509 may be closed for this trip');
  });

  test('shows a minor route notice when the route has a closure elsewhere', () => {
    const texts = renderTexts(React.createElement(TripResultCard, {
      itinerary: {
        ...baseItinerary,
        stopClosureNotices: {
          hasTripImpact: false,
          impactedStops: [],
          routeNotices: [{ stopCode: '966', affectedRoutes: ['12B'] }],
        },
      },
      onPress: jest.fn(),
    }));

    expect(texts.join(' ')).toContain('Route has 1 reported stop closure');
    expect(texts.join(' ')).toContain('Your boarding and exit stops are not impacted.');
    expect(texts.join(' ')).not.toContain('not flagged');
  });

  test('shows a detour warning when a planned stop may be affected', () => {
    const texts = renderTexts(React.createElement(TripResultCard, {
      itinerary: {
        ...baseItinerary,
        detourImpacts: [{
          severity: 'stop_affected',
          message: 'Route 12B is on detour and your boarding or exit stop may be affected.',
          affectedStopNames: ['Mapleview at Lily'],
        }],
      },
      onPress: jest.fn(),
    }));

    expect(texts.join(' ')).toContain('Detour may affect this trip');
    expect(texts.join(' ')).toContain('Affected: Mapleview at Lily');
  });

  test('shows wait time between transfer legs', () => {
    const texts = renderTexts(React.createElement(TripResultCard, {
      itinerary: {
        ...baseItinerary,
        transfers: 1,
        legs: [
          { mode: 'WALK', duration: 120, startTime: 0, endTime: 120000 },
          {
            mode: 'BUS',
            duration: 600,
            startTime: 120000,
            endTime: 720000,
            route: { shortName: '100', color: '#A50000' },
            from: { stopCode: '407', name: 'Johnson at Grove' },
            to: { stopCode: '1000', name: 'Downtown Terminal' },
          },
          { mode: 'WALK', duration: 60, startTime: 720000, endTime: 780000 },
          {
            mode: 'BUS',
            duration: 600,
            startTime: 1020000,
            endTime: 1620000,
            route: { shortName: '8A', color: '#32475C' },
            from: { stopCode: '1000', name: 'Downtown Terminal' },
            to: { stopCode: '2000', name: 'Park Place' },
          },
        ],
      },
      onPress: jest.fn(),
    }));

    expect(texts.join(' ')).toContain('5 min transfer');
    expect(texts.join(' ')).toContain('to 8A');
  });

  test('summarizes double-transfer trips as a bus route sequence', () => {
    const texts = renderTexts(React.createElement(TripResultCard, {
      itinerary: {
        ...baseItinerary,
        transfers: 2,
        legs: [
          { mode: 'WALK', duration: 120, startTime: 0, endTime: 120000 },
          {
            mode: 'BUS',
            duration: 600,
            startTime: 120000,
            endTime: 720000,
            route: { shortName: '7', color: '#A50000' },
          },
          { mode: 'WALK', duration: 60, startTime: 720000, endTime: 780000 },
          {
            mode: 'BUS',
            duration: 600,
            startTime: 1080000,
            endTime: 1680000,
            route: { shortName: '8A', color: '#32475C' },
          },
          { mode: 'WALK', duration: 60, startTime: 1680000, endTime: 1740000 },
          {
            mode: 'BUS',
            duration: 600,
            startTime: 2280000,
            endTime: 2880000,
            route: { shortName: '2B', color: '#0C8CE5' },
          },
        ],
      },
      onPress: jest.fn(),
    }));

    const text = texts.join(' ');
    expect(text).toContain('7 → 8A → 2B');
    expect(text).toContain('2 transfers');
    expect(text).toContain('Transfer waits: 6 min, 10 min');
  });

  test('puts depart and arrive times in prominent preview fields', () => {
    const texts = renderTexts(React.createElement(TripResultCard, {
      itinerary: {
        ...baseItinerary,
        minutesUntilDeparture: 8,
      },
      onPress: jest.fn(),
    }));

    expect(texts.join(' ')).toContain('Depart');
    expect(texts.join(' ')).toContain('Arrive');
    expect(texts.join(' ')).toContain('Depart in 8 min');
  });

  test('uses the on-pace walking icon in the route preview', () => {
    const root = renderTree(React.createElement(TripResultCard, {
      itinerary: {
        ...baseItinerary,
        legs: [
          { mode: 'WALK', duration: 60 },
          {
            mode: 'BUS',
            duration: 420,
            route: { shortName: '8B', color: '#111111' },
          },
          { mode: 'WALK', duration: 60 },
        ],
      },
      onPress: jest.fn(),
    }));

    const walkIcons = root.findAllByType('WalkingPaceIcon');
    expect(walkIcons).toHaveLength(2);
    expect(walkIcons.every((icon) => icon.props.level === 'on_pace')).toBe(true);
  });
});
