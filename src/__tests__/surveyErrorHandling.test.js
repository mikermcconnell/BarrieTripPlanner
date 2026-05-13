const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('../services/firebase/surveyService', () => ({
  surveyService: {
    getActiveSurvey: jest.fn(),
    checkAlreadySubmitted: jest.fn(),
    submitResponse: jest.fn(),
    subscribeToAggregates: jest.fn(),
  },
}));

const { surveyService } = require('../services/firebase/surveyService');

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('survey error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('useSurvey exposes a user-friendly load error', async () => {
    surveyService.getActiveSurvey.mockRejectedValue(new Error('FirebaseError: Missing or insufficient permissions.'));
    const { useSurvey } = require('../hooks/useSurvey');
    let hookApi;

    function Harness() {
      hookApi = useSurvey('profile');
      return null;
    }

    await act(async () => {
      create(React.createElement(Harness));
      await flush();
    });

    expect(hookApi.loading).toBe(false);
    expect(hookApi.survey).toBeNull();
    expect(hookApi.error).toBe('You do not have permission to do that. Sign in and try again.');
  });

  test('useSurveyAggregates exposes a user-friendly results error', async () => {
    surveyService.subscribeToAggregates.mockImplementation((_id, _onData, onError) => {
      onError(new TypeError('Failed to fetch'));
      return jest.fn();
    });
    const { useSurveyAggregates } = require('../hooks/useSurveyAggregates');
    let hookApi;

    function Harness() {
      hookApi = useSurveyAggregates('survey-1');
      return null;
    }

    await act(async () => {
      create(React.createElement(Harness));
      await flush();
    });

    expect(hookApi.loading).toBe(false);
    expect(hookApi.aggregates).toBeNull();
    expect(hookApi.error).toBe('Check your connection, then try again.');
  });
});
