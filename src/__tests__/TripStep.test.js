global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('../components/Icon', () => 'Icon');
jest.mock('../components/DelayBadge', () => ({
  DelayIndicator: 'DelayIndicator',
}));
jest.mock('../utils/colorUtils', () => ({
  getContrastTextColor: () => '#FFFFFF',
}));
jest.mock('../services/tripService', () => ({
  formatDuration: (seconds) => `${Math.round(seconds / 60)} min`,
  formatTimeFromTimestamp: () => '9:00 AM',
  formatDistance: (meters) => `${Math.round(meters)} m`,
}));

const TripStep = require('../components/TripStep').default;

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

describe('TripStep', () => {
  test('shows a simple walking destination summary', () => {
    const texts = renderTexts(React.createElement(TripStep, {
      isFirst: true,
      isLast: false,
      leg: {
        mode: 'WALK',
        startTime: 1000,
        endTime: 181000,
        duration: 180,
        distance: 240,
        from: { name: 'Current location' },
        to: { name: 'Barrie Gold Buyer', stopCode: '1234' },
        steps: [
          { instruction: 'Head east on Mapleview Dr E', distance: 120 },
          { instruction: 'Turn right toward the stop', distance: 80 },
        ],
      },
    }));

    const text = texts.join('');
    expect(text).toContain('Walk to Stop #1234');
    expect(text).toContain('Barrie Gold Buyer');
    expect(text).toContain('240 m • about 3 min');
    expect(text).not.toContain('Head east on Mapleview Dr E • 120 m');
    expect(text).not.toContain('Turn right toward the stop • 80 m');
  });

  test('uses a bus stop icon for walking steps that end at a stop', () => {
    const root = renderTree(React.createElement(TripStep, {
      isFirst: true,
      isLast: false,
      leg: {
        mode: 'WALK',
        startTime: 1000,
        endTime: 181000,
        duration: 180,
        distance: 240,
        from: { name: 'Current location' },
        to: { name: 'Barrie Gold Buyer', stopCode: '1234' },
      },
    }));

    expect(root.findAllByType('Icon')[0].props.name).toBe('BusStop');
  });

  test('shows clear boarding, on-bus, and alighting guidance for bus legs', () => {
    const texts = renderTexts(React.createElement(TripStep, {
      isFirst: false,
      isLast: false,
      leg: {
        mode: 'BUS',
        startTime: 1000,
        endTime: 601000,
        duration: 600,
        distance: 3000,
        from: { name: 'Mapleview Stop', stopCode: '101' },
        to: { name: 'Downtown Terminal', stopCode: '201' },
        route: { shortName: '8A', longName: 'Essa' },
        headsign: 'Downtown Terminal',
        intermediateStops: [
          { name: 'Bayview Drive', lat: 44.1, lon: -79.1 },
          { name: 'Essa Road', lat: 44.2, lon: -79.2 },
        ],
      },
    }));

    const text = texts.join('');
    expect(text).toContain('Board Route 8A');
    expect(text).toContain('Toward Downtown Terminal • 10 min');
    expect(text).toContain('Board at Mapleview Stop (#101)');
    expect(text).toContain('Stay on bus: 2 stops before yours');
    expect(text).toContain('Get off at Downtown Terminal (#201)');
    expect(text).toContain('On bus: Bayview Drive → Essa Road');
  });

  test('shows detour warnings on bus legs', () => {
    const texts = renderTexts(React.createElement(TripStep, {
      isFirst: false,
      isLast: false,
      leg: {
        mode: 'BUS',
        startTime: 1000,
        endTime: 601000,
        duration: 600,
        distance: 3000,
        from: { name: 'Mapleview Stop', stopCode: '101' },
        to: { name: 'Downtown Terminal', stopCode: '201' },
        route: { shortName: '10', longName: 'Downtown' },
        detourImpact: {
          severity: 'stop_affected',
          message: 'Route 10 is on detour and your boarding or exit stop may be affected.',
          affectedStopNames: ['Mapleview Stop'],
        },
      },
    }));

    const text = texts.join('');
    expect(text).toContain('Route 10 is on detour');
    expect(text).toContain('Affected: Mapleview Stop');
  });

  test('renders on-demand legs as booking steps, not bus steps', () => {
    const texts = renderTexts(React.createElement(TripStep, {
      isFirst: true,
      isLast: true,
      leg: {
        mode: 'ON_DEMAND',
        isOnDemand: true,
        startTime: 1000,
        endTime: 901000,
        duration: 900,
        distance: 5000,
        from: { name: 'Pickup' },
        to: { name: 'Drop-off' },
        zoneName: 'Flex Zone',
        bookingPhone: '705-555-0100',
      },
    }));

    const text = texts.join('');
    expect(texts).toContain('Book on-demand ride');
    expect(text).toContain('Pickup at Pickup');
    expect(text).toContain('Drop off at Drop-off');
    expect(text).toContain('Call 705-555-0100 to book');
  });
});
