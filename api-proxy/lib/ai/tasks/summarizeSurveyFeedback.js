const { runJsonTask } = require('../runJsonTask');

const MAX_THEMES = 5;
const MAX_ACTIONS = 5;

function normalizeTextList(items, limit) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeThemes(themes) {
  if (!Array.isArray(themes)) return [];
  return themes
    .map((theme) => ({
      label: String(theme?.label || '').trim(),
      count: Number.isFinite(Number(theme?.count)) ? Number(theme.count) : 0,
    }))
    .filter((theme) => theme.label)
    .slice(0, MAX_THEMES);
}

function normalizeSentiment(sentiment) {
  const value = sentiment && typeof sentiment === 'object' ? sentiment : {};
  const toCount = (input) => {
    const parsed = Number(input);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
  };

  return {
    positive: toCount(value.positive),
    neutral: toCount(value.neutral),
    negative: toCount(value.negative),
  };
}

function validateSurveySummary(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Survey summary payload must be an object');
  }

  const summary = String(payload.summary || '').trim();
  if (!summary) {
    throw new Error('Survey summary is missing "summary"');
  }

  return {
    summary,
    themes: normalizeThemes(payload.themes),
    sentiment: normalizeSentiment(payload.sentiment),
    suggestedActions: normalizeTextList(payload.suggestedActions, MAX_ACTIONS),
  };
}

function buildSurveySummaryMessages({
  survey,
  aggregates,
  responseCount,
  openTextResponses,
}) {
  const compactPayload = {
    surveyTitle: survey?.title || 'Untitled survey',
    surveyDescription: survey?.description || '',
    totalResponsesAllTime: aggregates?.totalResponses || responseCount,
    responseCountInWindow: responseCount,
    openTextResponseCount: openTextResponses.length,
    comments: openTextResponses.map((item) => ({
      questionId: item.questionId,
      questionText: item.questionText,
      text: item.text,
    })),
  };

  return [
    {
      role: 'system',
      content: [
        'You summarize municipal transit rider feedback for staff review.',
        'Return JSON only.',
        'Do not invent facts, routes, or counts.',
        'Keep the summary concise, neutral, and decision-useful.',
        'Use this exact JSON shape:',
        '{"summary":"...","themes":[{"label":"...","count":0}],"sentiment":{"positive":0,"neutral":0,"negative":0},"suggestedActions":["..."]}',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify(compactPayload),
    },
  ];
}

async function summarizeSurveyFeedback({
  survey,
  aggregates,
  responseCount,
  openTextResponses,
}) {
  if (!Array.isArray(openTextResponses) || openTextResponses.length === 0) {
    return {
      ok: false,
      skipped: true,
      reason: 'NO_OPEN_TEXT_RESPONSES',
    };
  }

  return runJsonTask({
    taskName: 'survey-feedback-summary',
    messages: buildSurveySummaryMessages({
      survey,
      aggregates,
      responseCount,
      openTextResponses,
    }),
    validate: validateSurveySummary,
    maxTokens: 900,
    temperature: 0.1,
  });
}

module.exports = {
  summarizeSurveyFeedback,
  validateSurveySummary,
  buildSurveySummaryMessages,
};
