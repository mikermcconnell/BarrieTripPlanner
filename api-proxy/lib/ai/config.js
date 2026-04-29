function parseTimeoutMs(value, fallback = 5000) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1000) return fallback;
  return Math.min(parsed, 60000);
}

function normalizeBaseUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

function normalizePath(value, fallback = '/chat/completions') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return fallback;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function buildLocalAiConfig(env = process.env) {
  const enabled = env.LOCAL_AI_ENABLED === 'true';
  const baseUrl = normalizeBaseUrl(env.LOCAL_AI_BASE_URL);
  const model = String(env.LOCAL_AI_MODEL || '').trim();
  const chatPath = normalizePath(env.LOCAL_AI_CHAT_PATH);
  const apiKey = String(env.LOCAL_AI_API_KEY || '').trim();
  const timeoutMs = parseTimeoutMs(env.LOCAL_AI_TIMEOUT_MS, 5000);

  return {
    enabled,
    configured: Boolean(baseUrl && model),
    provider: 'local-openai-compatible',
    baseUrl,
    model,
    chatPath,
    apiKey,
    timeoutMs,
  };
}

module.exports = {
  buildLocalAiConfig,
};
