const fs = require('fs');
const path = require('path');

global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  Image: 'Image',
  Platform: { OS: 'web' },
  StyleSheet: { create: (styles) => styles },
  Text: 'Text',
  View: 'View',
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

const StartupLoadingScreen = require('../components/StartupLoadingScreen').default;

describe('startup loading preview', () => {
  test('renders the mock-up copy and progress state', () => {
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
    expect(texts).toContain('Good to go soon');
    expect(texts).toContain('Getting Barrie Transit ready');
    expect(texts).toContain('Loading routes, stops, live buses, and detour updates.');
    expect(texts).toContain('Live detour awareness');
    expect(texts).toContain('We check live bus movement to inform you of possible detours.');
    expect(texts).toContain('Checking service alerts and detours...');
    expect(texts).toContain('65%');
  });

  test('App.js exposes the web-only preview query flag without replacing normal startup', () => {
    const appSource = fs.readFileSync(path.join(__dirname, '../../App.js'), 'utf8');
    const componentSource = fs.readFileSync(path.join(__dirname, '../components/StartupLoadingScreen.js'), 'utf8');
    const nativeHomeSource = fs.readFileSync(path.join(__dirname, '../screens/HomeScreen.js'), 'utf8');
    const webHomeSource = fs.readFileSync(path.join(__dirname, '../screens/HomeScreen.web.js'), 'utf8');

    expect(appSource).toContain("get('preview') === 'startup-loading'");
    expect(appSource).toContain('<StartupLoadingScreen');
    expect(appSource).toContain('STARTUP_LOADING_MIN_MS = 3000');
    expect(appSource).toContain('STARTUP_OPTIONAL_LOADING_MAX_MS = 12000');
    expect(appSource).toContain('STARTUP_EXIT_FADE_MS = 260');
    expect(appSource).toContain('minimumStartupElapsed');
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
    expect(componentSource).toContain("require('../../assets/startup-home-scene.png')");
    expect(componentSource).toContain("require('../../assets/startup-detour-card.png')");
    expect(componentSource).toContain('FallbackHeroScene');
    expect(componentSource).toContain('FallbackMiniMap');
    expect(componentSource).toContain('onError={() => setImageFailed(true)}');
    expect(componentSource).toContain('heroHeight');
    expect(componentSource).toContain('miniMapHeight');
    expect(componentSource).not.toContain("minHeight: '100%'");
    expect(nativeHomeSource).toContain('<StartupLoadingScreen');
    expect(webHomeSource).toContain('<StartupLoadingScreen');
  });
});
