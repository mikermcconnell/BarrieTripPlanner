const fs = require('fs');
const path = require('path');

describe('route line polish source wiring', () => {
  test('native and web route lines use white halos and muted context styling', () => {
    const nativeSource = fs.readFileSync(path.join(__dirname, '../screens/HomeScreen.js'), 'utf8');
    const webSource = fs.readFileSync(path.join(__dirname, '../screens/HomeScreen.web.js'), 'utf8');

    expect(nativeSource).toContain('outlineColor={routeVisual.outlineColor}');
    expect(nativeSource).toContain('routeColor: isSelected ? shape.color : ROUTE_LINE_MUTED_COLOR');
    expect(nativeSource).toContain('routeColor: isDetouring ? shape.color : ROUTE_LINE_MUTED_COLOR');
    expect(nativeSource).toContain('ROUTE_LINE_WIDTH_SCALE');

    expect(webSource).toContain('outlineColor={ROUTE_LINE_OUTLINE_COLOR}');
    expect(webSource).toContain('routeColor = isSelected ? shape.color : ROUTE_LINE_MUTED_COLOR');
    expect(webSource).toContain('routeColor = isDetouring ? shape.color : ROUTE_LINE_MUTED_COLOR');
    expect(webSource).toContain('return width * ROUTE_LINE_WIDTH_SCALE');
  });
});
