global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 1,
  },
  Platform: { OS: 'ios' },
  UIManager: {},
  LayoutAnimation: {
    configureNext: jest.fn(),
    Presets: { easeInEaseOut: 'easeInEaseOut' },
  },
}));

jest.mock('../components/Icon', () => 'Icon');

const DetourAlertStrip = require('../components/DetourAlertStrip').default;

describe('DetourAlertStrip', () => {
  test('opens details directly when the collapsed banner has one detour', () => {
    const onPress = jest.fn();
    let inst;

    act(() => {
      inst = create(React.createElement(DetourAlertStrip, {
        activeDetours: {
          '8A': { state: 'active', confidence: 'high' },
        },
        routes: [{ id: '8A', shortName: '8A' }],
        onPress,
      }));
    });

    const collapsedButton = inst.root.findAllByType('TouchableOpacity')[0];
    act(() => {
      collapsedButton.props.onPress();
    });

    expect(onPress).toHaveBeenCalledWith('8A');
  });

  test('does not render low-confidence detours', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourAlertStrip, {
        activeDetours: {
          '8A': { state: 'active', confidence: 'low' },
        },
        routes: [{ id: '8A', shortName: '8A' }],
        onPress: jest.fn(),
      }));
    });

    expect(inst.toJSON()).toBeNull();
  });

  test('does not render medium-confidence detours with only one vehicle', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourAlertStrip, {
        activeDetours: {
          '8A': { state: 'active', confidence: 'medium', vehicleCount: 1 },
        },
        routes: [{ id: '8A', shortName: '8A' }],
        onPress: jest.fn(),
      }));
    });

    expect(inst.toJSON()).toBeNull();
  });

  test('collapses route variants into one likely route-family banner', () => {
    const onPress = jest.fn();
    let inst;

    act(() => {
      inst = create(React.createElement(DetourAlertStrip, {
        activeDetours: {
          '8A': { state: 'active', confidence: 'medium', vehicleCount: 2 },
          '8B': { state: 'active', confidence: 'medium', vehicleCount: 2 },
        },
        routes: [
          { id: '8A', shortName: '8A' },
          { id: '8B', shortName: '8B' },
        ],
        onPress,
      }));
    });

    const textValues = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(textValues).toContain('Likely detour: 8');

    const collapsedButton = inst.root.findAllByType('TouchableOpacity')[0];
    act(() => {
      collapsedButton.props.onPress();
    });

    expect(onPress).not.toHaveBeenCalled();
    expect(inst.root.findAllByType('TouchableOpacity').length).toBeGreaterThan(1);

    act(() => {
      inst.unmount();
    });
  });

  test('uses confirmed wording for high-confidence detours', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(DetourAlertStrip, {
        activeDetours: {
          '1': { state: 'active', confidence: 'high' },
        },
        routes: [{ id: '1', shortName: '1' }],
        onPress: jest.fn(),
      }));
    });

    const textValues = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(textValues).toContain('Confirmed detour: 1');
  });
});
