const fs = require('fs');
const path = require('path');

const readSource = (fileName) => fs.readFileSync(
  path.join(__dirname, '..', 'screens', fileName),
  'utf8'
);

describe('main-map detour explainer wiring', () => {
  test.each(['HomeScreen.js', 'HomeScreen.web.impl.js'])(
    '%s exposes the explainer outside detour mode',
    (fileName) => {
      const source = readSource(fileName);

      expect(source).toContain("import DetourExplainerButton from '../components/DetourExplainerButton';");
      expect(source).toContain('<DetourExplainerButton');
      expect(source).toContain('!isDetourView');
    }
  );
});
