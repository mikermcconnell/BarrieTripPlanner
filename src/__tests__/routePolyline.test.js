global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('@maplibre/maplibre-react-native', () => ({
  ShapeSource: 'ShapeSource',
  LineLayer: 'LineLayer',
  SymbolLayer: 'SymbolLayer',
}));

const RoutePolyline = require('../components/RoutePolyline').default;
const { ROUTE_LINE_LABEL_STYLE } = require('../config/routeLineLabels');

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

  test('keeps requested dash caps on both native line layers', () => {
    const inst = render({
      strokeWidth: 5,
      outlineWidth: 2,
      lineDashPattern: [8, 7],
      lineCap: 'butt',
    });

    const layers = inst.root.findAllByType('LineLayer');

    expect(layers[0].props.style.lineCap).toBe('butt');
    expect(layers[1].props.style.lineCap).toBe('butt');
    expect(layers[0].props.style.lineDasharray).toEqual([8 / 9, 7 / 9]);
    expect(layers[1].props.style.lineDasharray).toEqual([8 / 5, 7 / 5]);
  });

  test('renders route labels as passive inline text instead of route-colored badges', () => {
    const inst = render({
      color: '#D82710',
      routeLabel: '100',
    });

    const labelLayer = inst.root.findAllByType('SymbolLayer')
      .find((layer) => layer.props.id === 'route-test-label');

    expect(labelLayer.props.style).toEqual(
      expect.objectContaining({
        symbolPlacement: 'line',
        symbolSpacing: ROUTE_LINE_LABEL_STYLE.spacing,
        textField: '100',
        textSize: ROUTE_LINE_LABEL_STYLE.size,
        textColor: ROUTE_LINE_LABEL_STYLE.color,
        textHaloColor: ROUTE_LINE_LABEL_STYLE.haloColor,
        textHaloWidth: ROUTE_LINE_LABEL_STYLE.haloWidth,
        textOpacity: ROUTE_LINE_LABEL_STYLE.opacity,
        textOffset: ROUTE_LINE_LABEL_STYLE.offset,
      })
    );
    expect(labelLayer.props.style.textColor).not.toBe('#D82710');
  });
});
