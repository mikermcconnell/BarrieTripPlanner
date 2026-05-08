import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import { Platform, View, ActivityIndicator, StyleSheet, Text } from 'react-native';
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
import ErrorBoundary from './src/components/ErrorBoundary';
import { COLORS } from './src/config/theme';
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
          MapMain: '',
        },
      },
    },
  },
};

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

export default function App() {
  const navigationRef = useRef();

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });

  useEffect(() => {
    const uninstallDiagnostics = installStartupDiagnostics();

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

  if (!fontsLoaded) {
    return (
      <View style={appStyles.splash}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={appStyles.splashTitle}>Starting My Barrie Transit</Text>
        <Text style={appStyles.splashDetail}>Loading live buses, stops, and trip options.</Text>
      </View>
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
  splashTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  splashDetail: {
    marginTop: 6,
    fontSize: 14,
    color: COLORS.textSecondary,
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
