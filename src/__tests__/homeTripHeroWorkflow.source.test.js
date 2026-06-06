const fs = require('fs');
const path = require('path');

const readSource = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

describe('home trip planning hero workflow', () => {
  test('web keeps the Where to search as the only primary trip-planning entry', () => {
    const source = readSource('screens/HomeScreen.web.js');

    expect(source).toContain('placeholder="Where to?"');
    expect(source).not.toContain('Plan manually');
    expect(source).not.toContain('Plan trip manually');
  });

  test('native keeps the Where to search as the only primary trip-planning entry', () => {
    const source = readSource('screens/HomeScreen.js');

    expect(source).toContain('placeholder="Where to?"');
    expect(source).not.toContain("from '../components/PlanTripFAB'");
    expect(source).not.toContain('<BottomActionBar');
  });

  test('opened trip planner is framed as the main workflow', () => {
    const nativeHeader = readSource('components/TripSearchHeader.js');
    const webHeader = readSource('components/TripSearchHeader.web.js');
    const nativeSheet = readSource('components/TripBottomSheet.js');
    const webSheet = readSource('components/TripBottomSheet.web.js');

    for (const source of [nativeHeader, webHeader]) {
      expect(source).toContain('Plan your trip');
      expect(source).toContain('Choose a destination and we’ll show the best live transit options.');
    }

    for (const source of [nativeSheet, webSheet]) {
      expect(source).toContain('Your trips start here');
    }
  });
});
