global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Image: 'Image',
  Linking: { openURL: jest.fn(() => Promise.resolve()) },
  Modal: 'Modal',
  Platform: { OS: 'ios' },
  ScrollView: 'ScrollView',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
  StyleSheet: { create: (styles) => styles, absoluteFillObject: {} },
}));

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));

jest.mock('../services/platformMapService', () => ({
  buildPlatformMapImageUrl: (hubId) => `https://proxy.example.test/api/platform-maps/${hubId}`,
  getPlatformMapSourceUrl: () => 'https://www.barrie.ca/Transit-Platform-Maps.pdf',
}));

const PlatformMapViewerModal = require('../components/PlatformMapViewerModal').default;

const platformMap = {
  id: 'georgian-college',
  displayName: 'Georgian College',
  pageNumber: 5,
};

describe('PlatformMapViewerModal', () => {
  test('renders modal title and image URL for selected hub', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(PlatformMapViewerModal, {
        visible: true,
        platformMap,
        onClose: jest.fn(),
      }));
    });

    const texts = inst.root.findAllByType('Text').map((node) => node.props.children);
    const image = inst.root.findByType('Image');

    expect(texts).toContain('Georgian College');
    expect(image.props.source.uri).toBe('https://proxy.example.test/api/platform-maps/georgian-college');
    expect(image.props.accessibilityLabel).toBe('Platform map for Georgian College');
  });

  test('calls close handler from close button', () => {
    const onClose = jest.fn();
    let inst;
    act(() => {
      inst = create(React.createElement(PlatformMapViewerModal, { visible: true, platformMap, onClose }));
    });

    const closeButton = inst.root.findAllByType('TouchableOpacity')
      .find((node) => node.props.accessibilityLabel === 'Close platform map');

    act(() => closeButton.props.onPress());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('shows retry UI after image load error', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(PlatformMapViewerModal, {
        visible: true,
        platformMap,
        onClose: jest.fn(),
      }));
    });

    const image = inst.root.findByType('Image');
    act(() => image.props.onError());

    const texts = inst.root.findAllByType('Text').map((node) => node.props.children);
    expect(texts).toContain('Platform map could not be loaded.');
    expect(texts).toContain('Retry');
    expect(texts).toContain('Open source PDF');
  });
});
