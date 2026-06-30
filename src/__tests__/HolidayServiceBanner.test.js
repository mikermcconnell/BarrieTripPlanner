global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 1,
  },
}));

jest.mock('../components/Icon', () => 'Icon');

const HolidayServiceBanner = require('../components/HolidayServiceBanner').default;

describe('HolidayServiceBanner', () => {
  test('can render as a non-absolute notice row with a dismiss action', () => {
    const onPress = jest.fn();
    const onDismiss = jest.fn();
    let inst;

    act(() => {
      inst = create(React.createElement(HolidayServiceBanner, {
        holidayServiceInfo: {
          status: 'holiday_service',
          title: 'Canada Day service',
          shortMessage: 'Barrie Transit is running a holiday schedule.',
          badgeLabel: 'Holiday',
          relativeLabel: 'Tomorrow',
        },
        inline: true,
        onPress,
        onDismiss,
      }));
    });

    const dismiss = inst.root.findAllByType('TouchableOpacity').find((node) =>
      node.props.accessibilityLabel === 'Hide holiday service notice'
    );

    act(() => {
      dismiss.props.onPress({ stopPropagation: jest.fn() });
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });
});
