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

  test('renders a small detour legend with closed stop guidance when visible', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(DetourMapLegend, { visible: true }));
    });

    const texts = inst.root.findAllByType('Text').map((node) => node.props.children);

    expect(texts).toContain('Detour legend');
    expect(texts).toContain('Detour route');
    expect(texts).toContain('Buses are using this temporary path.');
    expect(texts).toContain('Road closed');
    expect(texts).toContain('Regular service is skipping this section.');
    expect(texts).toContain('Closed bus stops');
    expect(texts).toContain('These stops are not serviced during the detour.');
    expect(texts).not.toContain('Regular route still open.');
    expect(texts).not.toContain('Expand');
  });

  test('auto-collapses after 8 seconds and can be expanded again', () => {
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
      jest.advanceTimersByTime(8000);
    });

    let texts = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(texts).toContain('Detour legend');
    expect(texts).toContain('Expand');
    expect(texts).not.toContain('Closed bus stops');

    act(() => {
      inst.root.findByProps({ accessibilityLabel: 'Expand detour legend' }).props.onPress();
    });

    texts = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(texts).toContain('Closed bus stops');
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
    expect(texts).toContain('Expand');
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
