global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('../components/Icon', () => 'Icon');

const MapOptionsControl = require('../components/MapOptionsControl').default;

const render = (element) => {
  let inst;
  act(() => {
    inst = create(element);
  });
  return inst;
};

const press = (node) => {
  act(() => {
    node.props.onPress();
  });
};

const textOf = (node) => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.props?.children);
};

const buttons = (root) => root.findAllByType('TouchableOpacity');
const buttonByLabel = (root, label) => root.findByProps({ accessibilityLabel: label });
const visibleText = (root) => root.findAllByType('Text').map(textOf).join(' ');

describe('MapOptionsControl', () => {
  test('keeps secondary map controls hidden behind one options entry point', () => {
    const inst = render(React.createElement(MapOptionsControl, {
      visible: true,
      isOpen: false,
      onToggleOpen: jest.fn(),
      showStops: false,
      onToggleStops: jest.fn(),
      selectedRouteCount: 2,
      onOpenRouteFilter: jest.fn(),
      canUseDetourView: true,
      mapViewMode: 'regular',
      onMapViewModeChange: jest.fn(),
      detourCount: 1,
    }));

    expect(buttonByLabel(inst.root, 'Open map options')).toBeTruthy();
    expect(visibleText(inst.root)).toContain('Map options');
    expect(visibleText(inst.root)).not.toContain('Regular');
    expect(visibleText(inst.root)).not.toContain('Show stops');
  });

  test('open panel keeps route selection out of secondary map options', () => {
    const onToggleStops = jest.fn();
    const onToggleZones = jest.fn();
    const onMapViewModeChange = jest.fn();

    const inst = render(React.createElement(MapOptionsControl, {
      visible: true,
      isOpen: true,
      onToggleOpen: jest.fn(),
      showStops: false,
      onToggleStops,
      showZones: true,
      onToggleZones,
      zoneCount: 2,
      selectedRouteCount: 2,
      canUseDetourView: true,
      mapViewMode: 'regular',
      onMapViewModeChange,
      detourCount: 1,
    }));

    press(buttonByLabel(inst.root, 'Show stops'));
    press(buttonByLabel(inst.root, 'Hide zones'));
    press(buttonByLabel(inst.root, 'Switch to detour-focused map view'));

    expect(onToggleStops).toHaveBeenCalled();
    expect(onToggleZones).toHaveBeenCalled();
    expect(onMapViewModeChange).toHaveBeenCalledWith('detour');
    expect(visibleText(inst.root)).not.toContain('Routes');
    expect(buttons(inst.root).length).toBeGreaterThanOrEqual(4);
  });
});
