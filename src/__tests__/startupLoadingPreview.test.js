const fs = require('fs');
const path = require('path');

global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');
let mockWindowDimensions = { width: 390, height: 844 };

jest.mock('react-native', () => {
  class MockAnimatedValue {
    interpolate() { return 0; }
  }

  return {
    Animated: { Value: MockAnimatedValue, View: 'AnimatedView' },
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    Image: 'Image',
    Platform: { OS: 'web' },
    StyleSheet: { create: (styles) => styles },
    StatusBar: { currentHeight: 24 },
    Text: 'Text',
    View: 'View',
    useWindowDimensions: () => mockWindowDimensions,
  };
});

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn(() => ({ localUri: 'file:///cached-startup-image.png' })),
  },
}));

jest.mock('../components/StartupDetourAnimation', () => {
  const ReactForMock = require('react');
  return {
    __esModule: true,
    default: ({ imageSource, width, height }) => ReactForMock.createElement('Image', {
      source: imageSource,
      resizeMode: 'cover',
      width,
      height,
    }),
  };
});

const StartupLoadingScreen = require('../components/StartupLoadingScreen').default;

describe('startup loading preview', () => {
  function flattenText(value) {
    if (Array.isArray(value)) return value.map(flattenText).join('');
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (value?.props) return flattenText(value.props.children);
    return '';
  }

  function componentSourceText(root) {
    return root.findAllByType('Text').map((node) => flattenText(node.props.children)).join(' ');
  }

  function flattenStyle(style) {
    if (Array.isArray(style)) {
      return style.reduce((merged, item) => ({
        ...merged,
        ...flattenStyle(item),
      }), {});
    }

    return style || {};
  }

  test('makes automatic detour detection the primary startup message', () => {
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
    expect(texts).toContain('AUTOMATIC DETOUR DETECTION');
    expect(componentSourceText(inst.root)).toContain('See likely detours.');
    expect(componentSourceText(inst.root)).toContain('Avoid skipped stops.');
    expect(texts).toContain('Powered by live bus movement.');
    expect(componentSourceText(inst.root)).not.toContain('Live bus movement helps flag likely detours and skipped stops.');
    expect(texts).not.toContain('Know when your bus leaves the route.');
    expect(texts).toContain('Likely detour detected');
    expect(texts).toContain('Route change identified from live bus movement');
    expect(texts).toContain('Checking live routes and service alerts...');
    expect(texts).toContain('65%');
  });

  test('shows bundled startup artwork immediately without waiting for image-load events', () => {
    let inst;

    act(() => {
      inst = create(React.createElement(StartupLoadingScreen));
    });

    const artworkImages = inst.root
      .findAllByType('Image')
      .filter((node) => node.props.resizeMode === 'cover');

    expect(artworkImages).toHaveLength(1);
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

  test('scales the animated map down on very compact screens', () => {
    mockWindowDimensions = { width: 320, height: 640 };
    let inst;

    try {
      act(() => {
        inst = create(React.createElement(StartupLoadingScreen));
      });

      const artwork = inst.root
        .findAllByType('Image')
        .find((node) => node.props.resizeMode === 'cover');

      expect(artwork.props.width).toBeLessThanOrEqual(272);
      expect(artwork.props.height).toBeLessThan(170);
    } finally {
      mockWindowDimensions = { width: 390, height: 844 };
    }
  });

  test('App.js exposes the web-only preview query flag without replacing normal startup', () => {
    const appSource = fs.readFileSync(path.join(__dirname, '../../App.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../../AppRuntime.js'), 'utf8');
    const componentSource = fs.readFileSync(path.join(__dirname, '../components/StartupLoadingScreen.js'), 'utf8');
    const animationSource = fs.readFileSync(path.join(__dirname, '../components/StartupDetourAnimation.js'), 'utf8');
    const nativeHomeSource = fs.readFileSync(path.join(__dirname, '../screens/HomeScreen.js'), 'utf8');
    const webHomeSource = fs.readFileSync(path.join(__dirname, '../screens/HomeScreen.web.impl.js'), 'utf8');

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
    expect(componentSource).toContain("require('../../assets/startup-auto-detour-map-base.png')");
    expect(componentSource).toContain('STARTUP_IMAGE_ASSETS');
    expect(componentSource).toContain('getStartupImageSource');
    expect(componentSource).toContain('onReadyToDisplay');
    expect(componentSource).not.toContain('FallbackHeroScene');
    expect(componentSource).not.toContain('FallbackMiniMap');
    expect(componentSource).not.toContain('onError={() => setImageFailed(true)}');
    expect(componentSource).toContain('imageHeight');
    expect(componentSource).toContain('DetectionHero');
    expect(componentSource).toContain('<StartupDetourAnimation');
    expect(animationSource).toContain('AccessibilityInfo?.isReduceMotionEnabled?.()');
    expect(animationSource).toContain('Animated.loop');
    expect(animationSource).toContain('strokeDashoffset={animationStyles.pathOffset}');
    expect(componentSource).toContain("from '../utils/androidNavigationBar'");
    expect(componentSource).toContain('useSafeBottomInset');
    expect(componentSource).toContain('paddingBottom: progressBottomPadding');
    expect(componentSource).not.toContain("minHeight: '100%'");
    expect(nativeHomeSource).toContain('<StartupLoadingScreen');
    expect(webHomeSource).toContain('<StartupLoadingScreen');
  });
});
