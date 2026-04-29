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
          '8A': { state: 'active' },
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
});
