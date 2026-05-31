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
  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders a polished map key with detection and closed stop guidance when visible', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(DetourMapLegend, { visible: true }));
    });

    const texts = inst.root.findAllByType('Text').map((node) => node.props.children);

    expect(texts).toContain('Map key');
    expect(texts).toContain('Live GPS detection');
    expect(texts).toContain('Auto-detected detours use live bus GPS.');
    expect(texts).toContain('We wait for repeated bus GPS evidence before drawing a closure, so brand-new changes may not appear right away.');
    expect(texts).toContain('Bus GPS leaves the regular route');
    expect(texts).toContain('More evidence confirms the pattern');
    expect(texts).toContain('The map shows the detour');
    expect(texts).toContain('Detour route');
    expect(texts).toContain('Buses are using this temporary path.');
    expect(texts).toContain('Road closed');
    expect(texts).toContain('Regular service is skipping this section.');
    expect(texts).toContain('Closed bus stops');
    expect(texts).toContain('These stops are not serviced during the detour.');
    expect(texts).not.toContain('Regular route still open.');
    expect(texts).not.toContain('Expand');
  });

  test('detour route swatch uses route color with green outline', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(DetourMapLegend, {
        visible: true,
        openColor: '#F48FB1',
      }));
    });

    const views = inst.root.findAllByType('View');
    const openOutline = views.find((view) => (
      view.props.style?.some?.((style) => style?.backgroundColor === '#2E7D32')
    ));
    const openLine = views.find((view) => (
      view.props.style?.some?.((style) => style?.backgroundColor === '#F48FB1')
    ));

    expect(openOutline).toBeTruthy();
    expect(openLine).toBeTruthy();
  });

  test('auto-collapses after 12 seconds and can be expanded again', () => {
    jest.useFakeTimers();

    let inst;
    act(() => {
      inst = create(React.createElement(DetourMapLegend, {
        visible: true,
        autoCollapseSignal: 1,
      }));
    });

    expect(inst.root.findAllByType('Text').map((node) => node.props.children)).toContain('Closed bus stops');

    act(() => {
      jest.advanceTimersByTime(12000);
    });

    let texts = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(texts).toContain('Key');
    expect(texts).not.toContain('Lines & stops');
    expect(texts).not.toContain('Closed bus stops');

    act(() => {
      inst.root.findByProps({ accessibilityLabel: 'Expand detour legend' }).props.onPress();
    });

    texts = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(texts).toContain('Closed bus stops');
  });

  test('can start reduced by default and still be expanded', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(DetourMapLegend, {
        visible: true,
        collapsedByDefault: true,
      }));
    });

    let texts = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(texts).toContain('Key');
    expect(texts).not.toContain('Lines & stops');
    expect(texts).not.toContain('Closed bus stops');

    act(() => {
      inst.root.findByProps({ accessibilityLabel: 'Expand detour legend' }).props.onPress();
    });

    texts = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(texts).toContain('Closed bus stops');
  });

  test('auto-hides after 12 seconds when requested', () => {
    jest.useFakeTimers();

    let inst;
    act(() => {
      inst = create(React.createElement(DetourMapLegend, {
        visible: true,
        autoCollapseSignal: 1,
        autoHide: true,
      }));
    });

    expect(inst.root.findAllByType('Text').map((node) => node.props.children)).toContain('Closed bus stops');

    act(() => {
      jest.advanceTimersByTime(12000);
    });

    expect(inst.toJSON()).toBeNull();
  });

  test('can be closed manually before the timer finishes', () => {
    jest.useFakeTimers();

    let inst;
    act(() => {
      inst = create(React.createElement(DetourMapLegend, {
        visible: true,
        autoCollapseSignal: 1,
      }));
    });

    act(() => {
      inst.root.findByProps({ accessibilityLabel: 'Close detour legend' }).props.onPress();
    });

    const texts = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(texts).toContain('Key');
    expect(texts).not.toContain('Lines & stops');
    expect(texts).not.toContain('Closed bus stops');
  });

  test('renders nothing when hidden', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(DetourMapLegend, { visible: false }));
    });

    expect(inst.toJSON()).toBeNull();
  });
});
