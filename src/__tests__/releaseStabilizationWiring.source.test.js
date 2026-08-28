const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('release stabilization wiring', () => {
  test('does not mount native trip-preview layers when preview mode is disabled', () => {
    const source = read('src/screens/HomeScreen.js');

    expect(source).toMatch(/\{isTripPreviewMode && \(\s*<HomeMapTripPreviewLayer/);
  });

  test('uses Barrie wall-clock time for the web picker minimum', () => {
    const source = read('src/components/TripSearchHeader.web.js');

    expect(source).toContain("import { getAgencyWallClockPickerDate } from '../utils/serviceTime';");
    expect(source).toContain('min={formatDateTimeLocal(getAgencyWallClockPickerDate() || new Date())}');
    expect(source).not.toContain('min={formatDateTimeLocal(new Date())}');
  });

  test('refreshes selected-vehicle updates when service-instance fields change', () => {
    const expectedDependencies =
      '}, [selectedVehicle?.tripId, selectedVehicle?.startDate, selectedVehicle?.startTime]);';

    expect(read('src/screens/HomeScreen.js')).toContain(expectedDependencies);
    expect(read('src/screens/HomeScreen.web.impl.js')).toContain(expectedDependencies);
  });
});
