const fs = require('fs');
const path = require('path');

describe('Transit realtime performance', () => {
  test('automatic vehicle refreshes run without toggling loading state every interval', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'context', 'TransitContext.js'),
      'utf8'
    );

    expect(source).toContain('loadVehiclePositions({ showLoading: false })');
  });
});
