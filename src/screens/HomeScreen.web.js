import React, { useEffect, useState } from 'react';
import StartupLoadingScreen from '../components/StartupLoadingScreen';

let LoadedHomeScreen = null;

const loadHomeScreen = async () => {
  if (!LoadedHomeScreen) {
    LoadedHomeScreen = (await import('./HomeScreen.web.impl')).default;
  }

  return LoadedHomeScreen;
};

export default function HomeScreenWebShell(props) {
  const [HomeScreenImpl, setHomeScreenImpl] = useState(() => LoadedHomeScreen);

  useEffect(() => {
    if (HomeScreenImpl) {
      return undefined;
    }

    let cancelled = false;
    const mountImplementation = () => {
      setTimeout(() => {
        loadHomeScreen()
          .then((Screen) => {
            if (!cancelled) {
              setHomeScreenImpl(() => Screen);
            }
          })
          .catch(() => {
            if (!cancelled) {
              setHomeScreenImpl(null);
            }
          });
      }, 0);
    };

    if (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      document.readyState !== 'complete'
    ) {
      window.addEventListener('load', mountImplementation, { once: true });
      return () => {
        cancelled = true;
        window.removeEventListener('load', mountImplementation);
      };
    }

    mountImplementation();

    return () => {
      cancelled = true;
    };
  }, [HomeScreenImpl]);

  if (!HomeScreenImpl) {
    return <StartupLoadingScreen percent={35} statusText="Loading map..." />;
  }

  return <HomeScreenImpl {...props} />;
}
