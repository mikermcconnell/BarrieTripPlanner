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
    expect(text).toContain('23| min');
  });
});
