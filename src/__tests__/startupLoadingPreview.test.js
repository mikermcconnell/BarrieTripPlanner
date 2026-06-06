const fs = require('fs');
const path = require('path');

global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  Image: 'Image',
  Platform: { OS: 'web' },
  StyleSheet: { create: (styles) => styles },
  StatusBar: { currentHeight: 24 },
  Text: 'Text',
  View: 'View',
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn(() => ({ localUri: 'file:///cached-startup-image.png' })),
  },
}));

const StartupLoadingScreen = require('../components/StartupLoadingScreen').default;

describe('startup loading preview', () => {
  function flattenStyle(style) {
    if (Array.isArray(style)) {
      return style.reduce((merged, item) => ({
        ...merged,
        ...flattenStyle(item),
      }), {});
    }

    return style || {};
  }

  test('renders simplified one-line startup copy and progress state', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(StartupLoadingScreen));
    });

    const texts = inst.root
      .findAllByType('Text')
      .map((node) => Array.isArray(node.props.children)
        ? node.props.children.join('')
        : node.props.children)
      .filter((value) => typeof value === 'string');

    expect(texts).toContain('MyBarrie Transit');
    expect(texts).toContain('Loading routes, stops, and live updates');
    expect(texts).not.toContain('Good to go soon');
    expect(texts).not.toContain('Getting Barrie Transit ready');
    expect(texts).not.toContain('Loading routes, stops, live buses, and detour updates.');
    expect(texts).toContain('Live Detour Awareness');
    expect(texts).toContain('We check live bus movement to inform you of possible detours.');
    expect(texts).toContain('Checking service alerts and detours...');
    expect(texts).toContain('65%');
  });

  test('shows bundled startup artwork immediately without waiting for image-load events', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(StartupLoadingScreen));
    });

    const artworkImages = inst.root
      .findAllByType('Image')
      .filter((node) => node.props.resizeMode === 'contain');

    expect(artworkImages).toHaveLength(2);
    artworkImages.forEach((node) => {
      expect(flattenStyle(node.props.style).opacity).not.toBe(0);
    });
  });

  test('uses cached local image URIs when startup artwork was preloaded', () => {
    const { Asset } = require('expo-asset');
    const { Platform } = require('react-native');
    const originalPlatform = Platform.OS;
    Asset.fromModule.mockClear();
    Platform.OS = 'android';

    let inst;

    try {
      act(() => {
        inst = create(React.createElement(StartupLoadingScreen, { preferPreloadedImages: true }));
      });
    } finally {
      Platform.OS = originalPlatform;
    }

    const imageSources = inst.root
      .findAllByType('Image')
      .map((node) => node.props.source);

    expect(Asset.fromModule).toHaveBeenCalled();
    expect(imageSources).toEqual(
      expect.arrayContaining([
        { uri: 'file:///cached-startup-image.png' },
      ])
    );
  });

  test('App.js exposes the web-only preview query flag without replacing normal startup', () => {
    const appSource = fs.readFileSync(path.join(__dirname, '../../App.js'), 'utf8');
    const componentSource = fs.readFileSync(path.join(__dirname, '../components/StartupLoadingScreen.js'), 'utf8');
    const nativeHomeSource = fs.readFileSync(path.join(__dirname, '../screens/HomeScreen.js'), 'utf8');
    const webHomeSource = fs.readFileSync(path.join(__dirname, '../screens/HomeScreen.web.js'), 'utf8');

    expect(appSource).toContain("get('preview') === 'startup-loading'");
    expect(appSource).toContain('<StartupLoadingScreen');
    expect(appSource).not.toContain('STARTUP_LOADING_MIN_MS');
    expect(appSource).toContain('STARTUP_OPTIONAL_LOADING_MAX_MS = 12000');
    expect(appSource).toContain('STARTUP_EXIT_FADE_MS = 260');
    expect(appSource).not.toContain('STARTUP_IMAGE_PRELOAD_MAX_MS');
    expect(appSource).toContain('SplashScreen.preventAutoHideAsync()');
    expect(appSource).toContain('Asset.loadAsync(STARTUP_IMAGE_ASSETS)');
    expect(appSource).toContain('Image.prefetch(uri)');
    expect(appSource).toContain('SplashScreen.hideAsync()');
    expect(appSource).toContain('preferPreloadedImages={startupImagesReady}');
    expect(appSource).toContain('startupLoadingLayoutReady');
    expect(appSource).toContain('onStartupLoadingLayout');
    expect(appSource).not.toContain('minimumStartupElapsed');
    expect(appSource).toContain('AppStartupGate');
    expect(appSource).toContain('getAppStartupState');
    expect(appSource).toContain('ensureRoutingData');
    expect(appSource).toContain('startupOverlay');
    expect(appSource).toContain('<Animated.View');
    expect(appSource).toContain("logger.info('[startup] phase'");
    expect(appSource).toContain("logger.info('[startup] ready'");
    expect(appSource).toContain('<NavigationContainer ref={navigationRef} linking={linking}>');
    expect(appSource).toContain('{showStartupOverlay ? (');
    expect(appSource).toContain("Platform.OS !== 'web'");
    expect(componentSource).toContain("require('../../assets/splash-icon.png')");
    expect(componentSource).toContain("require('../../assets/startup-home-scene.png')");
    expect(componentSource).toContain("require('../../assets/startup-detour-card.png')");
    expect(componentSource).toContain('STARTUP_IMAGE_ASSETS');
    expect(componentSource).toContain('getStartupImageSource');
    expect(componentSource).toContain('onReadyToDisplay');
    expect(componentSource).not.toContain('FallbackHeroScene');
    expect(componentSource).not.toContain('FallbackMiniMap');
    expect(componentSource).not.toContain('onError={() => setImageFailed(true)}');
    expect(componentSource).toContain('heroHeight');
    expect(componentSource).toContain('miniMapHeight');
    expect(componentSource).toContain("from '../utils/androidNavigationBar'");
    expect(componentSource).toContain('useSafeBottomInset');
    expect(componentSource).toContain('paddingBottom: progressBottomPadding');
    expect(componentSource).not.toContain("minHeight: '100%'");
    expect(nativeHomeSource).toContain('<StartupLoadingScreen');
    expect(webHomeSource).toContain('<StartupLoadingScreen');
  });
});
