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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getNotificationSettings,
  saveNotificationSettings,
  registerForPushNotifications,
  getNotificationPermissionStatus,
} from '../services/notificationService';
import { getCacheSize, clearCache } from '../utils/offlineCache';
import { useAuth } from '../context/AuthContext';
import { useTransitRealtime, useTransitStatic } from '../context/TransitContext';
import { userFirestoreService } from '../services/firebase/userFirestoreService';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';
import { APP_CONFIG } from '../config/constants';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';
import { openAppContactEmail, openExternalUrl, openTransitContactEmail } from '../utils/externalLinks';

const SettingsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);
  const { user, isAuthenticated } = useAuth();
  const { routes } = useTransitStatic();
  const { detoursEnabled, setDetoursEnabled } = useTransitRealtime();
  const [notificationSettings, setNotificationSettings] = useState({
    serviceAlerts: false,
    tripReminders: false,
    transitNews: false,
  });
  const [subscribedRoutes, setSubscribedRoutes] = useState([]);
  const [cacheInfo, setCacheInfo] = useState({ sizeFormatted: 'Calculating...' });

  useEffect(() => {
    loadSettings();
    loadCacheInfo();
    if (isAuthenticated && user) {
      loadSubscribedRoutes();
    }
  }, [isAuthenticated, user]);

  const loadSettings = async () => {
    const [settings, permission] = await Promise.all([
      getNotificationSettings(),
      getNotificationPermissionStatus(),
    ]);
    if (!permission.granted) {
      const disabled = Object.fromEntries(Object.keys(settings).map((key) => [key, false]));
      await saveNotificationSettings(disabled);
      if (isAuthenticated && user) await userFirestoreService.updateNotificationSettings(user.uid, disabled);
      setNotificationSettings(disabled);
      return;
    }
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
    const isAddingRoute = !subscribedRoutes.includes(routeId);
    const updated = subscribedRoutes.includes(routeId)
      ? subscribedRoutes.filter((r) => r !== routeId)
      : [...subscribedRoutes, routeId];
    setSubscribedRoutes(updated);
    const saveResult = await userFirestoreService.updateSubscribedRoutes(user.uid, updated);
    if (!saveResult.success) {
      setSubscribedRoutes(subscribedRoutes);
      Alert.alert('Could not update routes', saveResult.error || 'Please try again.');
      return;
    }

    if (isAddingRoute && !notificationSettings.transitNews) {
      Alert.alert(
        'Turn on Transit News?',
        'Select routes here, then turn on Transit News to receive push alerts.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Turn on',
            onPress: () => {
              void handleNotificationToggle('transitNews');
            },
          },
        ]
      );
    }
  };

  const handleNotificationToggle = async (key) => {
    const enabling = !notificationSettings[key];
    if (enabling) {
      const result = await registerForPushNotifications();
      if (!result.success) {
        Alert.alert('Could not turn on notifications', result.error || 'Please try again.');
        return;
      }
      if (isAuthenticated && user && result.token) {
        const tokenResult = await userFirestoreService.updatePushToken(user.uid, result.token, result.deviceId);
        if (!tokenResult.success) {
          Alert.alert('Could not save notification setup', tokenResult.error || 'Please try again.');
          return;
        }
      }
    }

    const newSettings = {
      ...notificationSettings,
      [key]: enabling,
    };
    const localResult = await saveNotificationSettings(newSettings);
    if (!localResult.success) {
      Alert.alert('Could not update notifications', localResult.error || 'Please try again.');
      return;
    }
    if (isAuthenticated && user) {
      const remoteResult = await userFirestoreService.updateNotificationSettings(user.uid, newSettings);
      if (!remoteResult.success) {
        await saveNotificationSettings(notificationSettings);
        Alert.alert('Could not update notifications', remoteResult.error || 'Please try again.');
        return;
      }
    }
    setNotificationSettings(newSettings);
  };

  const handleDetourToggle = async (enabled) => {
    const result = await setDetoursEnabled(enabled);
    if (!result.success) {
      Alert.alert('Could not update detour setting', result.error || 'Please try again.');
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
            const result = await clearCache();
            if (!result.success) {
              Alert.alert('Could not clear cache', result.error || 'Please try again.');
              return;
            }
            await loadCacheInfo();
            Alert.alert('Cache', 'Cache cleared.');
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

  const renderInfoRow = (icon, label, description) => (
    <View style={styles.actionRow}>
      <Text style={styles.actionIcon}>{icon}</Text>
      <View style={styles.actionContent}>
        <Text style={styles.actionLabel}>{label}</Text>
        {description && <Text style={styles.actionDescription}>{description}</Text>}
      </View>
    </View>
  );

  const openConfiguredLink = async (url, title) => {
    const result = await openExternalUrl(url);
    if (!result.success) Alert.alert(`Could not open ${title}`, result.error);
  };

  const contactBarrieTransit = async () => {
    const result = await openTransitContactEmail({ body: 'Please describe your Barrie Transit service question.\n' });
    if (!result.success) Alert.alert('Could not open email', `${result.error}\n\nEmail ${APP_CONFIG.TRANSIT_CONTACT_EMAIL}`);
  };

  const contactAppSupport = async () => {
    const result = await openAppContactEmail({ body: 'Please describe the app issue or question.\n' });
    if (!result.success) Alert.alert('Could not open email', `${result.error}\n\nEmail ${APP_CONFIG.APP_CONTACT_EMAIL}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: addSafeBottomPadding(SPACING.lg, bottomInset) }}
        showsVerticalScrollIndicator={false}
      >
        {renderSection(
          'Notifications',
          <>
            {renderToggleRow(
              'Service Alerts',
              'Push alerts for qualifying detours and major holiday service changes',
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
              'Transit News',
              'Push only for watched routes or major system-wide updates',
              notificationSettings.transitNews,
              () => handleNotificationToggle('transitNews')
            )}
          </>
        )}

        {isAuthenticated && renderSection(
          'Notification Routes',
          <View style={styles.routeChipsContainer}>
            <Text style={styles.routeChipsHint}>
              {!notificationSettings.transitNews
                ? 'Select routes here, then turn on Transit News to receive push alerts.'
                : subscribedRoutes.length === 0
                  ? 'No routes selected. Major system-wide updates may still send push alerts.'
                  : `You’ll get push alerts for ${subscribedRoutes.length} selected route${subscribedRoutes.length !== 1 ? 's' : ''} and major system-wide updates.`}
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
          'Map Display',
          renderToggleRow(
            'Show Detours',
            'Show or hide detour banners, route markers, and map overlays.',
            detoursEnabled,
            handleDetourToggle
          )
        )}

        {renderSection(
          'Data & Storage',
          <>
            {renderInfoRow('💾', 'Cache Size', cacheInfo.sizeFormatted)}
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
            {renderInfoRow('🔤', 'Text Size', 'Uses your device text size settings')}
          </>
        )}

        {renderSection(
          'About',
          <>
            {renderInfoRow('ℹ️', 'Version', APP_CONFIG.BUILD_NUMBER ? `${APP_CONFIG.VERSION} (${APP_CONFIG.BUILD_NUMBER})` : APP_CONFIG.VERSION)}
            {renderActionRow(
              '📜',
              'Terms of Service',
              null,
              () => openConfiguredLink(APP_CONFIG.TERMS_URL, 'Terms of Service'),
              false
            )}
            {renderActionRow(
              '🔒',
              'Privacy Policy',
              null,
              () => openConfiguredLink(APP_CONFIG.PRIVACY_URL, 'Privacy Policy'),
              false
            )}
            {renderActionRow(
              '🗑️',
              'Account deletion information',
              null,
              () => openConfiguredLink(APP_CONFIG.ACCOUNT_DELETION_URL, 'Account deletion information'),
              false
            )}
            {renderActionRow(
              '📧',
              'Contact App Support',
              APP_CONFIG.APP_CONTACT_EMAIL,
              contactAppSupport,
              false
            )}
            {renderActionRow(
              '🚌',
              'Contact Barrie Transit',
              APP_CONFIG.TRANSIT_CONTACT_EMAIL,
              contactBarrieTransit,
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
