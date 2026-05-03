jest.mock('react-native', () => ({
  Animated: {
    Value: jest.fn(),
  },
  Platform: { OS: 'ios' },
  ScrollView: 'ScrollView',
  StyleSheet: {
    create: (styles) => styles,
  },
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
}));

jest.mock('expo-constants', () => ({
  statusBarHeight: 0,
}));

jest.mock('../components/Icon', () => 'Icon');

const {
  getRouteSummaryChipStyles,
  shouldShowRoutesTooltip,
} = require('../components/HomeScreenControls');

describe('HomeScreenControls route options hint', () => {
  test('keeps the Routes chip styling calm when the startup hint is enabled', () => {
    const styles = getRouteSummaryChipStyles({
      selectedCount: 0,
    });

    expect(styles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        borderColor: expect.stringContaining('12, 140, 229'),
      }),
    ]));
    expect(styles).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        borderColor: expect.stringContaining('76, 175, 80'),
      }),
    ]));
  });

  test('shows the one-time tooltip only when no routes are selected', () => {
    expect(shouldShowRoutesTooltip({
      selectedCount: 0,
      showRoutesHint: true,
      enableRoutesHint: true,
    })).toBe(true);

    expect(shouldShowRoutesTooltip({
      selectedCount: 1,
      showRoutesHint: true,
      enableRoutesHint: true,
    })).toBe(false);

    expect(shouldShowRoutesTooltip({
      selectedCount: 0,
      showRoutesHint: true,
      enableRoutesHint: false,
    })).toBe(false);
  });
});
