global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act, create } = require('react-test-renderer');

jest.mock('react-native', () => ({
  Linking: {
    openURL: jest.fn(() => Promise.resolve()),
  },
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
const { Linking } = require('react-native');

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
      "It keeps an eye on detours, so you don't have to.",
      'Built to spot unexpected route changes',
      'When buses start taking a different path, the detector looks for the detour route and displays the estimated detour on your map.',
      'Spots something different',
      'Confirms the detour',
      'Detour is shown',
      'Detour removal',
      'Good to know',
    ]));

    const closeButtons = instance.root.findAllByProps({ accessibilityLabel: 'Close Auto Detour Detector explanation' });
    act(() => closeButtons[closeButtons.length - 1].props.onPress());
    expect(instance.root.findByType('Modal').props.visible).toBe(false);
  });

  test('explains the timing and accuracy limits and links to official alerts', () => {
    let instance;
    act(() => {
      instance = create(React.createElement(DetourExplainerButton));
    });

    act(() => instance.root.findByProps({ accessibilityLabel: 'Learn how the Auto Detour Detector works' }).props.onPress());

    const rendered = JSON.stringify(instance.toJSON());
    expect(rendered).toContain('Two bus trips must show the same detour before it appears on the map.');
    expect(rendered).toContain('Depending on bus frequency, this may take one to two hours.');
    expect(rendered).toContain('Detour routes and affected stops are estimates.');
    expect(getText(instance)).toContain('Barrie Transit service alerts');

    act(() => instance.root.findByProps({ accessibilityLabel: 'Open Barrie Transit service alerts' }).props.onPress());
    expect(Linking.openURL).toHaveBeenCalledWith('https://www.myridebarrie.ca/News/');
  });

  test('minimizes the detector card to an icon and restores it', () => {
    let instance;
    act(() => {
      instance = create(React.createElement(DetourExplainerButton));
    });

    const minimizeButton = instance.root.findByProps({
      accessibilityLabel: 'Minimize Auto Detour Detector button',
    });
    expect(minimizeButton.props.style.width).toBe(44);
    expect(minimizeButton.props.style.height).toBe(44);
    act(() => minimizeButton.props.onPress());

    expect(instance.root.findAllByProps({
      accessibilityLabel: 'Learn how the Auto Detour Detector works',
    })).toHaveLength(0);

    const restoreButton = instance.root.findByProps({
      accessibilityLabel: 'Show Auto Detour Detector button',
    });
    act(() => restoreButton.props.onPress());

    expect(instance.root.findByProps({
      accessibilityLabel: 'Learn how the Auto Detour Detector works',
    })).toBeTruthy();
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
