global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  Platform: { OS: 'ios' },
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Path: 'Path',
}), { virtual: true });

const AlertBanner = require('../components/AlertBanner').default;

describe('AlertBanner', () => {
  test('renders a combined alert banner and triggers onPress', () => {
    const onPress = jest.fn();
    const alerts = [
      { title: 'Downtown detour', severity: 'high' },
      { title: 'Route 2 delay', severity: 'medium' },
    ];

    let inst;
    act(() => {
      inst = create(React.createElement(AlertBanner, { alerts, onPress }));
    });

    const texts = inst.root.findAllByType('Text').map((node) => node.props.children);
    const button = inst.root.findByType('TouchableOpacity');

    act(() => {
      button.props.onPress();
    });

    expect(texts).toContain('2 Service Alerts');
    expect(texts).toContain(2);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('renders the single alert title and returns null when severity is missing', () => {
    let inst;
    act(() => {
      inst = create(
        React.createElement(AlertBanner, {
          alert: { title: 'Stop moved', severity: 'low' },
        })
      );
    });

    const texts = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(texts).toContain('Stop moved');

    let emptyInst;
    act(() => {
      emptyInst = create(
        React.createElement(AlertBanner, {
          alert: { title: 'Incomplete alert' },
        })
      );
    });

    expect(emptyInst.toJSON()).toBeNull();
  });
});
