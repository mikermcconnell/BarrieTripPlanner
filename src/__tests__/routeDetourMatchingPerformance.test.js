const fs = require('fs');
const path = require('path');

describe('route detour matching performance', () => {
  test('routeIsDetouring does not copy active detour Sets on every call', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'utils', 'routeDetourMatching.js'),
      'utf8'
    );

    const functionStart = source.indexOf('export const routeIsDetouring');
    const functionEnd = source.indexOf('export const getMatchingDetourRouteIds', functionStart);
    const functionSource = source.slice(functionStart, functionEnd);

    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(functionEnd).toBeGreaterThan(functionStart);
    expect(functionSource).not.toContain('Array.from');
  });
});
