const fs = require('fs');
const path = require('path');

describe('app feedback security boundary', () => {
  test('denies direct Firestore client access so the API remains the only data path', () => {
    const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');
    expect(rules).toMatch(/match \/appFeedback\/\{feedbackId\} \{\s*allow read, write: if false;/);
    expect(rules).toMatch(/match \/appFeedbackRateLimits\/\{quotaId\} \{\s*allow read, write: if false;/);
  });

  test('does not collect rider identity or email in the submission payload', () => {
    const service = fs.readFileSync(path.join(__dirname, '../services/appFeedbackService.js'), 'utf8');
    const routes = fs.readFileSync(path.join(__dirname, '../../api-proxy/routes/appFeedbackRoutes.js'), 'utf8');
    expect(service).not.toContain('contactEmail');
    expect(routes).not.toContain('respondentId');
    expect(routes).not.toContain('req.auth.email');
    expect(routes).toContain('createFeedbackWithinQuota');
  });
});
