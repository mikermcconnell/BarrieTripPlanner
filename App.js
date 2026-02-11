import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';
import { TransitProvider } from './src/context/TransitContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import TabNavigator from './src/navigation/TabNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { COLORS } from './src/config/theme';
import {
  registerForPushNotifications,
  addNotificationReceivedListener,
  addNotificationResponseListener,
} from './src/services/notificationService';
import logger from './src/utils/logger';

// Initialize Sentry for crash reporting (production only)
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
  enabled: !__DEV__,
  tracesSampleRate: 0.2,
});

// Configure notification handler (how notifications appear when app is foregrounded)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [user]);

  return null; // This component doesn't render anything
}

export default function App() {
  const navigationRef = useRef();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary fallbackMessage="Something went wrong with Barrie Transit. Please restart the app.">
          <AuthProvider>
            <TransitProvider>
              <NavigationContainer ref={navigationRef}>
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
