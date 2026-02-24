import { useState, useEffect, useCallback, useRef } from 'react';
import { surveyService } from '../services/firebase/surveyService';

/**
 * Hook for survey interaction: load config, track answers, validate, submit.
 * Shared by both native and web survey screens.
 */
export function useSurvey(trigger = 'profile') {
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [error, setError] = useState(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Load active survey config + check if already submitted
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const activeSurvey = await surveyService.getActiveSurvey();
        if (cancelled) return;

        if (!activeSurvey) {
          setSurvey(null);
          setLoading(false);
          return;
        }

        setSurvey(activeSurvey);

        const hasSubmitted = await surveyService.checkAlreadySubmitted(activeSurvey.id);
        if (cancelled) return;
        setAlreadySubmitted(hasSubmitted);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const questions = survey?.questions || [];
  const currentQuestion = questions[currentIndex] || null;
  const totalQuestions = questions.length;
  const progress = totalQuestions > 0 ? (currentIndex + 1) / totalQuestions : 0;

  const setAnswer = useCallback((questionId, value) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { type: questions.find((q) => q.id === questionId)?.type, value },
    }));
  }, [questions]);

  const canGoNext = useCallback(() => {
    if (!currentQuestion) return false;
    if (!currentQuestion.required) return true;
    const answer = answers[currentQuestion.id];
    return answer && answer.value != null && answer.value !== '';
  }, [currentQuestion, answers]);

  const goNext = useCallback(() => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, totalQuestions]);

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  const isLastQuestion = currentIndex === totalQuestions - 1;

  const submit = useCallback(async () => {
    if (!survey || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      await surveyService.submitResponse({
        surveyId: survey.id,
        surveyVersion: survey.version,
        answers,
        trigger,
      });
      if (isMounted.current) {
        setSubmitted(true);
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err.message);
      }
    } finally {
      if (isMounted.current) {
        setSubmitting(false);
      }
    }
  }, [survey, answers, trigger, submitting]);

  return {
    survey,
    loading,
    answers,
    currentIndex,
    currentQuestion,
    totalQuestions,
    progress,
    setAnswer,
    canGoNext,
    goNext,
    goBack,
    isLastQuestion,
    submit,
    submitting,
    submitted,
    alreadySubmitted,
    error,
  };
}
