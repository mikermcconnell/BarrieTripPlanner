global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('@maplibre/maplibre-react-native', () => ({
  MarkerView: 'MarkerView',
}));

const ClosedStopMarker = require('../components/ClosedStopMarker').default;

describe('ClosedStopMarker', () => {
  test('uses a native marker view so stop closures render above map line layers', () => {
    const onPress = jest.fn();
    let inst;

    act(() => {
      inst = create(React.createElement(ClosedStopMarker, {
        stop: {
          id: 'stop-932',
          code: '932',
          latitude: 44.389,
          longitude: -79.69,
        },
        onPress,
      }));
    });

    const marker = inst.root.findByType('MarkerView');
    expect(marker.props.coordinate).toEqual([-79.69, 44.389]);
    expect(marker.props.allowOverlap).toBe(true);
    const frame = inst.root.findByProps({ testID: 'closed-stop-marker-frame' });
    expect(frame.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ zIndex: expect.any(Number), elevation: expect.any(Number) }),
    ]));

    act(() => {
      inst.root.findByType('Pressable').props.onPress();
    });

    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'stop-932' }));
    expect(inst.root.findByType('Text').children).toContain('932');
  });

  test('does not render markers for stops without valid coordinates', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(ClosedStopMarker, {
        stop: { id: 'missing-location', code: '999' },
      }));
    });

    expect(inst.toJSON()).toBeNull();
  });
});
