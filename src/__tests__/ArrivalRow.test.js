global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('../services/tripService', () => ({
  formatMinutes: (minutes) => `${minutes} min`,
}));

const ArrivalRow = require('../components/ArrivalRow').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const renderArrival = (overrides = {}) => {
  let instance;
  act(() => {
    instance = create(React.createElement(ArrivalRow, {
      arrival: {
        routeShortName: '8A',
        minutesAway: 5,
        isRealtime: true,
        ...overrides,
      },
    }));
  });
  return instance;
};

describe('ArrivalRow destination states', () => {
  test('shows an updating label while a missing trip waits for refreshed static data', () => {
    const instance = renderArrival({
      destinationStatus: 'trip-unmatched',
      isDestinationUpdating: true,
    });
    const text = instance.root.findAllByType('Text').flatMap(collectText).join(' ');

    expect(text).toContain('Updating destination...');
    expect(instance.root.findByType('View').props.accessibilityLabel)
      .toContain('Updating destination...');
  });

  test('shows a durable unavailable label after destination resolution fails', () => {
    const instance = renderArrival({ destinationStatus: 'headsign-missing' });
    const text = instance.root.findAllByType('Text').flatMap(collectText).join(' ');

    expect(text).toContain('Destination unavailable');
    expect(text).not.toContain('Unknown');
  });

  test('prefers the resolved schedule headsign', () => {
    const instance = renderArrival({
      headsign: 'Downtown Terminal',
      destinationStatus: 'available',
      isDestinationUpdating: true,
    });
    const text = instance.root.findAllByType('Text').flatMap(collectText).join(' ');

    expect(text).toContain('Downtown Terminal');
    expect(text).not.toContain('Updating destination...');
  });
});
