global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  TouchableOpacity: 'TouchableOpacity',
  Alert: { alert: jest.fn() },
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

jest.mock('../components/TripStep', () => 'TripStep');
jest.mock('../components/FareInfoPanel', () => 'FareInfoPanel');
jest.mock('../components/Icon', () => 'Icon');
jest.mock('../utils/androidNavigationBar', () => ({
  addSafeBottomPadding: (base, inset) => base + inset,
  useSafeBottomInset: () => 0,
}));
jest.mock('../services/tripService', () => ({
  formatDuration: (seconds) => `${Math.round(seconds / 60)} min`,
  formatDistance: (meters) => `${meters} m`,
  formatTimeFromTimestamp: (timestamp) => {
    const lookup = {
      0: '2:22 PM',
      480000: '2:30 PM',
      3360000: '3:18 PM',
      3840000: '3:26 PM',
    };
    return lookup[timestamp] || `${timestamp}`;
  },
}));

const TripDetailsScreen = require('../screens/TripDetailsScreen').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const renderTexts = (element) => {
  let inst;
  act(() => {
    inst = create(element);
  });
  return inst.root.findAllByType('Text').flatMap((node) => collectText(node));
};

describe('TripDetailsScreen transfer wait', () => {
  test('shows get-off time and next boarding time between bus legs', () => {
    const texts = renderTexts(React.createElement(TripDetailsScreen, {
      navigation: { goBack: jest.fn(), navigate: jest.fn() },
      route: {
        params: {
          itinerary: {
            startTime: 0,
            endTime: 3840000,
            duration: 3840,
            walkDistance: 562,
            walkTime: 420,
            transfers: 1,
            legs: [
              { mode: 'WALK', startTime: 0, endTime: 480000, duration: 480, distance: 562 },
              {
                mode: 'BUS',
                startTime: 480000,
                endTime: 3360000,
                duration: 2880,
                route: { shortName: '7B' },
                from: { name: 'Duckworth at Grove', stopCode: '255' },
                to: { name: 'Downtown Hub', stopCode: '1' },
              },
              {
                mode: 'BUS',
                startTime: 3360000,
                endTime: 3840000,
                duration: 480,
                route: { shortName: '2B' },
                from: { name: 'Downtown Hub', stopCode: '1' },
                to: { name: 'Ferndale at Barrie Operations', stopCode: '263' },
              },
            ],
          },
        },
      },
    }));

    const text = texts.join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('0 min between buses');
    expect(text).toContain('Downtown Hub (#1)');
    expect(text).toContain('Get off Route 7B at 3:18 PM');
    expect(text).toContain('Board Route 2B at 3:18 PM');
  });

  test('numbers transfer steps when a trip has two transfers', () => {
    const texts = renderTexts(React.createElement(TripDetailsScreen, {
      navigation: { goBack: jest.fn(), navigate: jest.fn() },
      route: {
        params: {
          itinerary: {
            startTime: 0,
            endTime: 3840000,
            duration: 3840,
            walkDistance: 562,
            walkTime: 420,
            transfers: 2,
            legs: [
              {
                mode: 'BUS',
                startTime: 0,
                endTime: 480000,
                duration: 480,
                route: { shortName: '7' },
                from: { name: 'Stop A', stopCode: '1' },
                to: { name: 'Stop B', stopCode: '2' },
              },
              {
                mode: 'BUS',
                startTime: 960000,
                endTime: 1440000,
                duration: 480,
                route: { shortName: '8A' },
                from: { name: 'Stop B', stopCode: '2' },
                to: { name: 'Stop C', stopCode: '3' },
              },
              {
                mode: 'BUS',
                startTime: 1920000,
                endTime: 2400000,
                duration: 480,
                route: { shortName: '2B' },
                from: { name: 'Stop C', stopCode: '3' },
                to: { name: 'Stop D', stopCode: '4' },
              },
            ],
          },
        },
      },
    }));

    const text = texts.join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('Transfer 1 of 2');
    expect(text).toContain('Transfer 2 of 2');
  });
});
