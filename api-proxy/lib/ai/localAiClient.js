const { buildLocalAiConfig } = require('./config');

function getMessageContent(message) {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';

  return message.content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part.text === 'string') return part.text;
      return '';
    })
    .join('\n')
    .trim();
}

function extractCompletionContent(body) {
  const firstChoice = Array.isArray(body?.choices) ? body.choices[0] : null;
  const message = firstChoice?.message || firstChoice?.delta || null;
  return getMessageContent(message);
}

async function runLocalChatCompletion({
  messages,
  temperature = 0.1,
  maxTokens = 700,
}) {
  const config = buildLocalAiConfig();

  if (!config.enabled) {
    return { skipped: true, reason: 'LOCAL_AI_DISABLED' };
  }

  if (!config.configured) {
    return { skipped: true, reason: 'LOCAL_AI_NOT_CONFIGURED' };
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(`${config.baseUrl}${config.chatPath}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  let body = {};
  try {
    body = await response.json();
  } catch (_err) {
    body = {};
  }

  if (!response.ok) {
    const detail = body?.error?.message || body?.message || `HTTP ${response.status}`;
    throw new Error(`Local AI request failed: ${detail}`);
  }

  const content = extractCompletionContent(body);
  if (!content) {
    throw new Error('Local AI returned an empty completion');
  }

  return {
    skipped: false,
    model: body?.model || config.model,
    content,
  };
}

module.exports = {
  runLocalChatCompletion,
  extractCompletionContent,
};
