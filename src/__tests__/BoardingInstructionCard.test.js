global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (styles) => styles },
}));

const BoardingInstructionCard = require('../components/navigation/BoardingInstructionCard').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const renderTexts = (element) => {
  let inst;
  act(() => {
    inst = create(element);
  });
  return inst.root.findAllByType('Text').flatMap((node) => collectText(node));
};

describe('BoardingInstructionCard', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-05-01T12:00:00Z').getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('combines boarding and stop guide into compact copy', () => {
    const texts = renderTexts(React.createElement(BoardingInstructionCard, {
      leg: {
        mode: 'BUS',
        from: { name: 'Mapleview Stop', stopCode: '1234', lat: 44.38, lon: -79.7 },
        intermediateStops: [
          { name: 'First Stop', stopCode: '2001', lat: 44.39, lon: -79.69 },
          { name: 'Second Stop', stopCode: '2002', lat: 44.4, lon: -79.68 },
        ],
        to: { name: 'Downtown Terminal', stopCode: '9000', lat: 44.41, lon: -79.67 },
      },
      routeShortName: '8B',
      routeColor: '#123456',
      headsign: 'Downtown Terminal',
      stopName: 'Mapleview Stop',
      stopCode: '1234',
      scheduledDeparture: Date.now() + 13 * 60 * 1000,
      isRealtime: true,
      peekAheadText: 'Walk 2 min to destination',
    }));

    const text = texts.join('');
    expect(text).toContain('8B');
    expect(text).toContain('Downtown Terminal');
    expect(text).toContain('Board Stop #1234 · 3 stops to Downtown Terminal');
    expect(text).toContain('13 min');
    expect(text).toContain('Departs');
    expect(text).toContain('Then: Walk 2 min to destination');
    expect(text).not.toContain('Departing');
  });
});
