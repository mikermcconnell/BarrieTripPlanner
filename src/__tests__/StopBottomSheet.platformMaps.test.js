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
});


