const fs = require('fs');
const path = require('path');

describe('profile account navigation', () => {
  test('registers a Manage account destination in the Profile stack', () => {
    const navigatorSource = fs.readFileSync(path.join(__dirname, '../navigation/TabNavigator.js'), 'utf8');

    expect(navigatorSource).toContain("const getAccountScreen = () => require('../screens/AccountScreen').default");
    expect(navigatorSource).toContain('name="Account" getComponent={getAccountScreen}');
  });
});
