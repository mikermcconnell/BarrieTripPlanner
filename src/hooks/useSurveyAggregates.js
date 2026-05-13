import { useCallback, useState, useEffect } from 'react';
import { surveyService } from '../services/firebase/surveyService';
import { getUserFacingErrorMessage } from '../utils/userFacingErrors';

/**
 * Hook for real-time survey aggregate stats via Firestore onSnapshot.
 * Used by SurveyResultsScreen and SurveyTeaser.
 */
export function useSurveyAggregates(surveyId) {
  const [aggregates, setAggregates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!surveyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const unsubscribe = surveyService.subscribeToAggregates(
      surveyId,
      (data) => {
        setAggregates(data);
        setLoading(false);
      },
      (err) => {
        setAggregates(null);
        setError(getUserFacingErrorMessage(err, 'Could not load survey results. Please try again.'));
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [surveyId, reloadToken]);

  const retry = useCallback(() => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }, []);

  return { aggregates, loading, error, retry };
}
