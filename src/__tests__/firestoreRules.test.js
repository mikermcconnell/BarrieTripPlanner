const fs = require('fs');
const path = require('path');

describe('Firestore security rules', () => {
  const rules = fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8');

  test('allow signed-in users to read and manage their own saved places', () => {
    const savedPlacesMatch = rules.match(/match \/savedPlaces\/\{placeId\} \{[\s\S]*?\n      \}/);

    expect(savedPlacesMatch).not.toBeNull();

    const savedPlacesRules = savedPlacesMatch[0];
    expect(savedPlacesRules).toContain('allow read: if isAuthenticated() && isOwner(userId);');
    expect(savedPlacesRules).toContain('allow update: if isAuthenticated() && isOwner(userId);');
    expect(savedPlacesRules).toContain('allow delete: if isAuthenticated() && isOwner(userId);');
    expect(savedPlacesRules).toContain('request.resource.data.lat is number');
    expect(savedPlacesRules).toContain('request.resource.data.lon is number');
  });

  test('allow public reads for V2 active detours and history', () => {
    expect(rules).toContain('match /activeDetoursV2/{routeId}');
    expect(rules).toContain('match /detourHistoryV2/{eventId}');
  });
});
