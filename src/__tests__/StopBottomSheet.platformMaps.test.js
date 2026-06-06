global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Alert: { alert: jest.fn() },
  Platform: { OS: 'ios' },
  StyleSheet: { create: (styles) => styles },
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
  Linking: { openURL: jest.fn() },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ children }) => React.createElement('BottomSheet', null, children),
    BottomSheetScrollView: ({ children }) => React.createElement('BottomSheetScrollView', null, children),
  };
});

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Path: 'Path' }), { virtual: true });
jest.mock('../hooks/useStopArrivals', () => ({ useStopArrivals: () => ({ arrivals: [], isLoading: false, error: null, loadArrivals: jest.fn() }) }));
jest.mock('../utils/shareUtils', () => ({ shareStop: jest.fn() }));
jest.mock('../components/ArrivalRow', () => 'ArrivalRow');

const StopBottomSheet = require('../components/StopBottomSheet').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

describe('StopBottomSheet platform maps', () => {
  test('renders platform map card and calls open handler', () => {
    const platformMap = { id: 'georgian-college', displayName: 'Georgian College' };
    const onOpenPlatformMap = jest.fn();
    let inst;

    act(() => {
      inst = create(React.createElement(StopBottomSheet, {
        stop: { id: '335', code: '335', name: 'Georgian College' },
        onClose: jest.fn(),
        platformMap,
        onOpenPlatformMap,
      }));
    });

    const button = inst.root.findAllByType('TouchableOpacity')
      .find((node) => node.props.accessibilityLabel === 'Open platform map for Georgian College');

    act(() => button.props.onPress());

    expect(onOpenPlatformMap).toHaveBeenCalledWith(platformMap);
  });

  test('shows MyRide end date for stop closure notices', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(StopBottomSheet, {
        stop: {
          id: '932',
          code: '932',
          name: 'Hooper Road',
          closureImpact: {
            message: 'Stop 932 is closed for this detour.',
            endsAt: Date.parse('2026-05-20T23:59:59-04:00'),
          },
        },
        onClose: jest.fn(),
      }));
    });

    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));
    expect(texts).toContain('Expected end date: May 20, 2026');
  });

  test('summarizes standalone closure details instead of telling riders to check MyRide', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(StopBottomSheet, {
        stop: {
          id: '934',
          code: '934',
          name: 'Sarjeant Drive',
          closureImpact: {
            message: 'Sarjeant Drive is reported closed or scheduled to close. Check the linked Barrie Transit news before travelling.',
            affectedRoutes: ['8B'],
            sourceTitle: 'Route 8B stop closure',
            sourceUrl: 'https://www.myridebarrie.ca/news/stop-closure',
          },
        },
        onClose: jest.fn(),
      }));
    });

    const text = inst.root.findAllByType('Text').flatMap((node) => collectText(node)).join(' ');
    expect(text).toContain('Sarjeant Drive is currently reported closed.');
    expect(text).toContain('Affected route: 8B.');
    expect(text).toContain('Notice: Route 8B stop closure.');
    expect(text).not.toContain('Check the linked Barrie Transit news');
    expect(text).not.toContain('Open MyRide notice');
  });

  test('shows upcoming stop closure start date without closed wording', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(StopBottomSheet, {
        stop: {
          id: '932',
          code: '932',
          name: 'Hooper Road',
          upcomingClosureImpact: {
            message: 'Stop 932 will be closed for this detour.',
            startsAt: Date.parse('2026-05-20T07:00:00-04:00'),
            endsAt: Date.parse('2026-05-24T23:59:59-04:00'),
          },
        },
        onClose: jest.fn(),
      }));
    });

    const text = inst.root.findAllByType('Text').flatMap((node) => collectText(node)).join(' ');
    expect(text).toContain('Closure scheduled');
    expect(text).toContain('Starts May 20, 2026');
    expect(text).not.toContain('Stop closure reported');
  });
});


