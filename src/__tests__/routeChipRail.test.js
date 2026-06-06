global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

const RouteChipRail = require('../components/RouteChipRail').default;

const render = (element) => {
  let inst;
  act(() => {
    inst = create(element);
  });
  return inst;
};

const pressByLabel = (root, label) => {
  const node = root.findByProps({ accessibilityLabel: label });
  act(() => {
    node.props.onPress();
  });
};

describe('RouteChipRail', () => {
  test('renders route-family chips and selects the whole family directly', () => {
    const onRouteSelect = jest.fn();
    const onRouteFamilySelect = jest.fn();
    const inst = render(React.createElement(RouteChipRail, {
      routes: [
        { id: '12', shortName: '12' },
        { id: '12A', shortName: '12A' },
        { id: '12B', shortName: '12B' },
        { id: '8A', shortName: '8A' },
        { id: '8B', shortName: '8B' },
      ],
      selectedRoutes: new Set(['12A']),
      onRouteSelect,
      onRouteFamilySelect,
      getRouteColor: (routeId) => (routeId === '12A' ? '#f48fb1' : '#34495e'),
      isRouteDetouring: (routeId) => routeId === '12A',
    }));

    const textValues = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(textValues).toContain('All');
    expect(textValues).toContain('12');
    expect(textValues).toContain('8');
    expect(textValues).not.toContain('12A');
    expect(textValues).not.toContain('12B');

    pressByLabel(inst.root, 'Show route family 12 on map');
    pressByLabel(inst.root, 'Show all routes');

    expect(onRouteFamilySelect).toHaveBeenCalledWith(['12', '12A', '12B']);
    expect(onRouteSelect).toHaveBeenCalledWith(null);
  });

  test('shows a right-edge fade and leaves a clipped-chip peek for horizontal scrolling', () => {
    const inst = render(React.createElement(RouteChipRail, {
      routes: [
        { id: '1', shortName: '1' },
        { id: '2', shortName: '2' },
        { id: '3', shortName: '3' },
      ],
      selectedRoutes: new Set(),
    }));

    const fade = inst.root.findByProps({ testID: 'route-chip-rail-scroll-fade' });
    expect(fade.props.pointerEvents).toBe('none');
    expect(fade.props.colors).toEqual(['rgba(255,255,255,0)', 'rgba(255,255,255,0.96)']);

    const scrollView = inst.root.findByType('ScrollView');
    expect(scrollView.props.contentContainerStyle).toEqual(
      expect.objectContaining({ paddingRight: 28 })
    );
  });
});
