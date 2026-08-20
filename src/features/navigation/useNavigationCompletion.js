import { useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SURVEY_NUDGE_STORAGE_KEY = '@barrie_transit_show_survey_nudge';

export const runNavigationCompletionSideEffects = (navigation) => {
  try {
    const { trackEvent } = require('../../services/analyticsService');
    trackEvent('navigation_completed');
  } catch {}

  try {
    const { maybeRequestReview } = require('../../services/reviewService');
    Promise.resolve(maybeRequestReview()).catch(() => {});
  } catch {}

  try {
    Promise.resolve(
      AsyncStorage.setItem(SURVEY_NUDGE_STORAGE_KEY, 'true')
    ).catch(() => {});
  } catch {}

  Alert.alert(
    'Trip Complete!',
    'You have arrived at your destination.',
    [
      {
        text: 'Done',
        onPress: () => navigation.goBack(),
      },
    ]
  );
};

export const useNavigationCompletion = (isNavigationComplete, navigation) => {
  useEffect(() => {
    if (isNavigationComplete) {
      runNavigationCompletionSideEffects(navigation);
    }
  }, [isNavigationComplete, navigation]);
};

export default useNavigationCompletion;
