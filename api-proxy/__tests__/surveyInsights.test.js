const mockSummarizeSurveyFeedback = jest.fn();

jest.mock('../lib/ai/tasks/summarizeSurveyFeedback', () => ({
  summarizeSurveyFeedback: (...args) => mockSummarizeSurveyFeedback(...args),
}));

const {
  collectOpenTextResponses,
  generateSurveyInsight,
  generateAndStoreSurveyInsight,
} = require('../surveyInsights');

describe('surveyInsights', () => {
  beforeEach(() => {
    mockSummarizeSurveyFeedback.mockReset();
  });

  test('collectOpenTextResponses sanitizes emails and phone numbers', () => {
    const survey = {
      questions: [{ id: 'q1', type: 'open_text', text: 'Tell us more' }],
    };
    const responses = [{
      answers: {
        q1: {
          value: 'Email rider@example.com or call 705-555-1212.',
        },
      },
    }];

    expect(collectOpenTextResponses(survey, responses)).toEqual([{
      questionId: 'q1',
      questionText: 'Tell us more',
      text: 'Email [redacted-email] or call [redacted-phone].',
    }]);
  });

  test('generateSurveyInsight returns normalized insight when summary succeeds', async () => {
    mockSummarizeSurveyFeedback.mockResolvedValueOnce({
      ok: true,
      skipped: false,
      model: 'geva-4',
      value: {
        summary: 'Riders are frustrated by evening waits.',
        themes: [{ label: 'Evening service', count: 3 }],
        sentiment: { positive: 0, neutral: 1, negative: 2 },
        suggestedActions: ['Review evening schedules'],
      },
    });

    const result = await generateSurveyInsight({
      survey: {
        id: 'survey1',
        title: 'Spring survey',
        questions: [{ id: 'q1', type: 'open_text', text: 'Tell us more' }],
      },
      aggregates: { totalResponses: 10 },
      responses: [{ answers: { q1: { value: 'Long wait after work.' } } }],
      windowHours: 24,
    });

    expect(result.ok).toBe(true);
    expect(result.insight).toEqual(expect.objectContaining({
      surveyId: 'survey1',
      surveyTitle: 'Spring survey',
      windowHours: 24,
      responseCount: 1,
      openTextResponseCount: 1,
      model: 'geva-4',
      summary: 'Riders are frustrated by evening waits.',
      themes: [{ label: 'Evening service', count: 3 }],
      sentiment: { positive: 0, neutral: 1, negative: 2 },
      suggestedActions: ['Review evening schedules'],
      source: 'local-ai',
    }));
  });

  test('generateAndStoreSurveyInsight loads the active survey and stores the result', async () => {
    mockSummarizeSurveyFeedback.mockResolvedValueOnce({
      ok: true,
      skipped: false,
      model: 'geva-4',
      value: {
        summary: 'Riders want cleaner transfer timing.',
        themes: [{ label: 'Transfers', count: 2 }],
        sentiment: { positive: 1, neutral: 0, negative: 1 },
        suggestedActions: ['Check timed connections'],
      },
    });

    const mockSet = jest.fn().mockResolvedValue(undefined);

    const db = {
      collection: jest.fn((name) => {
        if (name === 'surveyConfig') {
          return {
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              empty: false,
              docs: [{
                id: 'survey1',
                data: () => ({
                  title: 'Spring survey',
                  questions: [{ id: 'q1', type: 'open_text', text: 'Tell us more' }],
                }),
              }],
            }),
          };
        }

        if (name === 'surveyAggregates') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({
                exists: true,
                data: () => ({ totalResponses: 4 }),
              }),
            })),
          };
        }

        if (name === 'surveyResponses') {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              docs: [{
                id: 'resp1',
                data: () => ({
                  answers: { q1: { value: 'Transfers do not line up.' } },
                }),
              }],
            }),
          };
        }

        if (name === 'surveyInsights') {
          return {
            doc: jest.fn(() => ({
              set: mockSet,
            })),
          };
        }

        throw new Error(`Unexpected collection ${name}`);
      }),
    };

    const result = await generateAndStoreSurveyInsight(db, {});

    expect(result.ok).toBe(true);
    expect(result.insight.summary).toBe('Riders want cleaner transfer timing.');
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      surveyId: 'survey1',
      summary: 'Riders want cleaner transfer timing.',
    }), { merge: true });
  });
});
