import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { Asset } from 'expo-asset';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import StartupLoadingScreen, {
  STARTUP_BACKGROUND_COLOR,
  STARTUP_IMAGE_ASSETS,
} from './src/components/StartupLoadingScreen';

const STARTUP_EXIT_FADE_MS = 140;

if (Platform.OS !== 'web') {
  const SplashScreen = require('expo-splash-screen');

  SplashScreen.preventAutoHideAsync().catch(() => {
    // The in-app startup overlay still protects the handoff if the native hold is unavailable.
  });
}

// Warm bundled startup artwork as soon as the native splash is secured. This runs
// alongside normal startup and is never awaited, so it cannot hold the rider back.
const startupImagePreload = Platform.OS === 'web'
  ? Promise.resolve(false)
  : Asset.loadAsync(STARTUP_IMAGE_ASSETS).then(() => true).catch(() => false);

let LoadedRuntime = null;

const loadRuntime = async () => {
  if (!LoadedRuntime) {
    LoadedRuntime = (await import('./AppRuntime')).default;
  }

  return LoadedRuntime;
};

export function shouldShowStartupLoadingPreview() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window?.location?.search) {
    return false;
  }

  return new URLSearchParams(window.location.search).get('preview') === 'startup-loading';
}

export default function App() {
  const [Runtime, setRuntime] = useState(() => LoadedRuntime);
  const [runtimeLoadFailed, setRuntimeLoadFailed] = useState(false);
  const [startupState, setStartupState] = useState(null);
  const [startupImagesReady, setStartupImagesReady] = useState(false);
  const [showStartupOverlay, setShowStartupOverlay] = useState(true);
  const startupOverlayOpacity = useRef(new Animated.Value(1)).current;
  const showPreview = shouldShowStartupLoadingPreview();

  const hideNativeSplash = useCallback(() => {
    if (Platform.OS === 'web') return;

    const SplashScreen = require('expo-splash-screen');
    SplashScreen.hideAsync().catch(() => {
      // The in-app startup overlay is already visible, so there is nothing else to recover.
    });
  }, []);

  useEffect(() => {
    let active = true;
    startupImagePreload.then((ready) => {
      if (active && ready) setStartupImagesReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (Runtime || showPreview) {
      return undefined;
    }

    let cancelled = false;
    loadRuntime()
      .then((Loaded) => {
        if (!cancelled) {
          setRuntime(() => Loaded);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeLoadFailed(true);
          setRuntime(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [Runtime, showPreview]);

  useEffect(() => {
    if (!startupState?.ready) {
      setShowStartupOverlay(true);
      startupOverlayOpacity.stopAnimation();
      startupOverlayOpacity.setValue(1);
      return undefined;
    }

    startupOverlayOpacity.stopAnimation();
    Animated.timing(startupOverlayOpacity, {
      toValue: 0,
      duration: STARTUP_EXIT_FADE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setShowStartupOverlay(false);
    });

    return () => startupOverlayOpacity.stopAnimation();
  }, [startupOverlayOpacity, startupState?.ready]);

  if (showPreview) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={STARTUP_BACKGROUND_COLOR} />
        <StartupLoadingScreen useBrandFonts={false} onReadyToDisplay={hideNativeSplash} />
      </SafeAreaProvider>
    );
  }

  return (
    <View style={styles.container}>
      {Runtime ? <Runtime onStartupStateChange={setStartupState} /> : null}
      {showStartupOverlay ? (
        <Animated.View
          pointerEvents={startupState?.ready ? 'none' : 'auto'}
          style={[styles.startupOverlay, { opacity: startupOverlayOpacity }]}
        >
          <SafeAreaProvider style={styles.container}>
            <StatusBar style="dark" backgroundColor={STARTUP_BACKGROUND_COLOR} />
            <StartupLoadingScreen
              percent={runtimeLoadFailed ? 0 : startupState?.percent}
              statusText={runtimeLoadFailed
                ? 'Barrie Transit could not open. Please restart the app.'
                : startupState?.statusText}
              showProgress={!runtimeLoadFailed}
              useBrandFonts={false}
              preferPreloadedImages={startupImagesReady}
              onReadyToDisplay={hideNativeSplash}
            />
          </SafeAreaProvider>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  startupOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: STARTUP_BACKGROUND_COLOR,
  },
});
