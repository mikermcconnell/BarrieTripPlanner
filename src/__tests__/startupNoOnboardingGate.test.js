const fs = require('fs');
const path = require('path');

describe('app startup flow', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../../App.js'), 'utf8');
  const settingsSource = fs.readFileSync(path.join(__dirname, '../screens/SettingsScreen.js'), 'utf8');

  test('does not gate first launch behind onboarding storage', () => {
    expect(appSource).not.toContain('OnboardingScreen');
    expect(appSource).not.toContain('ONBOARDING_KEY');
    expect(appSource).not.toContain('showOnboarding');
    expect(appSource).not.toContain('onboardingChecked');
  });

  test('does not offer to replay a startup tutorial that no longer appears', () => {
    expect(settingsSource).not.toContain('Replay Tutorial');
    expect(settingsSource).not.toContain('ONBOARDING_KEY');
  });
});
