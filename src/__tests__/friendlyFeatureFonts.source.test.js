const fs = require('fs');
const path = require('path');

describe('friendly feature font loading', () => {
  test('loads Nunito for both web and native builds', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'AppRuntime.js'), 'utf8');

    expect(source).toContain("require('@expo-google-fonts/nunito')");
    expect(source).toContain('Nunito_400Regular');
    expect(source).toContain('Nunito_800ExtraBold');
    expect(source).toContain('? NUNITO_FONT_MAP');
    expect(source).toContain('...NUNITO_FONT_MAP');
  });
});
