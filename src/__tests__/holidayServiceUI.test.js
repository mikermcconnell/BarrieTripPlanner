global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  Modal: 'Modal',
  ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('../components/Icon', () => 'Icon');
jest.mock('../components/TimePicker', () => 'TimePicker');
jest.mock('../components/AddressAutocomplete', () => 'AddressAutocomplete');
jest.mock('../components/TripPlanningLoadingDots', () => 'TripPlanningLoadingDots');

const TripSearchHeader = require('../components/TripSearchHeader').default;
const HolidayServiceBanner = require('../components/HolidayServiceBanner').default;
const HolidayServiceDetailsSheet = require('../components/HolidayServiceDetailsSheet').default;

const holidayInfo = {
  title: 'Canada Day service',
  badgeLabel: 'Holiday service',
  shortMessage: 'Holiday service is scheduled for Wednesday, July 1.',
  detailsMessage: 'Barrie Transit is running 2 routes on this holiday schedule.',
  status: 'holiday_service',
  routes: [
    {
      routeId: '2A',
      routeShortName: '2A',
      routeLongName: 'Dunlop',
      firstTripLabel: '8:00 AM',
      lastTripLabel: '9:02 AM',
    },
  ],
};

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const collectRenderedText = (root) => root
  .findAllByType('Text')
  .flatMap((node) => collectText(node))
  .join(' ');

describe('holiday service UI', () => {
  test('TripSearchHeader shows the selected-date holiday service badge', () => {
    let instance;
    act(() => {
      instance = create(React.createElement(TripSearchHeader, {
        fromText: '',
        toText: '',
        onFromChange: jest.fn(),
        onToChange: jest.fn(),
        onFromSelect: jest.fn(),
        onToSelect: jest.fn(),
        onSwap: jest.fn(),
        onClose: jest.fn(),
        timeMode: 'departAt',
        selectedTime: new Date('2026-07-01T09:00:00-04:00'),
        holidayServiceInfo: holidayInfo,
      }));
    });

    const text = collectRenderedText(instance.root);
    expect(text).toContain('Holiday service');
    expect(text).toContain('Canada Day service');
  });

  test('compact TripSearchHeader keeps the holiday service badge visible after planning', () => {
    let instance;
    act(() => {
      instance = create(React.createElement(TripSearchHeader, {
        compact: true,
        fromText: 'Start',
        toText: 'Destination',
        onFromChange: jest.fn(),
        onToChange: jest.fn(),
        onFromSelect: jest.fn(),
        onToSelect: jest.fn(),
        onSwap: jest.fn(),
        onClose: jest.fn(),
        timeMode: 'departAt',
        selectedTime: new Date('2026-07-01T09:00:00-04:00'),
        holidayServiceInfo: holidayInfo,
      }));
    });

    const text = collectRenderedText(instance.root);
    expect(text).toContain('Holiday service');
  });

  test('home banner summarizes holiday service and opens details', () => {
    const onPress = jest.fn();
    let instance;
    act(() => {
      instance = create(React.createElement(HolidayServiceBanner, {
        holidayServiceInfo: holidayInfo,
        onPress,
      }));
    });

    const text = collectRenderedText(instance.root);
    expect(text).toContain('Canada Day service');
    expect(text).toContain('Holiday service is scheduled');

    const button = instance.root.findByType('TouchableOpacity');
    act(() => button.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('details sheet lists active holiday routes and first or last trips', () => {
    let instance;
    act(() => {
      instance = create(React.createElement(HolidayServiceDetailsSheet, {
        visible: true,
        holidayServiceInfo: holidayInfo,
        onClose: jest.fn(),
      }));
    });

    const text = collectRenderedText(instance.root);
    expect(text).toContain('Canada Day service');
    expect(text).toContain('Route');
    expect(text).toContain('2A');
    expect(text).toContain('8:00 AM');
    expect(text).toContain('9:02 AM');
  });
});
