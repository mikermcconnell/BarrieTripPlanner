jest.mock('react-native-svg', () => ({
  SvgXml: 'SvgXml',
}));

const fs = require('fs');
const path = require('path');
const { getWalkingPaceIconConfig } = require('../components/navigation/WalkingPaceIcon');

describe('WalkingPaceIcon', () => {
  test('maps pace states to the correct walking artwork', () => {
    expect(getWalkingPaceIconConfig('plenty')).toMatchObject({
      assetName: 'walk-casual-256.png',
      label: 'Person casually walking',
    });
    expect(getWalkingPaceIconConfig('on_pace')).toMatchObject({
      assetName: 'walk-normal-256.png',
      label: 'Person walking',
    });
    expect(getWalkingPaceIconConfig('hurry')).toMatchObject({
      assetName: 'walk-brisk-256.png',
      label: 'Person walking briskly',
    });
    expect(getWalkingPaceIconConfig('behind')).toMatchObject({
      assetName: 'run-late-256.png',
      label: 'Person running late',
    });
  });

  test('maps every pace state to an available PNG asset', () => {
    ['plenty', 'on_pace', 'hurry', 'behind'].forEach((level) => {
      const icon = getWalkingPaceIconConfig(level);
      const assetPath = path.join(__dirname, '../../assets/icons/walking-pace', icon.assetName);

      expect(fs.existsSync(assetPath)).toBe(true);
      expect(path.extname(assetPath)).toBe('.png');
      expect(icon.source).toBeTruthy();
    });
  });
});
