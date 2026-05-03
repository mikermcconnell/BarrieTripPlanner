const { runLocalChatCompletion } = require('./localAiClient');
const { recordAiSuccess, recordAiFailure } = require('./status');

function stripCodeFence(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractJsonString(text) {
  const cleaned = stripCodeFence(text);

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch (_err) {
    // keep searching
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return cleaned.slice(start, end + 1);
  }

  throw new Error('Local AI did not return valid JSON');
}

async function runJsonTask({
  taskName,
  messages,
  validate,
  maxTokens = 700,
  temperature = 0.1,
}) {
  const result = await runLocalChatCompletion({
    messages,
    maxTokens,
    temperature,
  });

  if (result.skipped) {
    return {
      ok: false,
      skipped: true,
      reason: result.reason,
    };
  }

  try {
    const jsonText = extractJsonString(result.content);
    const parsed = JSON.parse(jsonText);
    const value = typeof validate === 'function' ? validate(parsed) : parsed;

    recordAiSuccess(taskName);
    return {
      ok: true,
      skipped: false,
      model: result.model,
      value,
    };
  } catch (error) {
    recordAiFailure(taskName, error);
    return {
      ok: false,
      skipped: false,
      error: error.message,
    };
  }
}

module.exports = {
  runJsonTask,
  extractJsonString,
};
