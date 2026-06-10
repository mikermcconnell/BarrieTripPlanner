const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  Linking: { openURL: jest.fn(() => Promise.resolve()) },
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles) => styles },
}));

const OfficialImpactStrip = require('../components/OfficialImpactStrip').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

describe('OfficialImpactStrip', () => {
  const impact = {
    id: 'baseline-detour-12b-1652',
    title: 'Mapleview Detour and Shuttle',
    message: 'Route 12B no longer directly serves Barrie South GO.',
    affectedRoutes: ['12B'],
    replacementRoutes: ['15'],
  };

  test('labels planned detour notices and badges replacement routes', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(OfficialImpactStrip, {
        impacts: [impact],
      }));
    });

    const text = inst.root.findAllByType('Text').flatMap((node) => collectText(node)).join(' ');

    expect(text).toContain('Planned detour notice');
    expect(text).toContain('12B');
    expect(text).toContain('15');
  });

  test('dismiss button calls back with the first impact id', () => {
    const onDismiss = jest.fn();
    let inst;
    act(() => {
      inst = create(React.createElement(OfficialImpactStrip, {
        impacts: [impact],
        onDismiss,
      }));
    });

    const dismissButton = inst.root.findByProps({ accessibilityLabel: 'Hide planned detour notice' });
    act(() => {
      dismissButton.props.onPress();
    });

    expect(onDismiss).toHaveBeenCalledWith('baseline-detour-12b-1652');
  });

  test('pressing the card can focus affected and replacement routes', () => {
    const onPress = jest.fn();
    let inst;
    act(() => {
      inst = create(React.createElement(OfficialImpactStrip, {
        impacts: [impact],
        onPress,
      }));
    });

    const card = inst.root.findByProps({ accessibilityLabel: 'Planned detour notice: Mapleview Detour and Shuttle' });
    act(() => {
      card.props.onPress();
    });

    expect(onPress).toHaveBeenCalledWith(impact, ['12B', '15']);
  });
});
