const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');

describe('shared trip security contract', () => {
  test('allows exact-link reads while denying collection listing', () => {
    const rules = read('firestore.rules');
    expect(rules).toContain('match /sharedTrips/{shareId}');
    expect(rules).toContain('allow get: if true;');
    expect(rules).toContain('allow list: if false;');
    expect(rules).toContain('request.resource.data.revision == resource.data.revision + 1');
  });

  test('routes shared links to the collaborative trip screen', () => {
    const runtime = read('AppRuntime.js');
    const navigation = read('src/navigation/TabNavigator.js');
    expect(runtime).toContain("SharedTrip: 'trip/:shareId'");
    expect(navigation).toContain('name="SharedTrip"');
  });

  test('signed-out riders can save trips locally without a sign-in gate', () => {
    const auth = read('src/context/AuthContext.js');
    const home = read('src/screens/HomeScreen.js');
    expect(auth).toContain('LOCAL_SAVED_TRIPS');
    expect(auth).toContain("storage: 'local'");
    expect(home).not.toContain("Alert.alert('Sign in to save trips'");
  });
});
