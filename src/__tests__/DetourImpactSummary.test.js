global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles) => styles },
}));

const DetourImpactSummary = require('../components/DetourImpactSummary').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const render = (props) => {
  let inst;
  act(() => {
    inst = create(React.createElement(DetourImpactSummary, props));
  });
  return inst;
};

describe('DetourImpactSummary', () => {
  test('shows zero impacted stops without a useless stop list button', () => {
    const inst = render({
      routeId: '12B',
      sections: [{ skippedStops: [], affectedStops: [] }],
    });

    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));
    expect(texts).toContain('0 regular stops impacted.');
    expect(texts).toContain('No stops are currently listed as not served for this detour.');
    expect(texts).not.toContain('Stop impact is still being confirmed.');
    expect(texts).not.toContain('View stops not served (0)');
  });

  test('shows impacted stop count when stops are skipped', () => {
    const inst = render({
      routeId: '12B',
      sections: [{
        skippedStops: [
          { id: 's1', name: 'Maple at Sophia', code: '1001' },
          { id: 's2', name: 'Ross at Bayfield', code: '1002' },
        ],
      }],
    });

    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));
    expect(texts).toContain('2 regular stops impacted.');
    expect(texts).toContain('View stops not served (2)');
  });

  test('uses a shared route label for grouped detours', () => {
    const inst = render({
      routeId: '12A',
      routeLabel: 'Routes 12A/12B',
      sections: [{
        skippedStops: [
          { id: 's1', name: 'Welham at Hooper', code: '932' },
        ],
      }],
    });

    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));
    expect(texts).toContain('Routes 12A/12B detour impact');
  });
});
