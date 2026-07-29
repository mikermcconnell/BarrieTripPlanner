global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act, create } = require('react-test-renderer');

jest.mock('react-native', () => ({
  Modal: 'Modal',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: {
    absoluteFill: { position: 'absolute' },
    create: (styles) => styles,
  },
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
  Dimensions: {
    get: () => ({ width: 390, height: 800 }),
  },
  Platform: { OS: 'ios' },
  StatusBar: { currentHeight: 0 },
  useWindowDimensions: () => ({ width: 390, height: 800 }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 12, left: 0 }),
}));

const DetourExplainerButton = require('../components/DetourExplainerButton').default;

const getText = (instance) => instance.root
  .findAllByType('Text')
  .map((node) => node.props.children)
  .filter((value) => typeof value === 'string');

describe('DetourExplainerButton', () => {
  test('opens the public detour explanation and closes it again', () => {
    let instance;
    act(() => {
      instance = create(React.createElement(DetourExplainerButton));
    });

    const trigger = instance.root.findByProps({ accessibilityLabel: 'Learn how the Auto Detour Detector works' });
    expect(instance.root.findByType('Modal').props.visible).toBe(false);

    act(() => trigger.props.onPress());

    expect(instance.root.findByType('Modal').props.visible).toBe(true);
    expect(getText(instance)).toEqual(expect.arrayContaining([
      'Meet the Auto Detour Detector',
      'Built to spot unexpected route changes',
      'Spots something different',
      'Checks that it is real',
      'Shows you the detour',
      'Knows when it is over',
      'Good to know',
    ]));

    const closeButtons = instance.root.findAllByProps({ accessibilityLabel: 'Close Auto Detour Detector explanation' });
    act(() => closeButtons[closeButtons.length - 1].props.onPress());
    expect(instance.root.findByType('Modal').props.visible).toBe(false);
  });

  test('explains the timing and accuracy limits', () => {
    let instance;
    act(() => {
      instance = create(React.createElement(DetourExplainerButton));
    });

    act(() => instance.root.findByProps({ accessibilityLabel: 'Learn how the Auto Detour Detector works' }).props.onPress());

    expect(getText(instance)).toContain(
      'The detector takes a little time to check a new detour, and the path shown is its best estimate. Check Barrie Transit service alerts for planned changes and official updates.'
    );
  });

  test('uses the friendly Nunito type family', () => {
    let instance;
    act(() => {
      instance = create(React.createElement(DetourExplainerButton));
    });

    act(() => instance.root.findByProps({ accessibilityLabel: 'Learn how the Auto Detour Detector works' }).props.onPress());

    expect(instance.root.findByProps({ children: 'Meet the Auto Detour Detector' }).props.style.fontFamily)
      .toBe('Nunito_800ExtraBold');
    expect(instance.root.findByProps({ children: 'A bus moves away from its usual route.' }).props.style.fontFamily)
      .toBe('Nunito_400Regular');
  });
});
