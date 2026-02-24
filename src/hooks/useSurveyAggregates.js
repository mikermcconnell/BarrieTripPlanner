import { useState, useEffect } from 'react';
import { surveyService } from '../services/firebase/surveyService';

/**
 * Hook for real-time survey aggregate stats via Firestore onSnapshot.
 * Used by SurveyResultsScreen and SurveyTeaser.
 */
export function useSurveyAggregates(surveyId) {
  const [aggregates, setAggregates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!surveyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = surveyService.subscribeToAggregates(
      surveyId,
      (data) => {
        setAggregates(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [surveyId]);

  return { aggregates, loading, error };
}
