import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getNotificationSettings,
  saveNotificationSettings,
  registerForPushNotifications,
} from '../services/notificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCacheSize, clearCache } from '../utils/offlineCache';
import { useAuth } from '../context/AuthContext';
import { useTransit } from '../context/TransitContext';
import { userFirestoreService } from '../services/firebase/userFirestoreService';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';
import { APP_CONFIG, ONBOARDING_KEY } from '../config/constants';

const SettingsScreen = ({ navigation }) => {
  const { user, isAuthenticated } = useAuth();
  const { routes } = useTransit();
  const [notificationSettings, setNotificationSettings] = useState({
    serviceAlerts: true,
    tripReminders: true,
    nearbyAlerts: false,
    transitNews: true,
  });
  const [subscribedRoutes, setSubscribedRoutes] = useState([]);
  const [cacheInfo, setCacheInfo] = useState({ sizeFormatted: 'Calculating...' });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadSettings();
    loadCacheInfo();
    if (isAuthenticated && user) {
      loadSubscribedRoutes();
    }
  }, [isAuthenticated, user]);

  const loadSettings = async () => {
    const settings = await getNotificationSettings();
    setNotificationSettings(settings);
  };

  const loadCacheInfo = async () => {
    const info = await getCacheSize();
    setCacheInfo(info);
  };

  const loadSubscribedRoutes = async () => {
    if (!user) return;
    const userData = await userFirestoreService.getUser(user.uid);
    if (userData?.subscribedRoutes) {
      setSubscribedRoutes(userData.subscribedRoutes);
    }
  };

  const handleRouteToggle = async (routeId) => {
    if (!user) return;
    const updated = subscribedRoutes.includes(routeId)
      ? subscribedRoutes.filter((r) => r !== routeId)
      : [...subscribedRoutes, routeId];
    setSubscribedRoutes(updated);
    await userFirestoreService.updateSubscribedRoutes(user.uid, updated);
  };

  const handleNotificationToggle = async (key) => {
    const newSettings = {
      ...notificationSettings,
      [key]: !notificationSettings[key],
    };
    setNotificationSettings(newSettings);
    await saveNotificationSettings(newSettings);
  };

  const handleEnableNotifications = async () => {
    setIsLoading(true);
    const result = await registerForPushNotifications();
    setIsLoading(false);

    if (result.success) {
      Alert.alert('Success', 'Push notifications enabled successfully!');
    } else {
      Alert.alert('Error', result.error || 'Could not enable notifications');
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will remove all cached transit data. The app will need to download data again when you use it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearCache();
            loadCacheInfo();
            Alert.alert('Done', 'Cache cleared successfully');
          },
        },
      ]
    );
  };

  const renderSection = (title, children) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );

  const renderToggleRow = (label, description, value, onToggle) => (
    <View style={styles.toggleRow}>
      <View style={styles.toggleContent}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {description && <Text style={styles.toggleDescription}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.grey300, true: COLORS.primaryLight }}
        thumbColor={value ? COLORS.primary : COLORS.grey400}
      />
    </View>
  );

  const renderActionRow = (icon, label, description, onPress, destructive = false) => (
    <TouchableOpacity style={styles.actionRow} onPress={onPress}>
      <Text style={styles.actionIcon}>{icon}</Text>
      <View style={styles.actionContent}>
        <Text style={[styles.actionLabel, destructive && styles.destructiveText]}>{label}</Text>
        {description && <Text style={styles.actionDescription}>{description}</Text>}
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {renderSection(
          'Notifications',
          <>
            {renderToggleRow(
              'Service Alerts',
              'Get notified about delays and disruptions',
              notificationSettings.serviceAlerts,
              () => handleNotificationToggle('serviceAlerts')
            )}
            {renderToggleRow(
              'Trip Reminders',
              'Reminders before your scheduled trips',
              notificationSettings.tripReminders,
              () => handleNotificationToggle('tripReminders')
            )}
            {renderToggleRow(
              'Nearby Alerts',
              'Alerts for stops near your location',
              notificationSettings.nearbyAlerts,
              () => handleNotificationToggle('nearbyAlerts')
            )}
            {renderToggleRow(
              'Transit News',
              'Get notified about transit news updates',
              notificationSettings.transitNews,
              () => handleNotificationToggle('transitNews')
            )}
            <TouchableOpacity
              style={styles.enableButton}
              onPress={handleEnableNotifications}
              disabled={isLoading}
            >
              <Text style={styles.enableButtonText}>
                {isLoading ? 'Enabling...' : 'Enable Push Notifications'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {isAuthenticated && renderSection(
          'Route Subscriptions',
          <View style={styles.routeChipsContainer}>
            <Text style={styles.routeChipsHint}>
              {subscribedRoutes.length === 0
                ? 'No routes selected — you will receive all transit news'
                : `Receiving news for ${subscribedRoutes.length} route${subscribedRoutes.length !== 1 ? 's' : ''}`}
            </Text>
            <View style={styles.routeChipsRow}>
              {routes.map((route) => {
                const isSelected = subscribedRoutes.includes(route.id);
                return (
                  <TouchableOpacity
                    key={route.id}
                    style={[
                      styles.routeChip,
                      isSelected && styles.routeChipSelected,
                    ]}
                    onPress={() => handleRouteToggle(route.id)}
                  >
                    <Text
                      style={[
                        styles.routeChipText,
                        isSelected && styles.routeChipTextSelected,
                      ]}
                    >
                      {route.shortName || route.id}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {renderSection(
          'Data & Storage',
          <>
            {renderActionRow(
              '💾',
              'Cache Size',
              cacheInfo.sizeFormatted,
              () => {},
              false
            )}
            {renderActionRow(
              '🗑️',
              'Clear Cache',
              'Remove downloaded transit data',
              handleClearCache,
              true
            )}
          </>
        )}

        {renderSection(
          'Accessibility',
          <>
            {renderActionRow(
              '🔤',
              'Text Size',
              'Use system text size settings',
              () => Alert.alert('Info', 'Text size follows your device settings'),
              false
            )}
            {renderActionRow(
              '🎨',
              'High Contrast',
              'Improved visibility for map elements',
              () => Alert.alert('Coming Soon', 'This feature is in development'),
              false
            )}
            {renderActionRow(
              '🎓',
              'Replay Tutorial',
              'See the app walkthrough again',
              async () => {
                await AsyncStorage.removeItem(ONBOARDING_KEY);
                Alert.alert('Tutorial Reset', 'The tutorial will show next time you open the app.');
              },
              false
            )}
          </>
        )}

        {renderSection(
          'About',
          <>
            {renderActionRow('ℹ️', 'Version', APP_CONFIG.VERSION, () => {}, false)}
            {renderActionRow(
              '📜',
              'Terms of Service',
              null,
              () => Alert.alert('Terms of Service', 'Coming soon'),
              false
            )}
            {renderActionRow(
              '🔒',
              'Privacy Policy',
              null,
              () => Alert.alert('Privacy Policy', 'Coming soon'),
              false
            )}
            {renderActionRow(
              '📧',
              'Contact Support',
              APP_CONFIG.SUPPORT_EMAIL,
              () => Alert.alert('Support', `Email us at ${APP_CONFIG.SUPPORT_EMAIL}`),
              false
            )}
          </>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Made with ❤️ for Barrie Transit riders
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.textPrimary,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
  },
  sectionContent: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    marginHorizontal: SPACING.md,
    ...SHADOWS.small,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  toggleContent: {
    flex: 1,
    marginRight: SPACING.md,
  },
  toggleLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  toggleDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  enableButton: {
    backgroundColor: COLORS.primary,
    margin: SPACING.md,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  enableButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  actionIcon: {
    fontSize: 20,
    marginRight: SPACING.md,
  },
  actionContent: {
    flex: 1,
  },
  actionLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  actionDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  destructiveText: {
    color: COLORS.error,
  },
  chevron: {
    fontSize: 20,
    color: COLORS.grey400,
  },
  routeChipsContainer: {
    padding: SPACING.md,
  },
  routeChipsHint: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  routeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  routeChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.grey300,
    backgroundColor: COLORS.surface,
  },
  routeChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  routeChipText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  routeChipTextSelected: {
    color: COLORS.white,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  footerText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.grey500,
  },
});

export default SettingsScreen;
