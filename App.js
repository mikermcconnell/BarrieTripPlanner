import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import StartupLoadingScreen from './src/components/StartupLoadingScreen';

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
  const showPreview = shouldShowStartupLoadingPreview();

  useEffect(() => {
    if (Runtime || showPreview) {
      return undefined;
    }

    let cancelled = false;
    const mountRuntime = () => {
      setTimeout(() => {
        loadRuntime()
          .then((Loaded) => {
            if (!cancelled) {
              setRuntime(() => Loaded);
            }
          })
          .catch(() => {
            if (!cancelled) {
              setRuntime(null);
            }
          });
      }, 0);
    };

    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      document.readyState !== 'complete'
    ) {
      window.addEventListener('load', mountRuntime, { once: true });
      return () => {
        cancelled = true;
        window.removeEventListener('load', mountRuntime);
      };
    }

    mountRuntime();

    return () => {
      cancelled = true;
    };
  }, [Runtime, showPreview]);

  if (showPreview || !Runtime) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor="#ffffff" />
        <StartupLoadingScreen useBrandFonts={false} />
      </SafeAreaProvider>
    );
  }

  return <Runtime />;
}
