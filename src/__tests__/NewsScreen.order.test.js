const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  TouchableOpacity: 'TouchableOpacity',
  Linking: { openURL: jest.fn() },
  StyleSheet: { create: (styles) => styles },
  Platform: { OS: 'ios' },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

const mockTransitRealtime = jest.fn();

jest.mock('../context/TransitContext', () => ({
  useTransitRealtime: () => mockTransitRealtime(),
}));

const NewsScreen = require('../screens/NewsScreen').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const renderTexts = () => {
  let inst;
  act(() => {
    inst = create(React.createElement(NewsScreen, {
      navigation: { goBack: jest.fn() },
    }));
  });
  return inst.root.findAllByType('Text').flatMap((node) => collectText(node));
};

describe('NewsScreen service impact order', () => {
  beforeEach(() => {
    mockTransitRealtime.mockReturnValue({
      transitNews: [
        {
          id: 'detour-notice-1',
          title: 'Route 8 detour',
          body: 'Route 8 is on detour from May 4.',
          publishedAt: new Date('2026-05-04T12:00:00Z').getTime(),
          affectedRoutes: ['8'],
        },
      ],
      transitNewsImpacts: [
        {
          id: 'stop-closure-1',
          type: 'stop_closure',
          status: 'active',
          stopCode: '100',
          stopName: 'Downtown',
          sourceTitle: 'Stop 100 closed',
          message: 'Stop 100 is closed.',
          affectedRoutes: ['8'],
        },
      ],
      officialServiceImpacts: [
        {
          id: 'baseline-detour-12b-1652',
          type: 'baseline_detour',
          status: 'active',
          title: 'Mapleview Detour and Shuttle',
          message: 'Planned detour notice: Route 12 is following a long-term Mapleview detour.',
          affectedRoutes: ['12B'],
          replacementRoutes: ['15'],
          sourceUrl: 'https://myridebarrie.ca/News/1652/mapleview-detour-and-shuttle/',
        },
      ],
      activeDetours: {},
    });
  });

  test('shows detour sections before stop closure sections', () => {
    const texts = renderTexts();

    expect(texts.indexOf('Active detours')).toBeLessThan(texts.indexOf('Active stop closures'));
    expect(texts.indexOf('Upcoming detours')).toBeLessThan(texts.indexOf('Upcoming stop closures'));
  });

  test('shows official baseline detours as planned detour notices', () => {
    const texts = renderTexts();
    const joined = texts.join(' ');

    expect(joined).toContain('Mapleview Detour and Shuttle');
    expect(joined).toContain('Planned detour notice');
    expect(joined).toContain('Route 12B');
    expect(joined).toContain('Use Route 15 shuttle');
  });
});
