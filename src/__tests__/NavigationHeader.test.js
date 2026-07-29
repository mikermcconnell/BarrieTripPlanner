global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('../components/Icon', () => 'Icon');
jest.mock('../components/navigation/WalkingPaceIcon', () => 'WalkingPaceIcon');

const NavigationHeader = require('../components/navigation/NavigationHeader').default;
const { COLORS } = require('../config/theme');

const renderTree = (element) => {
  let inst;
  act(() => {
    inst = create(element);
  });
  return inst.root;
};

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

describe('NavigationHeader', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-05-01T12:00:00Z').getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('uses pace artwork for the walking stage icon', () => {
    const root = renderTree(React.createElement(NavigationHeader, {
      navigationState: { type: 'walking', label: 'Walking to stop' },
      destinationName: 'Mapleview Stop',
      currentLegIndex: 0,
      totalLegs: 2,
      onClose: jest.fn(),
      walkingPaceLevel: 'hurry',
    }));

    expect(root.findAllByType('WalkingPaceIcon')[0].props.level).toBe('hurry');
  });

  test('keeps the walking header color stable while the artwork carries pace color', () => {
    const root = renderTree(React.createElement(NavigationHeader, {
      navigationState: { type: 'walking', label: 'Walking to stop' },
      destinationName: 'Mapleview Stop',
      currentLegIndex: 0,
      totalLegs: 2,
      onClose: jest.fn(),
      walkingPaceLevel: 'behind',
    }));

    expect(root.findAllByType('View')[0].props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: COLORS.primary })])
    );
  });

  test('labels the top-right arrival time as ETA', () => {
    const root = renderTree(React.createElement(NavigationHeader, {
      navigationState: { type: 'transit', label: 'Riding to Downtown' },
      destinationName: 'Downtown Terminal',
      currentLegIndex: 0,
      totalLegs: 1,
      onClose: jest.fn(),
      scheduledArrivalTime: new Date('2026-05-01T12:23:00Z').getTime(),
    }));

    const text = root.findAllByType('Text').flatMap((node) => collectText(node)).join('|');
    expect(text).toContain('ETA');
    expect(text).toContain('23 min');
  });

  test('shows the boarding stop and expected bus time while waiting', () => {
    const root = renderTree(React.createElement(NavigationHeader, {
      navigationState: { type: 'waiting', label: 'Wait for 8A' },
      destinationName: 'Park Place',
      boardingStop: { name: 'Mapleview Drive', stopCode: '1234' },
      currentLegIndex: 1,
      totalLegs: 3,
      onClose: jest.fn(),
      scheduledDepartureTime: Date.now() + 10 * 60 * 1000,
      delaySeconds: 2 * 60,
      isRealtime: true,
    }));

    const text = root.findAllByType('Text').flatMap((node) => collectText(node)).join('|');
    expect(text).toContain('WAITING AT');
    expect(text).toContain('Mapleview Drive · Stop #1234');
    expect(text).not.toContain('Park Place');
    expect(text).toContain('BUS EXPECTED');
    expect(text).toContain('in 10 min');
    expect(text).not.toContain('in 12 min');
    expect(text).toContain('LIVE');
  });

  test('does not label the final arrival as the bus expected time when departure is missing', () => {
    const root = renderTree(React.createElement(NavigationHeader, {
      navigationState: { type: 'waiting', label: 'Wait for 8A' },
      destinationName: 'Park Place',
      boardingStop: { name: 'Mapleview Drive', stopCode: '1234' },
      currentLegIndex: 1,
      totalLegs: 3,
      onClose: jest.fn(),
      scheduledArrivalTime: Date.now() + 30 * 60 * 1000,
    }));

    const text = root.findAllByType('Text').flatMap((node) => collectText(node)).join('|');
    expect(text).not.toContain('BUS EXPECTED');
    expect(text).not.toContain('30 min');
  });
});
