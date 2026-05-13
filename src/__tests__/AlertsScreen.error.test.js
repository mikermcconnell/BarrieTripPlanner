const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  FlatList: 'FlatList',
  TouchableOpacity: 'TouchableOpacity',
  ActivityIndicator: 'ActivityIndicator',
  RefreshControl: 'RefreshControl',
  Linking: { openURL: jest.fn() },
  LayoutAnimation: {
    configureNext: jest.fn(),
    create: jest.fn(),
    Types: { easeInEaseOut: 'easeInEaseOut' },
    Properties: { opacity: 'opacity' },
  },
  UIManager: { setLayoutAnimationEnabledExperimental: jest.fn() },
  Platform: { OS: 'ios' },
  StyleSheet: { create: (styles) => styles },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

jest.mock('../services/alertService', () => ({
  fetchServiceAlerts: jest.fn(),
}));

const { fetchServiceAlerts } = require('../services/alertService');
const AlertsScreen = require('../screens/AlertsScreen').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

describe('AlertsScreen errors', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('does not label a load failure as no active alerts', async () => {
    fetchServiceAlerts.mockRejectedValue(new TypeError('Failed to fetch'));
    let renderer;

    await act(async () => {
      renderer = create(React.createElement(AlertsScreen, {
        navigation: { goBack: jest.fn() },
      }));
    });

    const texts = renderer.root.findAllByType('Text').flatMap((node) => collectText(node));

    expect(texts).toContain('Could not load service alerts');
    expect(texts).toContain('Check your connection, then try again.');
    expect(texts).not.toContain('No active alerts');
  });
});
