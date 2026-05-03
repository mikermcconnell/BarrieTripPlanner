global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('@maplibre/maplibre-react-native', () => ({
  ShapeSource: 'ShapeSource',
  LineLayer: 'LineLayer',
  SymbolLayer: 'SymbolLayer',
}));

const RoutePolyline = require('../components/RoutePolyline').default;

describe('RoutePolyline', () => {
  const coordinates = [
    { latitude: 44.38, longitude: -79.69 },
    { latitude: 44.39, longitude: -79.68 },
  ];

  function render(props = {}) {
    let inst;
    act(() => {
      inst = create(React.createElement(RoutePolyline, {
        id: 'route-test',
        coordinates,
        ...props,
      }));
    });
    return inst;
  }

  test('passes press handler and hitbox to the native shape source', () => {
    const onPress = jest.fn();
    const inst = render({ onPress });
    const source = inst.root.findByType('ShapeSource');

    expect(source.props.onPress).toBe(onPress);
    expect(source.props.hitbox).toEqual({ width: 32, height: 32 });
  });

  test('passes explicit layer indexes to line and symbol layers', () => {
    const inst = render({
      outlineWidth: 2,
      showArrows: true,
      routeLabel: '10',
      layerIndex: 100,
    });

    expect(inst.root.findAllByType('LineLayer').map((layer) => layer.props.layerIndex)).toEqual([
      100,
      101,
    ]);
    expect(inst.root.findAllByType('SymbolLayer').map((layer) => layer.props.layerIndex)).toEqual([
      102,
      103,
    ]);
  });
});
