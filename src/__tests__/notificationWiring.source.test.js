const fs = require('fs');
const path = require('path');

const readSource = (relativePath) => (
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
);

describe('notification wiring source checks', () => {
  test('notification taps route detour alerts to the Alerts screen', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../App.js'), 'utf8');

    expect(source).toContain("case 'detour_alert':");
    expect(source).toContain("navigationRef.current.navigate('Map', { screen: 'Alerts' })");
  });

  test('settings saves enabled push tokens to the signed-in user profile', () => {
    const source = readSource('screens/SettingsScreen.js');

    expect(source).toContain('userFirestoreService.updatePushToken(user.uid, result.token)');
  });

  test('auth bootstrap syncs an already stored push token after sign in', () => {
    const source = readSource('context/AuthContext.js');

    expect(source).toContain('getStoredPushToken');
    expect(source).toContain('userFirestoreService.updatePushToken(firebaseUser.uid, storedPushToken)');
  });

  test('trip details exposes a one-off reminder action for future trips', () => {
    const source = readSource('screens/TripDetailsScreen.js');

    expect(source).toContain('scheduleTripReminder');
    expect(source).toContain('Remind me');
    expect(source).toContain('Reminder set');
  });
});
