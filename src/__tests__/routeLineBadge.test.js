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
  getRouteLineBadgeArrowRotation,
} = RouteLineBadgeModule;

describe('RouteLineBadge', () => {
  test('uses white text on dark route colors', () => {
    expect(getRouteLineBadgeTextColor('#0055AA')).toBe('#FFFFFF');
  });

  test('uses dark text on light route colors', () => {
    expect(getRouteLineBadgeTextColor('#F9D65C')).toBe('#111827');
  });

  test('sizes common label lengths', () => {
    expect(getRouteLineBadgeDimensions('1')).toEqual({ width: 48, height: 28, borderRadius: 14 });
    expect(getRouteLineBadgeDimensions('12')).toEqual({ width: 54, height: 28, borderRadius: 14 });
    expect(getRouteLineBadgeDimensions('12B')).toEqual({ width: 62, height: 28, borderRadius: 14 });
  });

  test('normalizes arrow rotation for route direction', () => {
    expect(getRouteLineBadgeArrowRotation(90)).toEqual('90deg');
    expect(getRouteLineBadgeArrowRotation(-45)).toEqual('315deg');
  });

  test('renders route label text and direction arrow', () => {
    let instance;
    act(() => {
      instance = create(<RouteLineBadge label="8A" color="#1167B1" bearing={90} />);
    });
    const tree = instance.toJSON();
    expect(JSON.stringify(tree)).toContain('8A');
    expect(JSON.stringify(tree)).toContain('Route direction 90 degrees');
  });

  test('renders paired branch labels with opposite direction cues', () => {
    let instance;
    act(() => {
      instance = create(<RouteLineBadge
        label="7A/7B"
        color="#1167B1"
        branches={[
          { label: '7A', direction: 'left' },
          { label: '7B', direction: 'right' },
        ]}
      />);
    });

    const tree = instance.toJSON();
    const serialized = JSON.stringify(tree);
    expect(serialized).toContain('7A');
    expect(serialized).toContain('7B');
    expect(serialized).toContain('This way left');
    expect(serialized).toContain('This way right');
  });
});
