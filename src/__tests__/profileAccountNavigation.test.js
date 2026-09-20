const fs = require('fs');
const path = require('path');

describe('profile account navigation', () => {
  test('registers a Manage account destination in the Profile stack', () => {
    const navigatorSource = fs.readFileSync(path.join(__dirname, '../navigation/TabNavigator.js'), 'utf8');

    expect(navigatorSource).toContain("const getAccountScreen = () => require('../screens/AccountScreen').default");
    expect(navigatorSource).toContain('name="Account" getComponent={getAccountScreen}');
  });

  test('registers complete Help and About destinations in the Profile stack', () => {
    const navigatorSource = fs.readFileSync(path.join(__dirname, '../navigation/TabNavigator.js'), 'utf8');

    expect(navigatorSource).toContain("const getHelpSupportScreen = () => require('../screens/HelpSupportScreen').default");
    expect(navigatorSource).toContain("const getAboutScreen = () => require('../screens/AboutScreen').default");
    expect(navigatorSource).toContain('name="HelpSupport" getComponent={getHelpSupportScreen}');
    expect(navigatorSource).toContain('name="About" getComponent={getAboutScreen}');
  });

  test('registers rider feedback and developer inbox destinations', () => {
    const navigatorSource = fs.readFileSync(path.join(__dirname, '../navigation/TabNavigator.js'), 'utf8');
    const helpSource = fs.readFileSync(path.join(__dirname, '../screens/HelpSupportScreen.js'), 'utf8');

    expect(navigatorSource).toContain("require('../screens/AppFeedbackScreen').default");
    expect(navigatorSource).toContain("require('../screens/AppFeedbackInboxScreen').default");
    expect(navigatorSource).toContain('name="AppFeedback" getComponent={getAppFeedbackScreen}');
    expect(navigatorSource).toContain('name="AppFeedbackInbox" getComponent={getAppFeedbackInboxScreen}');
    expect(helpSource).toContain("navigation.navigate('AppFeedback', { source: 'help_support' })");
  });

  test('does not show the former Made with Heart footer on the profile page', () => {
    const settingsSource = fs.readFileSync(path.join(__dirname, '../screens/SettingsScreen.js'), 'utf8');

    expect(settingsSource).not.toContain('Made with');
    expect(settingsSource).not.toContain('Barrie Transit riders');
  });
});
