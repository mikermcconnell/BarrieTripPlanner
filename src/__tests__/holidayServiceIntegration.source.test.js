const fs = require('fs');
const path = require('path');

describe('holiday service HomeScreen integration', () => {
  test('native home screen wires holiday service banner, trip badge, and details sheet', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.js'),
      'utf8'
    );

    expect(source).toContain("import HolidayServiceBanner from '../components/HolidayServiceBanner';");
    expect(source).toContain("import HolidayServiceDetailsSheet from '../components/HolidayServiceDetailsSheet';");
    expect(source).toContain('const tripHolidayServiceInfo = useMemo(');
    expect(source).toContain('const homeHolidayServiceInfo = useMemo(');
    expect(source).toContain('<HolidayServiceBanner');
    expect(source).toContain('holidayServiceInfo={tripHolidayServiceInfo}');
    expect(source).toContain('<HolidayServiceDetailsSheet');
  });
});
