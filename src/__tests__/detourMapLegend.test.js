global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles) => styles },
}));

const DetourMapLegend = require('../components/DetourMapLegend').default;

describe('DetourMapLegend', () => {
  test('renders a compact legend when visible', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(DetourMapLegend, { visible: true }));
    });

    const texts = inst.root.findAllByType('Text').map((node) => node.props.children);

    expect(texts).toContain('Detour legend');
    expect(texts).toContain('Expand');
    expect(texts).toContain('Likely path buses are using.');
    expect(texts).toContain('Closed regular route section.');
    expect(texts).toContain('Regular route still open.');
    expect(texts).not.toContain('Likely detour path');
  });

  test('expands and minimizes the full legend guidance', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(DetourMapLegend, { visible: true }));
    });

    act(() => {
      inst.root.findByProps({ accessibilityLabel: 'Expand detour legend' }).props.onPress();
    });

    let texts = inst.root.findAllByType('Text').map((node) => node.props.children);

    expect(texts).toContain('Detour in effect');
    expect(texts).toContain('Likely detour path');
    expect(texts).toContain('Closed regular route');
    expect(texts).toContain('Regular route still open');
    expect(texts).toContain('Route colour with orange outline shows the likely detour path. Red dashed shows the closed part it skips.');
    expect(texts).toContain('Minimize');

    act(() => {
      inst.root.findByProps({ accessibilityLabel: 'Minimize detour legend' }).props.onPress();
    });

    texts = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(texts).toContain('Detour legend');
    expect(texts).not.toContain('Likely detour path');
  });

  test('renders nothing when hidden', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(DetourMapLegend, { visible: false }));
    });

    expect(inst.toJSON()).toBeNull();
  });
});
