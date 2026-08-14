const fs = require('fs');
const path = require('path');

describe('active official detour notice wiring', () => {
  test.each(['HomeScreen.js', 'HomeScreen.web.impl.js'])(
    '%s combines active MyRide detours with reviewed official impacts without adding them to activeDetours',
    (fileName) => {
      const source = fs.readFileSync(path.join(__dirname, '..', 'screens', fileName), 'utf8');

      expect(source).toContain('getActiveDetourNotices(transitNews)');
      expect(source).toContain('[...reviewedImpacts, ...activeNewsDetours]');
      expect(source).not.toContain('activeDetours: getActiveDetourNotices');
    }
  );
});
