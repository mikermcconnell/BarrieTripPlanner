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

const { getRouteSummaryChipStyles } = require('../components/HomeScreenControls');

describe('HomeScreenControls route summary chip styles', () => {
  test('adds the startup highlight only when no routes are selected', () => {
    const styles = getRouteSummaryChipStyles({
      selectedCount: 0,
      shouldHighlightRoutesButton: true,
    });

    expect(styles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        borderColor: expect.stringContaining('12, 140, 229'),
      }),
      expect.objectContaining({
        borderColor: expect.stringContaining('76, 175, 80'),
      }),
    ]));
  });

  test('does not add the startup highlight when routes are selected', () => {
    const styles = getRouteSummaryChipStyles({
      selectedCount: 1,
      shouldHighlightRoutesButton: true,
    });

    expect(styles).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        borderColor: expect.stringContaining('76, 175, 80'),
      }),
    ]));
  });
});
