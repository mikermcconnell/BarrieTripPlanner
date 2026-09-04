const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('support and accessibility actions', () => {
  test('uses in-app feedback as the primary app support path', () => {
    const settings = read('src/screens/SettingsScreen.js');
    const help = read('src/screens/HelpSupportScreen.js');
    const about = read('src/screens/AboutScreen.js');

    expect(settings).toContain("navigation.navigate('AppFeedback', { source: 'settings' })");
    expect(help).toContain("navigation.navigate('AppFeedback', { source: 'help_support' })");
    expect(about).toContain("navigation.navigate('AppFeedback', { source: 'about' })");
    expect(settings).toContain('Email App Support');
    expect(help).toContain('Email app support');
  });

  test('opens Service Barrie through the working web contact path', () => {
    expect(read('src/screens/SettingsScreen.js')).toContain('openTransitContactPage()');
    expect(read('src/screens/HelpSupportScreen.js')).toContain('openTransitContactPage()');
  });

  test('makes the text-size row actionable', () => {
    const settings = read('src/screens/SettingsScreen.js');
    expect(settings).toContain("'Text Size'");
    expect(settings).toContain('openTextSizeSettings');
    expect(settings).toContain('Open your device display settings');
  });
});
