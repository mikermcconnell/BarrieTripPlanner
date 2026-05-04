global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (styles) => styles },
}));

const TripPreviewMapLegend = require('../components/TripPreviewMapLegend').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const flattenStyle = (style) => (
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flattenStyle))
    : (style || {})
);

describe('TripPreviewMapLegend', () => {
  test('explains solid transit, solid walks, and dashed bus approach lines', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(TripPreviewMapLegend, { visible: true }));
    });

    const text = inst.root.findAllByType('Text').flatMap((node) => collectText(node)).join(' ');
    expect(text).toContain('Trip map key');
    expect(text).toContain('Solid route colour');
    expect(text).toContain('Solid blue');
    expect(text).toContain('Dashed route colour');
  });

  test('uses the active route colour for solid and dashed route samples', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(TripPreviewMapLegend, {
        visible: true,
        routeColor: '#BADA55',
      }));
    });

    const backgroundColors = inst.root
      .findAllByType('View')
      .map((node) => flattenStyle(node.props.style).backgroundColor)
      .filter(Boolean);

    expect(backgroundColors.filter((color) => color === '#BADA55')).toHaveLength(3);
    expect(backgroundColors.filter((color) => color === '#2563EB')).toHaveLength(1);
  });
});
