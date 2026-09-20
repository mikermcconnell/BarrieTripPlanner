const React = require('react');
const { act, create } = require('react-test-renderer');

const mockNavigate = jest.fn();
const mockOpenAppContactEmail = jest.fn();
const mockOpenExternalUrl = jest.fn();
const mockOpenTransitContactPage = jest.fn();

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Dimensions: { get: () => ({ height: 844, width: 390 }) },
  Platform: { OS: 'android' },
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles) => styles },
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  useWindowDimensions: () => ({ height: 844, width: 390 }),
  View: 'View',
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

jest.mock('../utils/androidNavigationBar', () => ({
  addSafeBottomPadding: (padding) => padding,
  useSafeBottomInset: (inset) => inset,
}));

jest.mock('../utils/externalLinks', () => ({
  openAppContactEmail: (...args) => mockOpenAppContactEmail(...args),
  openExternalUrl: (...args) => mockOpenExternalUrl(...args),
  openTransitContactPage: (...args) => mockOpenTransitContactPage(...args),
}));

const AboutScreen = require('../screens/AboutScreen').default;
const HelpSupportScreen = require('../screens/HelpSupportScreen').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const findButton = (instance, label) => instance.root.findAllByType('TouchableOpacity')
  .find((node) => collectText(node).join('') === label);

describe('support contact interactions', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockOpenAppContactEmail.mockReset().mockResolvedValue({ success: true });
    mockOpenExternalUrl.mockReset().mockResolvedValue({ success: true });
    mockOpenTransitContactPage.mockReset().mockResolvedValue({ success: true });
  });

  test('About opens in-app support and retains email as a secondary action', async () => {
    let instance;
    act(() => {
      instance = create(React.createElement(AboutScreen, {
        navigation: { goBack: jest.fn(), navigate: mockNavigate },
      }));
    });

    act(() => findButton(instance, 'Contact app support›').props.onPress());
    await act(async () => findButton(instance, 'Email app support›').props.onPress());

    expect(mockNavigate).toHaveBeenCalledWith('AppFeedback', { source: 'about' });
    expect(mockOpenAppContactEmail).toHaveBeenCalledTimes(1);
  });

  test('Help opens in-app support, optional email, and the Service Barrie webpage', async () => {
    let instance;
    act(() => {
      instance = create(React.createElement(HelpSupportScreen, {
        navigation: { goBack: jest.fn(), navigate: mockNavigate },
      }));
    });

    act(() => findButton(instance, 'Contact app support').props.onPress());
    await act(async () => findButton(instance, 'Email app support').props.onPress());
    await act(async () => findButton(instance, 'Contact Barrie Transit').props.onPress());

    expect(mockNavigate).toHaveBeenCalledWith('AppFeedback', { source: 'help_support' });
    expect(mockOpenAppContactEmail).toHaveBeenCalledTimes(1);
    expect(mockOpenTransitContactPage).toHaveBeenCalledTimes(1);
  });
});
