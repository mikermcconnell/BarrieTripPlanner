const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  TouchableOpacity: 'TouchableOpacity',
  FlatList: 'FlatList',
  ActivityIndicator: 'ActivityIndicator',
  Keyboard: { dismiss: jest.fn() },
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('../components/Icon', () => 'Icon');

const mockAutocompleteAddress = jest.fn();
jest.mock('../services/locationIQService', () => ({
  autocompleteAddress: (...args) => mockAutocompleteAddress(...args),
  getDistanceFromBarrie: () => 0,
}));

const AddressAutocomplete = require('../components/AddressAutocomplete').default;

const getText = (root) => root.findAllByType('Text')
  .flatMap((node) => node.children)
  .filter((child) => typeof child === 'string');

describe('AddressAutocomplete loading feedback', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('immediately confirms that destination suggestions are being found', () => {
    jest.useFakeTimers();
    mockAutocompleteAddress.mockResolvedValue([]);

    let instance;
    act(() => {
      instance = create(React.createElement(AddressAutocomplete, {
        value: '',
        onChangeText: jest.fn(),
        onSelect: jest.fn(),
        placeholder: 'Where to?',
        showLoadingFeedback: true,
      }));
    });

    const input = instance.root.findByType('TextInput');
    act(() => {
      input.props.onChangeText('RVH');
    });

    expect(getText(instance.root)).toContain('Finding places…');
    expect(instance.root.findAll(
      (node) => node.props.accessibilityLabel === 'Finding destination suggestions'
    )).toHaveLength(1);

    act(() => {
      input.props.onChangeText('R');
    });

    expect(getText(instance.root)).not.toContain('Finding places…');
    act(() => {
      instance.unmount();
    });
  });
});
