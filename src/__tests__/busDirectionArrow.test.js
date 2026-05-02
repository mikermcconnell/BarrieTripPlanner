jest.mock('react-native', () => ({
  View: 'View',
  StyleSheet: {
    create: (styles) => styles,
  },
}));

const React = require('react');
const TestRenderer = require('react-test-renderer');
const BusDirectionArrow = require('../components/BusDirectionArrow').default;

describe('BusDirectionArrow', () => {
  test('renders as a foreground rim tab rotated to the vehicle bearing', () => {
    let renderer;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(BusDirectionArrow, {
          bearing: 450,
          size: 88,
          color: '#111111',
        })
      );
    });

    const tree = renderer.toJSON();
    const layerStyle = tree.props.style;
    const flattenedLayerStyle = Object.assign({}, ...layerStyle.filter(Boolean));
    const outlineStyle = Object.assign({}, ...tree.children[0].props.style.filter(Boolean));
    const rimConnectorStyle = Object.assign({}, ...tree.children[1].props.style.filter(Boolean));
    const fillStyle = Object.assign({}, ...tree.children[2].props.style.filter(Boolean));

    expect(flattenedLayerStyle.transform).toEqual([{ rotate: '90deg' }]);
    expect(flattenedLayerStyle.zIndex).toBeGreaterThan(1);
    expect(flattenedLayerStyle.elevation).toBeGreaterThan(1);
    expect(outlineStyle.top).toBe(3);
    expect(outlineStyle.borderBottomWidth).toBe(19);
    expect(rimConnectorStyle.top).toBe(19);
    expect(rimConnectorStyle.backgroundColor).toBe('rgba(255,255,255,0.95)');
    expect(fillStyle.top).toBe(6);
    expect(fillStyle.borderBottomWidth).toBe(16);
    expect(fillStyle.borderBottomColor).toBe('#111111');
  });
});
