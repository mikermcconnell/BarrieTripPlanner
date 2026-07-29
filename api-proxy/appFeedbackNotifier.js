'use strict';

const DEFAULT_FROM = 'Barrie Transit App <feedback@updates.barrietransit.ca>';

function parseRecipients(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildFeedbackAlertText(feedback, feedbackId) {
  return [
    'New private app feedback was received.',
    '',
    `Category: ${feedback.category}`,
    `Platform: ${feedback.platform || 'unknown'}`,
    `App version: ${feedback.appVersion || 'unknown'}`,
    `Source: ${feedback.source || 'unknown'}`,
    `Feedback ID: ${feedbackId}`,
    '',
    'Open Developer Feedback in the app to review or resolve it.',
  ].join('\n');
}

async function sendAppFeedbackAlert(feedback, feedbackId, {
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  const recipients = parseRecipients(env.APP_FEEDBACK_ALERT_RECIPIENTS);
  if (!apiKey) return { skipped: true, reason: 'RESEND_API_KEY not configured' };
  if (recipients.length === 0) return { skipped: true, reason: 'No feedback alert recipients configured' };

  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: String(env.APP_FEEDBACK_ALERT_FROM || DEFAULT_FROM).trim(),
      to: recipients,
      subject: `New app feedback: ${feedback.category}`,
      text: buildFeedbackAlertText(feedback, feedbackId),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend feedback alert failed (${response.status})`);
  }
  return { sent: true, recipients: recipients.length };
}

module.exports = {
  buildFeedbackAlertText,
  parseRecipients,
  sendAppFeedbackAlert,
};
