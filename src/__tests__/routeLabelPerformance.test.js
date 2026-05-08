const fs = require('fs');
const path = require('path');

describe('route label performance', () => {
  test('route label resolution uses a reusable route index instead of scanning routes per vehicle', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'utils', 'routeLabel.js'),
      'utf8'
    );

    const functionStart = source.indexOf('export const resolveVehicleRouteLabel');
    const functionEnd = source.indexOf('export const getVehicleRouteLabel', functionStart);
    const functionSource = source.slice(functionStart, functionEnd);

    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(functionEnd).toBeGreaterThan(functionStart);
    expect(functionSource).not.toMatch(/routes\.(find|filter|some)\(/);
  });
});
