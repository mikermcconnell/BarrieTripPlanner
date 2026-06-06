global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('../components/Icon', () => 'Icon');

const DetourTimeline = require('../components/DetourTimeline').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const render = (props) => {
  let inst;
  act(() => {
    inst = create(React.createElement(DetourTimeline, props));
  });
  return inst;
};

describe('DetourTimeline', () => {
  test('does not infer skipped stops from in-service boundary stops', () => {
    const inst = render({
      sections: [{
        entryStopName: 'Bayfield at Sophia',
        exitStopName: 'Maple at Ross',
        affectedStops: [
          { id: '75', name: 'Bayfield at Sophia', code: '75', detourStopRole: 'boundary' },
          { id: '486', name: 'Maple at Ross', code: '486', detourStopRole: 'boundary' },
        ],
        skippedStops: [],
      }],
    });

    const texts = inst.root.findAllByType('Text').flatMap((node) => collectText(node));
    expect(texts).toContain('No stops currently marked closed.');
  });
});
