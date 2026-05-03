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
jest.mock('../components/navigation/TurnIcon', () => 'TurnIcon');
jest.mock('../components/navigation/WalkingPaceIcon', () => 'WalkingPaceIcon');
jest.mock('../services/tripService', () => ({
  formatDistance: (meters) => `${Math.round(meters)} m`,
}));

const WalkingInstructionCard = require('../components/navigation/WalkingInstructionCard').default;

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

describe('WalkingInstructionCard', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-05-01T12:00:00Z').getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('shows bus pace status while walking to a stop', () => {
    const texts = renderTexts(React.createElement(WalkingInstructionCard, {
      currentStep: { type: 'depart', instruction: 'Start walking' },
      currentLeg: {
        mode: 'WALK',
        duration: 4 * 60,
        distance: 400,
        to: { name: 'Mapleview Stop', stopCode: '1234' },
      },
      nextTransitLeg: {
        mode: 'BUS',
        startTime: Date.now() + 7 * 60 * 1000,
      },
      nextTransitProximity: null,
      distanceToDestination: null,
      onNextLeg: jest.fn(),
    }));

    const text = texts.join('');
    expect(text).toContain('3 min buffer');
    expect(text).toContain('Bus departs in 7 min · 4 min walk');
    expect(text).not.toContain('Follow the walking line on the map to this stop.');
    expect(text).toContain('Expand');
  });

  test('uses the pace artwork when walking to a stop', () => {
    const root = renderTree(React.createElement(WalkingInstructionCard, {
      currentStep: { type: 'depart', instruction: 'Start walking' },
      currentLeg: {
        mode: 'WALK',
        duration: 4 * 60,
        distance: 400,
        to: { name: 'Mapleview Stop', stopCode: '1234' },
      },
      nextTransitLeg: {
        mode: 'BUS',
        startTime: Date.now() + 7 * 60 * 1000,
      },
      onNextLeg: jest.fn(),
    }));

    expect(root.findAllByType('WalkingPaceIcon')).toHaveLength(1);
    expect(root.findAllByType('WalkingPaceIcon')[0].props.level).toBe('hurry');
  });

  test('defaults to minimized and lets the rider expand walking instructions', () => {
    const root = renderTree(React.createElement(WalkingInstructionCard, {
      currentStep: { type: 'depart', instruction: 'Start walking' },
      currentLeg: {
        mode: 'WALK',
        duration: 4 * 60,
        distance: 400,
        to: { name: 'Mapleview Stop', stopCode: '1234' },
      },
      nextTransitLeg: {
        mode: 'BUS',
        startTime: Date.now() + 7 * 60 * 1000,
      },
      onNextLeg: jest.fn(),
    }));

    let text = root.findAllByType('Text').flatMap((node) => collectText(node)).join('');
    expect(text).toContain('Walk to Stop #1234');
    expect(text).toContain('3 min buffer');
    expect(text).not.toContain('Follow the walking line on the map to this stop.');
    expect(root.findByProps({ accessibilityLabel: 'Expand walking instructions' })).toBeTruthy();

    act(() => {
      root.findByProps({ accessibilityLabel: 'Expand walking instructions' }).props.onPress();
    });

    text = root.findAllByType('Text').flatMap((node) => collectText(node)).join('');
    expect(text).toContain('Follow the walking line on the map to this stop.');
    expect(root.findByProps({ accessibilityLabel: 'Minimize walking instructions' })).toBeTruthy();
  });

  test('warns in the minimized card when the real-time bus likely left', () => {
    const onFindNextTrip = jest.fn();
    const root = renderTree(React.createElement(WalkingInstructionCard, {
      currentStep: { type: 'depart', instruction: 'Start walking' },
      currentLeg: {
        mode: 'WALK',
        duration: 4 * 60,
        distance: 400,
        to: { name: 'Mapleview Stop', stopCode: '1234' },
      },
      nextTransitLeg: {
        mode: 'BUS',
        startTime: Date.now() + 7 * 60 * 1000,
      },
      nextTransitProximity: {
        boardingBusStatus: 'likely_departed',
      },
      onFindNextTrip,
      onNextLeg: jest.fn(),
    }));

    let text = root.findAllByType('Text').flatMap((node) => collectText(node)).join('');
    expect(text).toContain('Bus may have left');
    expect(text).toContain('Find next trip');
    expect(text).toContain('Keep watching');

    act(() => {
      root.findByProps({ accessibilityLabel: 'Find next trip' }).props.onPress();
    });
    expect(onFindNextTrip).toHaveBeenCalledTimes(1);

    act(() => {
      root.findByProps({ accessibilityLabel: 'Keep watching' }).props.onPress();
    });

    text = root.findAllByType('Text').flatMap((node) => collectText(node)).join('');
    expect(text).not.toContain('Bus may have left');
    expect(text).toContain('3 min buffer');
  });
});
