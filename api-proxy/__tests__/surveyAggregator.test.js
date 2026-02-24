const { updateAggregates, buildEmptyStats, applyAnswer } = require('../surveyAggregator');

describe('surveyAggregator', () => {
  const questions = [
    { id: 'q1', type: 'star_rating', text: 'Overall?', required: true, maxStars: 5 },
    { id: 'q2', type: 'single_select', text: 'Frequency?', required: true, options: ['Daily', 'Weekly'] },
    { id: 'q3', type: 'open_text', text: 'Improve?', required: false },
  ];

  describe('buildEmptyStats', () => {
    test('creates empty star_rating stats', () => {
      const stats = buildEmptyStats({ type: 'star_rating' });
      expect(stats).toEqual({ type: 'star_rating', average: 0, distribution: {}, count: 0 });
    });

    test('creates empty single_select stats', () => {
      const stats = buildEmptyStats({ type: 'single_select' });
      expect(stats).toEqual({ type: 'single_select', distribution: {}, count: 0 });
    });

    test('creates empty open_text stats', () => {
      const stats = buildEmptyStats({ type: 'open_text' });
      expect(stats).toEqual({ type: 'open_text', count: 0 });
    });
  });

  describe('updateAggregates', () => {
    test('initializes aggregates from first response', () => {
      const response = {
        answers: {
          q1: { type: 'star_rating', value: 4 },
          q2: { type: 'single_select', value: 'Daily' },
          q3: { type: 'open_text', value: 'More buses' },
        },
      };

      const result = updateAggregates(null, response, questions);

      expect(result.totalResponses).toBe(1);
      expect(result.questionStats.q1.average).toBe(4);
      expect(result.questionStats.q1.distribution).toEqual({ '4': 1 });
      expect(result.questionStats.q1.count).toBe(1);
      expect(result.questionStats.q2.distribution).toEqual({ 'Daily': 1 });
      expect(result.questionStats.q2.count).toBe(1);
      expect(result.questionStats.q3.count).toBe(1);
      expect(result.lastUpdatedAt).toBeDefined();
    });

    test('increments existing aggregates', () => {
      const existing = {
        totalResponses: 1,
        questionStats: {
          q1: { type: 'star_rating', average: 4, distribution: { '4': 1 }, count: 1 },
          q2: { type: 'single_select', distribution: { 'Daily': 1 }, count: 1 },
          q3: { type: 'open_text', count: 1 },
        },
      };

      const response = {
        answers: {
          q1: { type: 'star_rating', value: 2 },
          q2: { type: 'single_select', value: 'Weekly' },
          q3: { type: 'open_text', value: '' },
        },
      };

      const result = updateAggregates(existing, response, questions);

      expect(result.totalResponses).toBe(2);
      expect(result.questionStats.q1.average).toBe(3);
      expect(result.questionStats.q1.distribution).toEqual({ '4': 1, '2': 1 });
      expect(result.questionStats.q1.count).toBe(2);
      expect(result.questionStats.q2.distribution).toEqual({ 'Daily': 1, 'Weekly': 1 });
      expect(result.questionStats.q2.count).toBe(2);
      // Empty open text should not increment count
      expect(result.questionStats.q3.count).toBe(1);
    });

    test('handles multiple ratings for accurate average', () => {
      let agg = null;
      const ratings = [5, 3, 4, 2, 5];

      for (const value of ratings) {
        const response = { answers: { q1: { type: 'star_rating', value } } };
        agg = updateAggregates(agg, response, questions);
      }

      expect(agg.totalResponses).toBe(5);
      expect(agg.questionStats.q1.average).toBe(3.8);
      expect(agg.questionStats.q1.count).toBe(5);
      expect(agg.questionStats.q1.distribution).toEqual({ '5': 2, '3': 1, '4': 1, '2': 1 });
    });

    test('ignores unknown question IDs', () => {
      const response = {
        answers: { unknown_q: { type: 'star_rating', value: 5 } },
      };

      const result = updateAggregates(null, response, questions);
      expect(result.totalResponses).toBe(1);
      expect(result.questionStats.unknown_q).toBeUndefined();
    });

    test('ignores invalid star rating values', () => {
      const response = {
        answers: { q1: { type: 'star_rating', value: 99 } },
      };

      const result = updateAggregates(null, response, questions);
      expect(result.questionStats.q1.count).toBe(0);
      expect(result.questionStats.q1.average).toBe(0);
    });

    test('ignores empty single_select values', () => {
      const response = {
        answers: { q2: { type: 'single_select', value: '' } },
      };

      const result = updateAggregates(null, response, questions);
      expect(result.questionStats.q2.count).toBe(0);
    });
  });

  describe('applyAnswer', () => {
    test('handles star_rating correctly', () => {
      const stats = { type: 'star_rating', average: 4, distribution: { '4': 2 }, count: 2 };
      const question = { type: 'star_rating', maxStars: 5 };
      const answer = { value: 1 };

      const result = applyAnswer(stats, question, answer);
      expect(result.count).toBe(3);
      expect(result.average).toBe(3);
      expect(result.distribution).toEqual({ '4': 2, '1': 1 });
    });

    test('handles single_select correctly', () => {
      const stats = { type: 'single_select', distribution: { 'Daily': 3 }, count: 3 };
      const question = { type: 'single_select' };
      const answer = { value: 'Daily' };

      const result = applyAnswer(stats, question, answer);
      expect(result.count).toBe(4);
      expect(result.distribution).toEqual({ 'Daily': 4 });
    });
  });
});
