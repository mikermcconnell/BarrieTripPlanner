global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (styles) => styles },
}));

const TransitStopGuideCard = require('../components/navigation/TransitStopGuideCard').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const renderTexts = (props) => {
  let inst;
  act(() => {
    inst = create(React.createElement(TransitStopGuideCard, props));
  });
  return inst.root.findAllByType('Text').flatMap((node) => collectText(node));
};

describe('TransitStopGuideCard', () => {
  const leg = {
    mode: 'BUS',
    from: { name: 'Downtown Terminal', lat: 44.1, lon: -79.6, stopId: '100' },
    intermediateStops: [
      { name: 'Stop 1', lat: 44.11, lon: -79.61, stopId: '101' },
      { name: 'Stop 2', lat: 44.12, lon: -79.62, stopId: '102' },
    ],
    to: { name: 'Penetang at St Vincent', lat: 44.13, lon: -79.63, stopId: '583' },
  };

  test('cycles the displayed next stop from live stops remaining while on board', () => {
    const firstStopTexts = renderTexts({ leg, isOnBoard: true, liveStopsRemaining: 3 }).join('|');
    const secondStopTexts = renderTexts({ leg, isOnBoard: true, liveStopsRemaining: 2 }).join('|');
    const destinationTexts = renderTexts({ leg, isOnBoard: true, liveStopsRemaining: 1 }).join('|');

    expect(firstStopTexts).toContain('3 stops remaining');
    expect(firstStopTexts).toContain('Next stop|Stop 1 (#101)');

    expect(secondStopTexts).toContain('2 stops remaining');
    expect(secondStopTexts).toContain('Next stop|Stop 2 (#102)');

    expect(destinationTexts).toContain('1 stop remaining');
    expect(destinationTexts).toContain('Next stop|Penetang at St Vincent (#583)');
  });
});
