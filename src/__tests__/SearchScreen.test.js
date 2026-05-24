const React = require('react');
const { create, act } = require('react-test-renderer');

const mockScrollToOffset = jest.fn();
let mockTransitState;
const mockNavigate = jest.fn();

jest.mock('react-native', () => {
  const ReactActual = require('react');
  const MockFlatList = ReactActual.forwardRef((props, ref) => {
    ReactActual.useImperativeHandle(ref, () => ({
      scrollToOffset: mockScrollToOffset,
    }));
    return ReactActual.createElement('FlatList', props);
  });

  return {
    View: 'View',
    Text: 'Text',
    TextInput: 'TextInput',
    TouchableOpacity: 'TouchableOpacity',
    ActivityIndicator: 'ActivityIndicator',
    FlatList: MockFlatList,
    StyleSheet: { create: (styles) => styles },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

jest.mock('@react-navigation/native', () => {
  const ReactActual = require('react');
  return {
    useFocusEffect: (callback) => {
      ReactActual.useEffect(callback, [callback]);
    },
  };
});

jest.mock('../context/TransitContext', () => ({
  useTransitStatic: () => mockTransitState,
}));

jest.mock('../hooks/useSearchHistory', () => ({
  useSearchHistory: () => ({
    addToHistory: jest.fn(),
    getHistory: jest.fn(() => []),
    clearHistory: jest.fn(),
  }),
}));

jest.mock('../services/locationIQService', () => ({
  autocompleteAddress: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../services/analyticsService', () => ({
  trackEvent: jest.fn(),
}));

jest.mock('../components/Icon', () => 'Icon');

const SearchScreen = require('../screens/SearchScreen').default;
const { FEATURED_STOP_CODES } = require('../utils/searchHighlights');

const makeStop = (code) => ({
  id: `stop-${code}`,
  code,
  name: `Stop ${code}`,
});

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const renderSearch = () => {
  let inst;
  act(() => {
    inst = create(React.createElement(SearchScreen, {
      navigation: { navigate: mockNavigate },
    }));
  });
  return inst;
};

describe('SearchScreen', () => {
  beforeEach(() => {
    mockScrollToOffset.mockClear();
    mockNavigate.mockClear();
    mockTransitState = {
      stops: [
        makeStop('999'),
        ...[...FEATURED_STOP_CODES].reverse().map(makeStop),
      ],
      routes: [],
      isLoadingStatic: false,
    };
  });

  test('shows highlighted stops copy instead of saying only 20 stops were found', () => {
    const inst = renderSearch();

    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));

    expect(texts).toContain('Showing 20 highlighted stops');
    expect(texts).not.toContain('20 stops found');
  });

  test('uses the configured top highlighted stops before fallback feed order', () => {
    const inst = renderSearch();

    const list = inst.root.findByType('FlatList');
    const displayedCodes = list.props.data.map((stop) => stop.code);

    expect(displayedCodes).toEqual(FEATURED_STOP_CODES);
  });

  test('resets the result list to the top when the search screen renders', () => {
    renderSearch();

    expect(mockScrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
  });
});
