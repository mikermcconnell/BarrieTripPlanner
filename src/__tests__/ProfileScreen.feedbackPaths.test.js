const React = require('react');
const { create, act } = require('react-test-renderer');

const mockNavigate = jest.fn();
const mockOpenURL = jest.fn();
const mockAlert = jest.fn();
const mockSignOut = jest.fn();
let mockAuthState;

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  TouchableOpacity: 'TouchableOpacity',
  Alert: { alert: (...args) => mockAlert(...args) },
  Linking: { openURL: (...args) => mockOpenURL(...args) },
  StyleSheet: { create: (styles) => styles },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

jest.mock('../components/Icon', () => 'Icon');

jest.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('../config/constants', () => ({
  APP_CONFIG: {
    APP_NAME: 'Barrie Transit',
    VERSION: '1.0.0',
    SUPPORT_EMAIL: 'support@example.com',
  },
}));

const ProfileScreen = require('../screens/ProfileScreen').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const textForNode = (node) => collectText(node).join(' ');

const renderProfile = () => {
  let inst;
  act(() => {
    inst = create(React.createElement(ProfileScreen, {
      navigation: {
        navigate: mockNavigate,
        getParent: () => ({ navigate: mockNavigate }),
      },
    }));
  });
  return inst;
};

const findTouchableByText = (root, text) => (
  root
    .findAllByType('TouchableOpacity')
    .find((node) => textForNode(node).includes(text))
);

describe('ProfileScreen feedback paths', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockOpenURL.mockClear();
    mockAlert.mockClear();
    mockSignOut.mockClear();
    mockAuthState = {
      user: null,
      isAuthenticated: false,
      favorites: { stops: [], routes: [] },
      tripHistory: [],
      savedPlaces: [],
      savedTrips: [],
      signOut: mockSignOut,
    };
  });

  test('invites riders to share feedback because the app is new', () => {
    const inst = renderProfile();
    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));

    expect(texts).toContain('Help shape My Barrie Transit');
    expect(texts).toContain(
      "This app is new and we're actively improving it. Tell us what's working, what's confusing, or what you'd like to see next."
    );
    expect(texts).toContain('Share app feedback');
  });


  test('signed-in users manage their account and sign out from the App section', () => {
    mockAuthState = {
      ...mockAuthState,
      user: { displayName: 'Mike McConnell', email: 'mike@example.com' },
      isAuthenticated: true,
    };

    const inst = renderProfile();
    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));

    expect(texts).toContain('Manage account');
    expect(texts).toContain('Name, email, password, and account actions');
    expect(texts).toContain('Sign out');

    const manageAccount = findTouchableByText(inst.root, 'Manage account');
    act(() => {
      manageAccount.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('Account');

    const signOut = findTouchableByText(inst.root, 'Sign out');
    act(() => {
      signOut.props.onPress();
    });

    expect(mockAlert).toHaveBeenCalledWith('Sign Out', 'Are you sure you want to sign out?', expect.any(Array));
  });

  test('shows separate transit network and app feedback menu items', () => {
    const inst = renderProfile();
    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));

    expect(texts).toContain('Transit network feedback');
    expect(texts).toContain('Routes, stops, schedules, and service');
    expect(texts).toContain('App feedback');
    expect(texts).toContain('Bugs, usability, or app ideas');
  });

  test('transit network feedback opens the survey with a network trigger', () => {
    const inst = renderProfile();
    const item = findTouchableByText(inst.root, 'Transit network feedback');

    act(() => {
      item.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('Survey', { trigger: 'transit_network' });
  });

  test('app feedback explains that feedback is encouraged before opening email', () => {
    const inst = renderProfile();
    const item = findTouchableByText(inst.root, 'App feedback');

    act(() => {
      item.props.onPress();
    });

    expect(mockOpenURL).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledWith(
      'App feedback is welcome',
      'This app is new and still improving. Bug reports, confusing moments, and feature ideas are all helpful.',
      expect.any(Array)
    );

    const buttons = mockAlert.mock.calls[0][2];
    const shareButton = buttons.find((button) => button.text === 'Share app feedback');

    act(() => {
      shareButton.onPress();
    });

    expect(mockOpenURL).toHaveBeenCalledWith(
      expect.stringMatching(/^mailto:support@example\.com\?/)
    );
    expect(mockOpenURL.mock.calls[0][0]).toContain('subject=App%20feedback');
  });
});
