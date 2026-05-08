global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  ActivityIndicator: 'ActivityIndicator',
  Animated: {},
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('../components/Icon', () => 'Icon');
jest.mock('../components/TimePicker', () => 'TimePicker');
jest.mock('../components/AddressAutocomplete', () => 'AddressAutocomplete');

const TripSearchHeader = require('../components/TripSearchHeader').default;

const collectText = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  return collectText(node.props?.children);
};

const renderTexts = () => {
  let inst;
  act(() => {
    inst = create(React.createElement(TripSearchHeader, {
      compact: true,
      fromText: '294 YONGE ST, Barrie',
      toText: '346 BAYFIELD ST, Barrie',
      onFromChange: jest.fn(),
      onToChange: jest.fn(),
      onFromSelect: jest.fn(),
      onToSelect: jest.fn(),
      onSwap: jest.fn(),
      onClose: jest.fn(),
    }));
  });
  return inst.root.findAllByType('Text').flatMap((node) => collectText(node));
};

describe('TripSearchHeader compact polish', () => {
  test('labels the compact route endpoints for a clearer planned-trip card', () => {
    const texts = renderTexts();

    expect(texts).toContain('Start');
    expect(texts).toContain('Destination');
    expect(texts).toContain('294 YONGE ST, Barrie');
    expect(texts).toContain('346 BAYFIELD ST, Barrie');
  });
});
