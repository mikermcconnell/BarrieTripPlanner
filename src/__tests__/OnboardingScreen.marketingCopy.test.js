const fs = require('fs');
const path = require('path');

const onboardingSource = fs.readFileSync(
  path.join(__dirname, '../screens/OnboardingScreen.js'),
  'utf8'
);
const sceneSource = fs.readFileSync(
  path.join(__dirname, '../components/OnboardingScene.js'),
  'utf8'
);

describe('first-open onboarding marketing copy', () => {
  test('leads with the detour campaign promise', () => {
    expect(onboardingSource).toContain("Don't wait where the bus isn't going.");
    expect(onboardingSource).toContain('See planned and unplanned detours before you walk to a skipped stop.');
  });

  test('uses public My Barrie Transit naming and avoids internal/public overclaims', () => {
    const publicOnboarding = `${onboardingSource}\n${sceneSource}`;

    expect(publicOnboarding).toContain('MY BARRIE TRANSIT');
    expect(publicOnboarding).toContain('My Barrie Transit');
    expect(publicOnboarding).not.toMatch(/BTTP/);
    expect(publicOnboarding).not.toMatch(/never miss your bus/i);
  });

  test('uses official blue campaign colors for the opening scene', () => {
    expect(sceneSource).toContain('COLORS.primary');
    expect(sceneSource).toContain('COLORS.primaryLight');
    expect(sceneSource).toContain('COLORS.primaryDark');
  });
});
