import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { Animated, Image, Platform, View, StyleSheet, Text } from 'react-native';
import { useFonts } from 'expo-font';
import { TransitProvider, useTransitRealtime, useTransitStatic } from './src/context/TransitContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import TabNavigator from './src/navigation/TabNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import StartupLoadingScreen, { STARTUP_IMAGE_ASSETS } from './src/components/StartupLoadingScreen';
import { COLORS } from './src/config/theme';
import { userFirestoreService } from './src/services/firebase/userFirestoreService';
import logger from './src/utils/logger';
import { installStartupDiagnostics, recordStartupFatal } from './src/utils/startupDiagnostics';
import runtimeConfig, { hasCriticalStartupIssues } from './src/config/runtimeConfig';
import { getAppStartupState } from './src/utils/appStartupState';

const STARTUP_ENV_ISSUES = runtimeConfig.startup.criticalIssues;
const STARTUP_OPTIONAL_LOADING_MAX_MS = 12000;
const STARTUP_EXIT_FADE_MS = 260;
const APP_FONT_MAP = Platform.OS === 'web'
  ? {}
  : (() => {
      const {
        Outfit_400Regular,
        Outfit_500Medium,
        Outfit_600SemiBold,
        Outfit_700Bold,
      } = require('@expo-google-fonts/outfit');

      return {
        Outfit_400Regular,
        Outfit_500Medium,
        Outfit_600SemiBold,
        Outfit_700Bold,
      };
    })();

if (Platform.OS !== 'web') {
  const SplashScreen = require('expo-splash-screen');

  SplashScreen.preventAutoHideAsync().catch((error) => {
    logger.warn('[startup] native splash hold failed', {
      message: error?.message || String(error),
    });
  });
}

if (hasCriticalStartupIssues) {
  logger.error(`[StartupConfig] ${STARTUP_ENV_ISSUES.join(' | ')}`);
}

runtimeConfig.startup.followUpIssues.forEach((issue) => {
  logger.warn(`[StartupConfig] ${issue}`);
});

if (!runtimeConfig.proxy.apiBaseUrl && !runtimeConfig.isProductionLike) {
  logger.warn(
    '[StartupConfig] EXPO_PUBLIC_API_PROXY_URL is not set. Geocoding and walking directions may be unavailable until proxy URL is configured.'
  );
}

// Initialize Sentry for crash reporting (production only)
const sentryDsn = runtimeConfig.sentry.dsn;
if (sentryDsn) {
  const Sentry = require('@sentry/react-native');

  Sentry.init({
    dsn: sentryDsn,
    enabled: !runtimeConfig.isDevelopment,
    tracesSampleRate: 0.2,
  });

  if (hasCriticalStartupIssues) {
    Sentry.captureMessage(`Startup config issues: ${STARTUP_ENV_ISSUES.join(' | ')}`, 'error');
  }
}

// Configure notification handler (how notifications appear when app is foregrounded)
// Only set on native — expo-notifications has limited web support
if (Platform.OS !== 'web') {
  const Notifications = require('expo-notifications');

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * NotificationInitializer - Handles push notification setup and listeners
 * Must be inside NavigationContainer to access navigation
 */
function NotificationInitializer({ navigationRef }) {
  if (Platform.OS === 'web') {
    return null;
  }

  const notificationListener = useRef();
  const responseListener = useRef();
  const { user } = useAuth();

  useEffect(() => {
    const Device = require('expo-device');
    const {
      registerForPushNotifications,
      addNotificationReceivedListener: addNativeNotificationReceivedListener,
      addNotificationResponseListener: addNativeNotificationResponseListener,
    } = require('./src/services/notificationService');

    // Only register for push notifications on physical devices
    async function setupNotifications() {
      try {
        if (Device.isDevice) {
          const result = await registerForPushNotifications({ requestPermission: false });
          if (result.success) {
            logger.log('Push token registered:', result.token);

            if (user && result.token) {
              try {
                await userFirestoreService.updatePushToken(user.uid, result.token);
              } catch (tokenError) {
                logger.error('Failed to save push token:', tokenError);
              }
            }
          } else {
            logger.log('Push notification registration failed:', result.error);
          }
        } else {
          logger.log('Push notifications require a physical device');
        }
      } catch (error) {
        recordStartupFatal({ error, origin: 'notification-init' });
        logger.error('Notification setup failed:', error);
      }
    }

    void setupNotifications();

    // Listener for notifications received while app is foregrounded
    try {
      notificationListener.current = addNativeNotificationReceivedListener((notification) => {
        logger.log('Notification received:', notification);
      });
    } catch (listenerError) {
      logger.error('Failed to register notification listener:', listenerError);
    }

    // Listener for when user taps on a notification
    try {
      responseListener.current = addNativeNotificationResponseListener((response) => {
        logger.log('Notification tapped:', response);

        const data = response.notification.request.content.data;

        // Handle deep linking based on notification type
        if (navigationRef.current) {
          switch (data?.type) {
            case 'trip_reminder':
              // Navigate to Map tab (contains MapMain/HomeScreen)
              navigationRef.current.navigate('Map', { screen: 'MapMain' });
              break;
            case 'service_alert':
            case 'detour_alert':
              // Navigate to Alerts screen within the Map stack
              navigationRef.current.navigate('Map', { screen: 'Alerts' });
              break;
            case 'transit_news':
              navigationRef.current.navigate('Profile', { screen: 'News' });
              break;
            default:
              // Default: just open the app (already handled by tapping)
              break;
          }
        }
      });
    } catch (responseListenerError) {
      logger.error('Failed to register notification response listener:', responseListenerError);
    }

    // Cleanup listeners on unmount
    return () => {
      if (notificationListener.current?.remove) {
        notificationListener.current.remove();
      }
      if (responseListener.current?.remove) {
        responseListener.current.remove();
      }
    };
  }, [user]);

  return null; // This component doesn't render anything
}

const linking = {
  prefixes: ['barrie-transit://'],
  config: {
    screens: {
      Map: {
        screens: {
          MapMain: '',
        },
      },
    },
  },
};

export function shouldShowStartupLoadingPreview() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window?.location?.search) {
    return false;
  }

  return new URLSearchParams(window.location.search).get('preview') === 'startup-loading';
}

function StartupConfigErrorScreen({ issues }) {
  return (
    <View style={appStyles.configErrorContainer}>
      <View style={appStyles.configErrorCard}>
        <Text style={appStyles.configErrorIcon}>🚌</Text>
        <Text style={appStyles.configErrorTitle}>We can’t start the app yet</Text>
        <Text style={appStyles.configErrorMessage}>
          This build is missing a required setup step. Please install the latest build or contact support.
        </Text>
        <Text style={appStyles.configErrorSupport}>
          Support code: app configuration incomplete
        </Text>
        <Text style={appStyles.configErrorDetailTitle}>Technical details</Text>
        <View style={appStyles.configErrorList}>
          {issues.map((issue, index) => (
            <Text key={`${index}-${issue}`} style={appStyles.configErrorItem}>
              - {issue}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function AppStartupGate({
  fontsLoaded,
  navigationRef,
  startupImagesReady = false,
  onStartupLoadingLayout,
}) {
  const routingPreloadRequestedRef = useRef(false);
  const startupStartedAtRef = useRef(Date.now());
  const startupPhaseRef = useRef(null);
  const startupReadyLoggedRef = useRef(false);
  const overlayOpacityRef = useRef(new Animated.Value(1));
  const [optionalWaitElapsed, setOptionalWaitElapsed] = useState(false);
  const [showStartupOverlay, setShowStartupOverlay] = useState(true);
  const { isLoading: authLoading } = useAuth();
  const {
    routes,
    stops,
    isLoadingStatic,
    staticError,
    isOffline,
    isRoutingReady,
    ensureRoutingData,
    diagnostics,
  } = useTransitStatic();
  const {
    lastVehicleUpdate,
    isLoadingVehicles,
    vehicleError,
    hasLoadedServiceAlerts,
    hasLoadedDetourFeed,
  } = useTransitRealtime();

  useEffect(() => {
    const timer = setTimeout(() => {
      setOptionalWaitElapsed(true);
    }, STARTUP_OPTIONAL_LOADING_MAX_MS);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const hasStaticData = routes.length > 0 && stops.length > 0;
    const routingStatus = diagnostics?.routing?.status;

    if (
      !hasStaticData ||
      isOffline ||
      isRoutingReady ||
      routingPreloadRequestedRef.current ||
      routingStatus === 'loading'
    ) {
      return;
    }

    routingPreloadRequestedRef.current = true;
    void ensureRoutingData();
  }, [
    diagnostics?.routing?.status,
    ensureRoutingData,
    isOffline,
    isRoutingReady,
    routes.length,
    stops.length,
  ]);

  const startupState = getAppStartupState({
    fontsLoaded,
    authLoading,
    isLoadingStatic,
    staticError,
    routesCount: routes.length,
    stopsCount: stops.length,
    isOffline,
    isRoutingReady,
    lastVehicleUpdate,
    isLoadingVehicles,
    vehicleError,
    hasLoadedServiceAlerts,
    hasLoadedDetourFeed,
    diagnostics,
    optionalWaitElapsed,
  });
  const startupPhase = startupState.ready ? 'ready' : (startupState.statusText || startupState.detail || 'loading');

  useEffect(() => {
    if (startupPhaseRef.current === startupPhase) return;
    startupPhaseRef.current = startupPhase;

    logger.info('[startup] phase', {
      phase: startupPhase,
      elapsedMs: Date.now() - startupStartedAtRef.current,
      percent: startupState.percent,
      ready: startupState.ready,
    });
  }, [startupPhase, startupState.percent, startupState.ready]);

  useEffect(() => {
    if (!optionalWaitElapsed || startupState.ready) return;

    logger.warn('[startup] optional wait cap reached; opening with available startup data', {
      elapsedMs: Date.now() - startupStartedAtRef.current,
      routingStatus: diagnostics?.routing?.status || 'unknown',
      realtimeStatus: diagnostics?.realtimeVehicles?.status || 'unknown',
      proxyStatus: diagnostics?.proxyApi?.status || 'unknown',
      hasLoadedServiceAlerts,
      hasLoadedDetourFeed,
    });
  }, [
    diagnostics?.proxyApi?.status,
    diagnostics?.realtimeVehicles?.status,
    diagnostics?.routing?.status,
    hasLoadedDetourFeed,
    hasLoadedServiceAlerts,
    optionalWaitElapsed,
    startupState.ready,
  ]);

  useEffect(() => {
    const overlayOpacity = overlayOpacityRef.current;

    if (!startupState.ready) {
      startupReadyLoggedRef.current = false;
      setShowStartupOverlay(true);
      overlayOpacity.stopAnimation();
      overlayOpacity.setValue(1);
      return undefined;
    }

    if (!startupReadyLoggedRef.current) {
      startupReadyLoggedRef.current = true;
      logger.info('[startup] ready', {
        elapsedMs: Date.now() - startupStartedAtRef.current,
        optionalWaitElapsed,
        routes: routes.length,
        stops: stops.length,
      });
    }

    overlayOpacity.stopAnimation();
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: STARTUP_EXIT_FADE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setShowStartupOverlay(false);
      }
    });

    return () => {
      overlayOpacity.stopAnimation();
    };
  }, [optionalWaitElapsed, routes.length, startupState.ready, stops.length]);

  return (
    <View style={appStyles.startupGateContainer}>
      <NavigationContainer ref={navigationRef} linking={linking}>
        <StatusBar style="dark" backgroundColor={COLORS.surface} />
        <NotificationInitializer navigationRef={navigationRef} />
        <TabNavigator />
      </NavigationContainer>
      {showStartupOverlay ? (
        <Animated.View
          pointerEvents={startupState.ready ? 'none' : 'auto'}
          style={[
            appStyles.startupOverlay,
            { opacity: overlayOpacityRef.current },
          ]}
        >
          <StatusBar style="dark" backgroundColor={COLORS.surface} />
          <StartupLoadingScreen
            percent={startupState.percent}
            title={startupState.title}
            detail={startupState.detail}
            statusText={startupState.statusText}
            useBrandFonts={fontsLoaded}
            preferPreloadedImages={startupImagesReady}
            onReadyToDisplay={onStartupLoadingLayout}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

export default function App() {
  const navigationRef = useRef();
  const [startupImagesReady, setStartupImagesReady] = useState(Platform.OS === 'web');
  const [startupLoadingLayoutReady, setStartupLoadingLayoutReady] = useState(
    Platform.OS === 'web' || hasCriticalStartupIssues
  );

  const [fontsLoaded] = useFonts(APP_FONT_MAP);

  useEffect(() => {
    const uninstallDiagnostics = installStartupDiagnostics();

    return () => {
      if (typeof uninstallDiagnostics === 'function') {
        uninstallDiagnostics();
      }
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return undefined;
    }

    let cancelled = false;
    const { Asset } = require('expo-asset');

    Asset.loadAsync(STARTUP_IMAGE_ASSETS)
      .then((assets) => Promise.all(
        assets
          .map((asset) => asset.localUri || asset.uri)
          .filter(Boolean)
          .map((uri) => Image.prefetch(uri).catch(() => false))
      ))
      .catch((error) => {
        logger.warn('[startup] startup image preload failed', {
          message: error?.message || String(error),
        });
      })
      .finally(() => {
        if (!cancelled) {
          setStartupImagesReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    if (!startupImagesReady || !startupLoadingLayoutReady) {
      return;
    }

    const SplashScreen = require('expo-splash-screen');

    SplashScreen.hideAsync().catch((error) => {
      logger.warn('[startup] native splash hide failed', {
        message: error?.message || String(error),
      });
    });
  }, [startupImagesReady, startupLoadingLayoutReady]);

  if (hasCriticalStartupIssues) {
    return (
      <SafeAreaProvider>
        <StartupConfigErrorScreen issues={STARTUP_ENV_ISSUES} />
      </SafeAreaProvider>
    );
  }

  if (shouldShowStartupLoadingPreview()) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={COLORS.surface} />
        <StartupLoadingScreen useBrandFonts={fontsLoaded} />
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <ErrorBoundary fallbackMessage="Something went wrong with Barrie Transit. Please restart the app.">
            <AuthProvider>
              <TransitProvider>
                <AppStartupGate
                  fontsLoaded={fontsLoaded}
                  navigationRef={navigationRef}
                  startupImagesReady={startupImagesReady}
                  onStartupLoadingLayout={() => setStartupLoadingLayoutReady(true)}
                />
              </TransitProvider>
            </AuthProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const appStyles = StyleSheet.create({
  startupGateContainer: {
    flex: 1,
  },
  startupOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: COLORS.white,
  },
  configErrorContainer: {
    flex: 1,
    backgroundColor: COLORS.primarySubtle,
    paddingHorizontal: 20,
    paddingVertical: 32,
    justifyContent: 'center',
  },
  configErrorCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 6,
  },
  configErrorIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  configErrorTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  configErrorMessage: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  configErrorSupport: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.primaryDark,
    backgroundColor: COLORS.primarySubtle,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  configErrorDetailTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  configErrorList: {
    marginTop: 8,
    rowGap: 8,
  },
  configErrorItem: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textPrimary,
  },
});
