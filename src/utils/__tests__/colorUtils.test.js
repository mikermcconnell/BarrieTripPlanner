import { isLightColor, getContrastTextColor } from '../colorUtils';

describe('isLightColor', () => {
  it('returns true for white', () => expect(isLightColor('#FFFFFF')).toBe(true));
  it('returns false for black', () => expect(isLightColor('#000000')).toBe(false));
  it('returns false for dark blue', () => expect(isLightColor('#172B4D')).toBe(false));
  it('returns true for yellow', () => expect(isLightColor('#FFD700')).toBe(true));
  it('handles missing #', () => expect(isLightColor('FFFFFF')).toBe(true));
  it('returns false for null', () => expect(isLightColor(null)).toBe(false));
});

describe('getContrastTextColor', () => {
  it('returns dark text for light background', () =>
    expect(getContrastTextColor('#FFFFFF')).toBe('#172B4D'));
  it('returns light text for dark background', () =>
    expect(getContrastTextColor('#000000')).toBe('#FFFFFF'));
});
