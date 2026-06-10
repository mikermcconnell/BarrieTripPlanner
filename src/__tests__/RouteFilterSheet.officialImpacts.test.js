const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles) => styles },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

jest.mock('@gorhom/bottom-sheet', () => ({
  __esModule: true,
  default: ({ children }) => require('react').createElement('BottomSheet', null, children),
  BottomSheetScrollView: ({ children }) => require('react').createElement('BottomSheetScrollView', null, children),
  BottomSheetBackdrop: () => require('react').createElement('BottomSheetBackdrop'),
}));

const RouteFilterSheet = require('../components/RouteFilterSheet').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

describe('RouteFilterSheet official impacts', () => {
  test('shows selected route official baseline notices separately from active detours', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(RouteFilterSheet, {
        sheetRef: React.createRef(),
        routes: [{ id: '12B', shortName: '12B' }, { id: '8', shortName: '8' }],
        selectedRoutes: new Set(['12B']),
        onRouteSelect: jest.fn(),
        getRouteColor: () => '#f39ac2',
        isRouteDetouring: () => false,
        officialServiceImpacts: [{
          id: 'baseline-detour-12b-1652',
          type: 'baseline_detour',
          status: 'active',
          title: 'Mapleview Detour and Shuttle',
          message: 'Route 12B no longer directly serves Barrie South GO.',
          affectedRoutes: ['12B'],
          replacementRoutes: ['15'],
        }],
      }));
    });

    const text = inst.root.findAllByType('Text').flatMap((node) => collectText(node)).join(' ');

    expect(text).toContain('Planned detour notice');
    expect(text).toContain('Mapleview Detour and Shuttle');
    expect(text).toContain('Use Route 15 shuttle');
  });
});
