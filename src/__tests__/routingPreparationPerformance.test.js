const fs = require('fs');
const path = require('path');

describe('Android routing preparation responsiveness', () => {
  test('route-shape processing yields before work and after every shape', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'context', 'TransitContext.js'),
      'utf8'
    );
    const start = source.indexOf('const processAndStoreShapes = useCallback');
    const end = source.indexOf('const cacheGTFSDataInBackground', start);
    const shapeProcessingSource = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(shapeProcessingSource).not.toContain('const batchSize = 10');

    const firstYield = shapeProcessingSource.indexOf(
      'await new Promise((resolve) => setTimeout(resolve, 0));'
    );
    const loopStart = shapeProcessingSource.indexOf(
      'for (let i = 0; i < shapeIds.length; i += 1)'
    );
    const simplifyCall = shapeProcessingSource.indexOf('processShapeForRendering');
    const secondYield = shapeProcessingSource.indexOf(
      'await new Promise((resolve) => setTimeout(resolve, 0));',
      firstYield + 1
    );

    expect(firstYield).toBeGreaterThanOrEqual(0);
    expect(firstYield).toBeLessThan(loopStart);
    expect(secondYield).toBeGreaterThan(simplifyCall);
  });
});
