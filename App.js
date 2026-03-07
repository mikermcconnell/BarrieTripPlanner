import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import { Platform, View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';
import { TransitProvider } from './src/context/TransitContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import TabNavigator from './src/navigation/TabNavigator';
import OnboardingScreen from './src/screens/OnboardingScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import { COLORS } from './src/config/theme';
import { ONBOARDING_KEY } from './src/config/constants';
import {
  registerForPushNotifications,
  addNotificationReceivedListener,
  addNotificationResponseListener,
} from './src/services/notificationService';
import { userFirestoreService } from './src/services/firebase/userFirestoreService';
import logger from './src/utils/logger';
import { installStartupDiagnostics, recordStartupFatal } from './src/utils/startupDiagnostics';
import runtimeConfig, { hasCriticalStartupIssues } from './src/config/runtimeConfig';

const STARTUP_ENV_ISSUES = runtimeConfig.startup.criticalIssues;

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
  const notificationListener = useRef();
  const responseListener = useRef();
  const { user } = useAuth();

  useEffect(() => {
    // Only register for push notifications on physical devices
    async function setupNotifications() {
      try {
        if (Device.isDevice) {
          const result = await registerForPushNotifications();
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
      notificationListener.current = addNotificationReceivedListener((notification) => {
        logger.log('Notification received:', notification);
      });
    } catch (listenerError) {
      logger.error('Failed to register notification listener:', listenerError);
    }

    // Listener for when user taps on a notification
    try {
      responseListener.current = addNotificationResponseListener((response) => {
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
          MapMain: 'stop/:stopId',
        },
      },
    },
  },
};

function StartupConfigErrorScreen({ issues }) {
  return (
    <View style={appStyles.configErrorContainer}>
      <Text style={appStyles.configErrorTitle}>Configuration Error</Text>
      <Text style={appStyles.configErrorMessage}>
        This build is missing required production configuration. Update EAS env vars and rebuild.
      </Text>
      <Text style={appStyles.configErrorMessage}>Detected issues:</Text>
      <View style={appStyles.configErrorList}>
        {issues.map((issue, index) => (
          <Text key={`${index}-${issue}`} style={appStyles.configErrorItem}>
            - {issue}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function App() {
  const navigationRef = useRef();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });

  useEffect(() => {
    const uninstallDiagnostics = installStartupDiagnostics();

    (async () => {
      try {
        const seen = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (!seen) setShowOnboarding(true);
      } catch {
        // If storage fails, skip onboarding
      } finally {
        setOnboardingChecked(true);
      }
    })();

    return () => {
      if (typeof uninstallDiagnostics === 'function') {
        uninstallDiagnostics();
      }
    };
  }, []);

  if (hasCriticalStartupIssues) {
    return (
      <SafeAreaProvider>
        <StartupConfigErrorScreen issues={STARTUP_ENV_ISSUES} />
      </SafeAreaProvider>
    );
  }

  const handleOnboardingComplete = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {
      // Non-critical
    }
    setShowOnboarding(false);
  };

  if (!onboardingChecked || !fontsLoaded) {
    return (
      <View style={appStyles.splash}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (showOnboarding) {
    return (
      <SafeAreaProvider>
        <OnboardingScreen onComplete={handleOnboardingComplete} />
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
                <NavigationContainer ref={navigationRef} linking={linking}>
                  <StatusBar style="dark" backgroundColor={COLORS.surface} />
                  <NotificationInitializer navigationRef={navigationRef} />
                  <TabNavigator />
                </NavigationContainer>
              </TransitProvider>
            </AuthProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const appStyles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  configErrorContainer: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  configErrorTitle: {
    fontSize: 24,
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
