global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (styles) => styles },
}));

const React = require('react');
const { create, act } = require('react-test-renderer');
const RouteLineBadgeModule = require('../components/RouteLineBadge');
const RouteLineBadge = RouteLineBadgeModule.default;
const {
  getRouteLineBadgeDimensions,
  getRouteLineBadgeTextColor,
} = RouteLineBadgeModule;

describe('RouteLineBadge', () => {
  test('uses white text on dark route colors', () => {
    expect(getRouteLineBadgeTextColor('#0055AA')).toBe('#FFFFFF');
  });

  test('uses dark text on light route colors', () => {
    expect(getRouteLineBadgeTextColor('#F9D65C')).toBe('#111827');
  });

  test('sizes common label lengths', () => {
    expect(getRouteLineBadgeDimensions('1')).toEqual({ width: 30, height: 30, borderRadius: 8 });
    expect(getRouteLineBadgeDimensions('12')).toEqual({ width: 34, height: 30, borderRadius: 8 });
    expect(getRouteLineBadgeDimensions('12B')).toEqual({ width: 42, height: 30, borderRadius: 8 });
  });

  test('renders route label text', () => {
    let instance;
    act(() => {
      instance = create(<RouteLineBadge label="8A" color="#1167B1" />);
    });
    const tree = instance.toJSON();
    expect(JSON.stringify(tree)).toContain('8A');
  });
});
