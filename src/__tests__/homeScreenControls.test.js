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
} = require('../components/HomeScreenControls');

describe('HomeScreenControls route chip', () => {
  test('keeps the Routes chip styling calm', () => {
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
});
