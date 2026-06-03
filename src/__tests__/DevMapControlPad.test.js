global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles) => styles },
}));

const DevMapControlPad = require('../components/DevMapControlPad').default;

describe('DevMapControlPad', () => {
  test('routes emulator map controls to pan, zoom, and detour focus callbacks', () => {
    const onPan = jest.fn();
    const onZoom = jest.fn();
    const onFocusActiveDetours = jest.fn();
    let inst;

    act(() => {
      inst = create(React.createElement(DevMapControlPad, {
        onPan,
        onZoom,
        onFocusActiveDetours,
        hasActiveDetours: true,
      }));
    });

    const buttonsByLabel = Object.fromEntries(
      inst.root.findAllByType('TouchableOpacity').map((button) => [
        button.props.accessibilityLabel,
        button,
      ])
    );

    act(() => buttonsByLabel['Pan map north'].props.onPress());
    act(() => buttonsByLabel['Pan map west'].props.onPress());
    act(() => buttonsByLabel['Pan map east'].props.onPress());
    act(() => buttonsByLabel['Pan map south'].props.onPress());
    act(() => buttonsByLabel['Zoom map out'].props.onPress());
    act(() => buttonsByLabel['Zoom map in'].props.onPress());
    act(() => buttonsByLabel['Focus all active detours'].props.onPress());

    expect(onPan).toHaveBeenNthCalledWith(1, 'north');
    expect(onPan).toHaveBeenNthCalledWith(2, 'west');
    expect(onPan).toHaveBeenNthCalledWith(3, 'east');
    expect(onPan).toHaveBeenNthCalledWith(4, 'south');
    expect(onZoom).toHaveBeenNthCalledWith(1, -1);
    expect(onZoom).toHaveBeenNthCalledWith(2, 1);
    expect(onFocusActiveDetours).toHaveBeenCalledTimes(1);
  });

  test('disables detour focus controls when there are no active detours', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(DevMapControlPad, {
        hasActiveDetours: false,
      }));
    });

    const detourButtons = inst.root
      .findAllByType('TouchableOpacity')
      .filter((button) => button.props.accessibilityLabel?.includes('detour'));

    expect(detourButtons).toHaveLength(2);
    expect(detourButtons.every((button) => button.props.disabled === true)).toBe(true);
  });
});
