global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (styles) => styles },
}));

const DetourMapLegend = require('../components/DetourMapLegend').default;

describe('DetourMapLegend', () => {
  test('renders open and closed guidance when visible', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(DetourMapLegend, { visible: true }));
    });

    const texts = inst.root.findAllByType('Text').map((node) => node.props.children);

    expect(texts).toContain('Detour in effect');
    expect(texts).toContain('Open bus detour');
    expect(texts).toContain('Closed regular route');
    expect(texts).toContain('Regular route still open');
    expect(texts).toContain('Green shows where the bus goes now. Red dashed shows the closed part it skips.');
  });

  test('renders nothing when hidden', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(DetourMapLegend, { visible: false }));
    });

    expect(inst.toJSON()).toBeNull();
  });
});
