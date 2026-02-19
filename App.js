import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import { Platform, View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
} from '@expo-google-fonts/nunito';
import { TransitProvider } from './src/context/TransitContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
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
import logger from './src/utils/logger';

// Validate critical environment variables in production
if (!__DEV__) {
  const requiredVars = [
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  ];
  const missing = requiredVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Initialize Sentry for crash reporting (production only)
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    enabled: !__DEV__,
    tracesSampleRate: 0.2,
  });
}

// Configure notification handler (how notifications appear when app is foregrounded)
// Only set on native — expo-notifications has limited web support
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
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
      if (Device.isDevice) {
        const result = await registerForPushNotifications();
        if (result.success) {
          logger.log('Push token registered:', result.token);

          // If user is authenticated, you could store the token in Firestore here
          // This would be used for server-triggered push notifications
          if (user && result.token) {
            // Future: Store token in Firestore for backend push notifications
            // await storeTokenInFirestore(user.uid, result.token);
          }
        } else {
          logger.log('Push notification registration failed:', result.error);
        }
      } else {
        logger.log('Push notifications require a physical device');
      }
    }

    setupNotifications();

    // Listener for notifications received while app is foregrounded
    notificationListener.current = addNotificationReceivedListener((notification) => {
      logger.log('Notification received:', notification);
    });

    // Listener for when user taps on a notification
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
          default:
            // Default: just open the app (already handled by tapping)
            break;
        }
      }
    });

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

export default function App() {
  const navigationRef = useRef();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

  useEffect(() => {
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
  }, []);

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
});
