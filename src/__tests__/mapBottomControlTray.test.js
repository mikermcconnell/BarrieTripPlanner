global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act, create } = require('react-test-renderer');

jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles) => styles },
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Circle: 'Circle',
  Path: 'Path',
}));

jest.mock('../components/RouteChipRail', () => 'RouteChipRail');

const MapBottomControlTray = require('../components/home-map/MapBottomControlTray').default;

const renderTray = (props = {}) => {
  let instance;
  act(() => {
    instance = create(React.createElement(MapBottomControlTray, {
      routes: [],
      selectedRoutes: new Set(),
      onRouteSelect: jest.fn(),
      onRouteFamilySelect: jest.fn(),
      getRouteColor: jest.fn(),
      isRouteDetouring: jest.fn(),
      onCenterOnLocation: jest.fn(),
      ...props,
    }));
  });
  return instance;
};

describe('MapBottomControlTray bus stops control', () => {
  test('shows a main-map button that turns bus stops on', () => {
    const onToggleStops = jest.fn();
    const instance = renderTray({ showStops: false, onToggleStops });
    const button = instance.root.findByProps({ accessibilityLabel: 'Show bus stops' });

    expect(button.props.accessibilityState).toEqual({ selected: false });
    expect(instance.root.findAllByType('Text').map((node) => node.props.children)).toContain('Stops');

    act(() => button.props.onPress());
    expect(onToggleStops).toHaveBeenCalledTimes(1);
  });

  test('exposes the same button as selected when bus stops are visible', () => {
    const instance = renderTray({ showStops: true, onToggleStops: jest.fn() });
    const button = instance.root.findByProps({ accessibilityLabel: 'Hide bus stops' });

    expect(button.props.accessibilityState).toEqual({ selected: true });
  });
});
