const { summarizeSurveyFeedback } = require('./lib/ai/tasks/summarizeSurveyFeedback');

const CONFIG_COLLECTION = 'surveyConfig';
const RESPONSES_COLLECTION = 'surveyResponses';
const AGGREGATES_COLLECTION = 'surveyAggregates';
const INSIGHTS_COLLECTION = 'surveyInsights';

function sanitizeComment(value) {
  return String(value || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g, '[redacted-phone]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

async function loadSurveyConfig(db, surveyId) {
  if (surveyId) {
    const doc = await db.collection(CONFIG_COLLECTION).doc(surveyId).get();
    if (!doc.exists) {
      throw new Error('Survey not found');
    }
    return { id: doc.id, ...doc.data() };
  }

  const snapshot = await db
    .collection(CONFIG_COLLECTION)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function loadAggregates(db, surveyId) {
  const doc = await db.collection(AGGREGATES_COLLECTION).doc(surveyId).get();
  return doc.exists ? doc.data() : null;
}

async function loadRecentResponses(db, surveyId, { windowHours = 24, limit = 200 } = {}) {
  const since = Date.now() - windowHours * 60 * 60 * 1000;
  const snapshot = await db
    .collection(RESPONSES_COLLECTION)
    .where('surveyId', '==', surveyId)
    .where('submittedAt', '>=', since)
    .orderBy('submittedAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function collectOpenTextResponses(survey, responses) {
  const questionMap = new Map((survey?.questions || []).map((question) => [question.id, question]));
  const openTextQuestionIds = (survey?.questions || [])
    .filter((question) => question.type === 'open_text')
    .map((question) => question.id);

  const items = [];
  for (const response of responses || []) {
    for (const questionId of openTextQuestionIds) {
      const rawValue = response?.answers?.[questionId]?.value;
      const text = sanitizeComment(rawValue);
      if (!text) continue;

      items.push({
        questionId,
        questionText: questionMap.get(questionId)?.text || questionId,
        text,
      });
    }
  }

  return items;
}

async function storeSurveyInsight(db, insight) {
  await db.collection(INSIGHTS_COLLECTION).doc(insight.surveyId).set(insight, { merge: true });
  return insight;
}

async function getSurveyInsights(db, surveyId) {
  const doc = await db.collection(INSIGHTS_COLLECTION).doc(surveyId).get();
  return doc.exists ? doc.data() : null;
}

function buildSurveyInsightHtml(insight) {
  if (!insight) return '';

  const themesHtml = Array.isArray(insight.themes) && insight.themes.length > 0
    ? `
      <h4 style="margin:16px 0 8px;color:#172B4D;">Top themes</h4>
      <ul style="color:#505F79;line-height:1.6;">
        ${insight.themes.map((theme) => `<li>${escapeHtml(theme.label)}${theme.count > 0 ? ` (${theme.count})` : ''}</li>`).join('')}
      </ul>`
    : '';

  const actionsHtml = Array.isArray(insight.suggestedActions) && insight.suggestedActions.length > 0
    ? `
      <h4 style="margin:16px 0 8px;color:#172B4D;">Suggested follow-up</h4>
      <ul style="color:#505F79;line-height:1.6;">
        ${insight.suggestedActions.map((action) => `<li>${escapeHtml(action)}</li>`).join('')}
      </ul>`
    : '';

  const sentiment = insight.sentiment || {};

  return `
    <div style="background:#F4F8FF;border:1px solid #D6E4FF;border-radius:8px;padding:16px;margin-top:24px;">
      <h3 style="color:#172B4D;margin:0 0 8px;">AI Summary</h3>
      <p style="color:#253858;line-height:1.6;margin:0 0 12px;">${escapeHtml(insight.summary)}</p>
      <p style="color:#6B778C;font-size:13px;margin:0 0 12px;">
        Sentiment split — Positive: ${sentiment.positive || 0}, Neutral: ${sentiment.neutral || 0}, Negative: ${sentiment.negative || 0}
      </p>
      ${themesHtml}
      ${actionsHtml}
    </div>
  `;
}

async function generateSurveyInsight({
  survey,
  aggregates,
  responses,
  windowHours = 24,
}) {
  const openTextResponses = collectOpenTextResponses(survey, responses);
  const summary = await summarizeSurveyFeedback({
    survey,
    aggregates,
    responseCount: Array.isArray(responses) ? responses.length : 0,
    openTextResponses,
  });

  if (!summary.ok) {
    return summary;
  }

  return {
    ok: true,
    skipped: false,
    insight: {
      surveyId: survey.id,
      surveyTitle: survey.title || '',
      generatedAt: Date.now(),
      windowHours,
      responseCount: Array.isArray(responses) ? responses.length : 0,
      openTextResponseCount: openTextResponses.length,
      model: summary.model || null,
      summary: summary.value.summary,
      themes: summary.value.themes,
      sentiment: summary.value.sentiment,
      suggestedActions: summary.value.suggestedActions,
      source: 'local-ai',
    },
  };
}

async function generateAndStoreSurveyInsight(db, {
  surveyId = '',
  windowHours = 24,
  limit = 200,
} = {}) {
  const survey = await loadSurveyConfig(db, surveyId || null);
  if (!survey) {
    return {
      ok: false,
      skipped: true,
      reason: 'NO_ACTIVE_SURVEY',
    };
  }

  const [aggregates, responses] = await Promise.all([
    loadAggregates(db, survey.id),
    loadRecentResponses(db, survey.id, { windowHours, limit }),
  ]);

  const result = await generateSurveyInsight({
    survey,
    aggregates,
    responses,
    windowHours,
  });

  if (!result.ok) {
    return result;
  }

  await storeSurveyInsight(db, result.insight);
  return result;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  INSIGHTS_COLLECTION,
  sanitizeComment,
  sanitizeSurveyComment: sanitizeComment,
  collectOpenTextResponses,
  getSurveyInsights,
  loadSurveyConfig,
  loadAggregates,
  loadRecentResponses,
  getSurveyInsights,
  generateSurveyInsight,
  generateAndStoreSurveyInsight,
  generateAndStoreSurveyInsights: generateAndStoreSurveyInsight,
  buildSurveyInsightHtml,
};
