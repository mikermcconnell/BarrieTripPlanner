const fs = require('fs');
const path = require('path');

describe('web stop details map freedom', () => {
  test('keeps the visible map free of a gesture-blocking backdrop', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'StopBottomSheet.web.js'),
      'utf8'
    );

    expect(source).not.toContain('style={styles.backdrop}');
    expect(source).not.toContain('backdrop: {');
    expect(source).toContain('accessibilityLabel="Close stop details"');
    expect(source).toContain('Keep the visible map interactive');
  });
});
