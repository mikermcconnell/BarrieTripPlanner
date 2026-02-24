/**
 * Survey Aggregator — Pure functions for incremental aggregate updates.
 *
 * Called by surveyRoutes.js on each submission to update surveyAggregates/{surveyId}
 * without Firestore transactions (acceptable at Barrie Transit scale).
 */

/**
 * Update aggregate stats with a new survey response.
 *
 * @param {Object|null} current - Current surveyAggregates document (null if first response)
 * @param {Object} response - The new surveyResponse document
 * @param {Object[]} questions - The survey config questions array (for type reference)
 * @returns {Object} Updated aggregates document (ready to write to Firestore)
 */
function updateAggregates(current, response, questions) {
  const base = current || { totalResponses: 0, questionStats: {} };
  const totalResponses = base.totalResponses + 1;
  const questionStats = { ...base.questionStats };

  const questionMap = new Map(questions.map((q) => [q.id, q]));

  for (const [questionId, answer] of Object.entries(response.answers || {})) {
    const question = questionMap.get(questionId);
    if (!question) continue;

    const existing = questionStats[questionId] || buildEmptyStats(question);
    questionStats[questionId] = applyAnswer(existing, question, answer);
  }

  return {
    totalResponses,
    questionStats,
    lastUpdatedAt: Date.now(),
  };
}

function buildEmptyStats(question) {
  switch (question.type) {
    case 'star_rating':
      return { type: 'star_rating', average: 0, distribution: {}, count: 0 };
    case 'single_select':
      return { type: 'single_select', distribution: {}, count: 0 };
    case 'open_text':
      return { type: 'open_text', count: 0 };
    default:
      return { type: question.type, count: 0 };
  }
}

function applyAnswer(stats, question, answer) {
  const updated = { ...stats };

  switch (question.type) {
    case 'star_rating': {
      const value = Number(answer.value);
      if (!Number.isFinite(value) || value < 1 || value > (question.maxStars || 5)) break;
      const prevTotal = updated.average * updated.count;
      updated.count += 1;
      updated.average = (prevTotal + value) / updated.count;
      // Round to 2 decimal places to avoid floating point drift
      updated.average = Math.round(updated.average * 100) / 100;
      const dist = { ...updated.distribution };
      dist[String(value)] = (dist[String(value)] || 0) + 1;
      updated.distribution = dist;
      break;
    }
    case 'single_select': {
      const choice = String(answer.value || '').trim();
      if (!choice) break;
      updated.count += 1;
      const dist = { ...updated.distribution };
      dist[choice] = (dist[choice] || 0) + 1;
      updated.distribution = dist;
      break;
    }
    case 'open_text': {
      if (answer.value && String(answer.value).trim()) {
        updated.count += 1;
      }
      break;
    }
    default:
      break;
  }

  return updated;
}

module.exports = { updateAggregates, buildEmptyStats, applyAnswer };
