global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles) => styles },
}));

const PlatformMapCard = require('../components/PlatformMapCard').default;

describe('PlatformMapCard', () => {
  test('renders hub helper text and opens platform map', () => {
    const onPress = jest.fn();
    let inst;

    act(() => {
      inst = create(React.createElement(PlatformMapCard, {
        platformMap: { id: 'georgian-college', displayName: 'Georgian College' },
        onPress,
      }));
    });

    const texts = inst.root.findAllByType('Text').map((node) => node.props.children);
    const button = inst.root.findByType('TouchableOpacity');

    act(() => button.props.onPress());

    expect(texts).toContain('Platform map available');
    expect(texts).toContain('Find your bus platform at Georgian College.');
    expect(texts).toContain('Open platform map');
    expect(onPress).toHaveBeenCalledWith({ id: 'georgian-college', displayName: 'Georgian College' });
  });

  test('returns null without a platform map', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(PlatformMapCard, { platformMap: null, onPress: jest.fn() }));
    });
    expect(inst.toJSON()).toBeNull();
  });
});
