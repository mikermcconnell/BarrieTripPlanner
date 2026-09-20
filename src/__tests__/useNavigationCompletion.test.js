const React = require('react');
const { act, create } = require('react-test-renderer');
const fs = require('fs');
const path = require('path');

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/analyticsService', () => ({
  trackEvent: jest.fn(),
}));

jest.mock('../services/reviewService', () => ({
  maybeRequestReview: jest.fn(() => Promise.resolve(false)),
}));

const { Alert } = require('react-native');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const { trackEvent } = require('../services/analyticsService');
const { maybeRequestReview } = require('../services/reviewService');
const { useNavigationCompletion } = require('../features/navigation/useNavigationCompletion');

const CompletionHarness = ({ isComplete, navigation }) => {
  useNavigationCompletion(isComplete, navigation);
  return null;
};

describe('useNavigationCompletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.setItem.mockResolvedValue(undefined);
    maybeRequestReview.mockResolvedValue(false);
  });

  test('runs completion side effects only after navigation becomes complete', () => {
    const navigation = { goBack: jest.fn() };
    let instance;
    act(() => {
      instance = create(React.createElement(CompletionHarness, {
        isComplete: false,
        navigation,
      }));
    });

    expect(trackEvent).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();

    act(() => {
      instance.update(React.createElement(CompletionHarness, {
        isComplete: true,
        navigation,
      }));
    });

    expect(trackEvent).toHaveBeenCalledWith('navigation_completed');
    expect(maybeRequestReview).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@barrie_transit_show_survey_nudge',
      'true'
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Trip Complete!',
      'You have arrived at your destination.',
      [expect.objectContaining({ text: 'Done', onPress: expect.any(Function) })]
    );

    const doneButton = Alert.alert.mock.calls[0][2][0];
    act(() => doneButton.onPress());
    expect(navigation.goBack).toHaveBeenCalledTimes(1);

    act(() => instance.unmount());
  });

  test('still presents completion when optional analytics, review, and storage effects fail', async () => {
    const navigation = { goBack: jest.fn() };
    trackEvent.mockImplementationOnce(() => {
      throw new Error('analytics unavailable');
    });
    maybeRequestReview.mockRejectedValueOnce(new Error('review unavailable'));
    AsyncStorage.setItem.mockRejectedValueOnce(new Error('storage unavailable'));

    let instance;
    await act(async () => {
      instance = create(React.createElement(CompletionHarness, {
        isComplete: true,
        navigation,
      }));
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Trip Complete!',
      'You have arrived at your destination.',
      [expect.objectContaining({ text: 'Done' })]
    );

    act(() => instance.unmount());
  });

  test('is wired to the native navigation screen completion state', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'NavigationScreen.js'),
      'utf8'
    );

    expect(source).toContain(
      "import { useNavigationCompletion } from '../features/navigation/useNavigationCompletion';"
    );
    expect(source).toContain(
      'useNavigationCompletion(isNavigationComplete, navigation);'
    );
  });
});
