/**
 * Survey Digest — Builds and sends daily email digest of survey responses.
 *
 * Pure function: called by the /api/survey/send-digest endpoint (cron-triggered).
 * Uses Resend API for email delivery.
 *
 * Environment variables:
 *   RESEND_API_KEY           — Required. Resend API key.
 *   SURVEY_DIGEST_RECIPIENTS — Required. Comma-separated email addresses.
 */

const CONFIG_COLLECTION = 'surveyConfig';
const RESPONSES_COLLECTION = 'surveyResponses';
const AGGREGATES_COLLECTION = 'surveyAggregates';

const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const DIGEST_RECIPIENTS = (process.env.SURVEY_DIGEST_RECIPIENTS || '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

/**
 * Generate and send the daily survey digest email.
 * Queries the last 24 hours of responses.
 */
async function generateAndSendDigest(db) {
  if (!RESEND_API_KEY) {
    return { skipped: true, reason: 'RESEND_API_KEY not configured' };
  }
  if (DIGEST_RECIPIENTS.length === 0) {
    return { skipped: true, reason: 'No recipients configured' };
  }

  // Find active survey
  const configSnapshot = await db
    .collection(CONFIG_COLLECTION)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (configSnapshot.empty) {
    return { skipped: true, reason: 'No active survey' };
  }

  const surveyDoc = configSnapshot.docs[0];
  const survey = { id: surveyDoc.id, ...surveyDoc.data() };

  // Get aggregates
  const aggDoc = await db.collection(AGGREGATES_COLLECTION).doc(survey.id).get();
  const aggregates = aggDoc.exists ? aggDoc.data() : null;

  // Get responses from last 24 hours
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const recentSnapshot = await db
    .collection(RESPONSES_COLLECTION)
    .where('surveyId', '==', survey.id)
    .where('submittedAt', '>=', since)
    .orderBy('submittedAt', 'desc')
    .limit(200)
    .get();

  const recentCount = recentSnapshot.size;
  const recentResponses = recentSnapshot.docs.map((d) => d.data());

  // Build email HTML
  const html = buildDigestHtml(survey, aggregates, recentCount, recentResponses);

  // Send via Resend
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Barrie Transit Surveys <surveys@updates.barrietransit.ca>',
      to: DIGEST_RECIPIENTS,
      subject: `Survey Digest — ${recentCount} new response${recentCount !== 1 ? 's' : ''} (${new Date().toLocaleDateString('en-CA')})`,
      html,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Resend API error: ${response.status} ${errText}`);
  }

  return {
    sent: true,
    recipients: DIGEST_RECIPIENTS.length,
    recentResponses: recentCount,
    totalResponses: aggregates?.totalResponses || 0,
  };
}

/**
 * Build the digest email HTML.
 */
function buildDigestHtml(survey, aggregates, recentCount, recentResponses) {
  const totalResponses = aggregates?.totalResponses || 0;
  const stats = aggregates?.questionStats || {};
  const questions = survey.questions || [];
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  let statsHtml = '';
  for (const [qId, qStats] of Object.entries(stats)) {
    const question = questionMap.get(qId);
    const label = question?.text || qId;

    if (qStats.type === 'star_rating') {
      statsHtml += `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;"><strong>${label}</strong></td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${qStats.average}/5 (${'★'.repeat(Math.round(qStats.average))}${'☆'.repeat(5 - Math.round(qStats.average))})</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${qStats.count} ratings</td>
        </tr>`;
    } else if (qStats.type === 'single_select') {
      const top = Object.entries(qStats.distribution || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([opt, cnt]) => `${opt}: ${Math.round((cnt / (qStats.count || 1)) * 100)}%`)
        .join(', ');
      statsHtml += `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;"><strong>${label}</strong></td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${top}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${qStats.count} responses</td>
        </tr>`;
    } else if (qStats.type === 'open_text') {
      statsHtml += `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;"><strong>${label}</strong></td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${qStats.count} written responses</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">—</td>
        </tr>`;
    }
  }

  // Recent open text feedback
  let recentFeedbackHtml = '';
  const openTextQuestions = questions.filter((q) => q.type === 'open_text').map((q) => q.id);
  const recentTexts = [];
  for (const resp of recentResponses) {
    for (const qId of openTextQuestions) {
      const val = resp.answers?.[qId]?.value;
      if (val && String(val).trim()) {
        recentTexts.push(String(val).trim().slice(0, 200));
      }
    }
  }
  if (recentTexts.length > 0) {
    recentFeedbackHtml = `
      <h3 style="color:#172B4D;margin-top:24px;">Recent Written Feedback</h3>
      <ul style="color:#505F79;line-height:1.6;">
        ${recentTexts.slice(0, 10).map((t) => `<li>${escapeHtml(t)}</li>`).join('')}
      </ul>`;
  }

  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#172B4D;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#4CAF50;">${escapeHtml(survey.title)} — Daily Digest</h2>
      <p style="color:#6B778C;">${new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <div style="background:#E8F5E9;border-radius:8px;padding:16px;margin:16px 0;">
        <strong style="font-size:24px;color:#388E3C;">${recentCount}</strong>
        <span style="color:#388E3C;"> new response${recentCount !== 1 ? 's' : ''} in the last 24 hours</span>
        <br/>
        <span style="color:#6B778C;font-size:14px;">${totalResponses} total responses all time</span>
      </div>

      <h3 style="color:#172B4D;">Overall Stats</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#F4F5F7;">
            <th style="text-align:left;padding:8px 12px;">Question</th>
            <th style="text-align:left;padding:8px 12px;">Result</th>
            <th style="text-align:left;padding:8px 12px;">Count</th>
          </tr>
        </thead>
        <tbody>${statsHtml}</tbody>
      </table>

      ${recentFeedbackHtml}

      <p style="color:#A5ADBA;font-size:12px;margin-top:32px;border-top:1px solid #EBECF0;padding-top:12px;">
        This is an automated digest from the Barrie Transit Rider Feedback system.
        Download the full CSV report from the admin API.
      </p>
    </body>
    </html>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { generateAndSendDigest, buildDigestHtml };
