import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';
import { APP_CONFIG } from '../config/constants';
import Icon from '../components/Icon';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';
import {
  buildProfileAccountViewModel,
  buildProfileStatsViewModel,
  formatSavedTransitSummary,
} from '../utils/profileViewModel';
import { getDesktopContentFrameStyle, isWideWebViewport } from '../utils/webLayout';

const ProfileScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWideWeb = isWideWebViewport({ platform: Platform?.OS || 'ios', width });
  const isFocused = true;
  const bottomInset = useSafeBottomInset(insets.bottom);
  const {
    user,
    isAuthenticated,
    favorites = { stops: [], routes: [] },
    tripHistory = [],
    savedPlaces = [],
    savedTrips = [],
    signOut,
  } = useAuth();
  const favoriteStops = favorites?.stops || [];
  const favoriteRoutes = favorites?.routes || [];
  const accountView = buildProfileAccountViewModel({ isAuthenticated, user });
  const statsView = buildProfileStatsViewModel({
    isAuthenticated,
    favorites,
    tripHistory,
    savedPlaces,
    savedTrips,
  });

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
        },
      },
    ]);
  };

  const openAppFeedbackEmail = () => {
    const subject = encodeURIComponent('App feedback');
    const body = encodeURIComponent(
      'Tell us what happened, what you expected, and any device details that may help.\n\n'
    );
    Linking.openURL(`mailto:${APP_CONFIG.SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
  };

  const handleAppFeedback = () => {
    Alert.alert(
      'App feedback is welcome',
      'This app is new and still improving. Bug reports, confusing moments, and feature ideas are all helpful.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Share app feedback', onPress: openAppFeedbackEmail },
      ]
    );
  };

  const menuSections = [
    {
      id: 'your-transit',
      title: 'Your transit',
      items: [
        {
          id: 'favorites',
          icon: 'Star',
          title: 'My Transit',
          subtitle: formatSavedTransitSummary({
            savedPlaces,
            savedTrips,
            favoriteStops,
            favoriteRoutes,
          }),
          onPress: () => navigation.navigate('Favorites'),
        },
        {
          id: 'history',
          icon: 'Clock',
          title: 'Trip History',
          subtitle: `${tripHistory.length} recent ${tripHistory.length === 1 ? 'trip' : 'trips'}`,
          onPress: () => navigation.navigate('TripHistory'),
        },
      ],
    },
    {
      id: 'updates',
      title: 'Updates',
      items: [
        {
          id: 'alerts',
          icon: 'Warning',
          title: 'Service Alerts',
          subtitle: 'Current route and stop alerts',
          onPress: () => navigation.getParent()?.navigate('Map', { screen: 'Alerts' }),
        },
        {
          id: 'news',
          icon: 'Map',
          title: 'Transit News',
          subtitle: 'Latest Barrie Transit updates',
          onPress: () => navigation.navigate('News'),
        },
      ],
    },
    {
      id: 'app',
      title: 'App',
      items: [
        ...(isAuthenticated ? [
          {
            id: 'account',
            icon: 'User',
            title: 'Manage account',
            subtitle: 'Name, email, password, and account actions',
            onPress: () => navigation.navigate('Account'),
          },
        ] : []),
        {
          id: 'settings',
          icon: 'Settings',
          title: 'Settings',
          subtitle: 'App preferences',
          onPress: () => navigation.navigate('Settings'),
        },
        {
          id: 'help',
          icon: 'Search',
          title: 'Help & Support',
          subtitle: 'FAQ and contact',
          onPress: () => Alert.alert('Help', `For support, contact us at ${APP_CONFIG.SUPPORT_EMAIL}`),
        },
        {
          id: 'about',
          icon: 'Map',
          title: 'About',
          subtitle: `Version ${APP_CONFIG.VERSION}`,
          onPress: () => Alert.alert(APP_CONFIG.APP_NAME, `Version ${APP_CONFIG.VERSION}\n\nMade for Barrie Transit riders.`),
        },
        {
          id: 'transit-network-feedback',
          icon: 'Star',
          title: 'Transit network feedback',
          subtitle: 'Routes, stops, schedules, and service',
          onPress: () => navigation.navigate('Survey', { trigger: 'transit_network' }),
        },
        {
          id: 'app-feedback',
          icon: 'Search',
          title: 'App feedback',
          subtitle: 'Bugs, usability, or app ideas',
          onPress: handleAppFeedback,
        },
        ...(isAuthenticated ? [
          {
            id: 'sign-out',
            icon: 'Door',
            title: 'Sign out',
            subtitle: 'Stop syncing this account on this device',
            onPress: handleSignOut,
            destructive: true,
          },
        ] : []),
      ],
    },
  ];

  const renderMenuItem = (item, isLast) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.menuItem, isLast && styles.menuItemLast]}
      onPress={item.onPress}
    >
      <View style={styles.menuIcon}>
        <Icon name={item.icon} size={22} color={item.destructive ? COLORS.error : COLORS.primary} />
      </View>
      <View style={styles.menuContent}>
        <Text style={[styles.menuTitle, item.destructive && styles.destructiveMenuTitle]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.menuSubtitle} numberOfLines={2}>{item.subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  const renderMenuSection = (section) => (
    <View key={section.id} style={styles.menuSection}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <View style={styles.menuContainer}>
        {section.items.map((item, index) => renderMenuItem(item, index === section.items.length - 1))}
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={styles.container}
      accessibilityElementsHidden={!isFocused}
      importantForAccessibility={isFocused ? 'auto' : 'no-hide-descendants'}
      aria-hidden={!isFocused}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          getDesktopContentFrameStyle({ isWideWeb }),
          { paddingBottom: isWideWeb ? SPACING.xxl : addSafeBottomPadding(SPACING.lg, bottomInset) },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        {/* User Card */}
        {isAuthenticated ? (
          <View style={styles.userCard}>
            {accountView.avatarInitial ? (
              <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>{accountView.avatarInitial}</Text>
              </View>
            ) : (
              <View style={styles.profileIconContainer}>
                <Icon name="User" size={28} color={COLORS.primary} />
              </View>
            )}
            <View style={styles.userContent}>
              <Text style={styles.accountEyebrow}>{accountView.eyebrow}</Text>
              <Text style={styles.userName} numberOfLines={1}>{accountView.primaryIdentity}</Text>
              {accountView.secondaryIdentity ? (
                <Text style={styles.userEmail} numberOfLines={1}>{accountView.secondaryIdentity}</Text>
              ) : null}
              <Text style={styles.accountHelper} numberOfLines={2}>{accountView.helperText}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.loginCard}>
            <View style={styles.profileIconContainer}>
              <Icon name="User" size={28} color={COLORS.primary} />
            </View>
            <View style={styles.loginContent}>
              <Text style={styles.accountEyebrow}>{accountView.eyebrow}</Text>
              <Text style={styles.loginTitle}>{accountView.title}</Text>
              <Text style={styles.loginSubtitle}>{accountView.subtitle}</Text>
            </View>
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => navigation.navigate('SignIn')}
            >
              <Text style={styles.loginButtonText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Stats */}
        {statsView.shouldRender ? (
          statsView.isEmpty ? (
            <View style={styles.emptyStatsContainer}>
              <Icon name="Bus" size={48} color={COLORS.primary} />
              <Text style={styles.emptyStatsTitle}>Build your transit profile</Text>
              <Text style={styles.emptyStatsSubtitle}>
                Save a place, trip, stop, or route to see it here.
              </Text>
            </View>
          ) : (
            <View style={styles.statsContainer}>
              {statsView.stats.map((stat, index) => (
                <React.Fragment key={stat.id}>
                  {index > 0 ? <View style={styles.statDivider} /> : null}
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{stat.value}</Text>
                    <Text style={styles.statLabel}>{stat.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          )
        ) : null}

        {/* Feedback Invitation */}
        <View style={styles.feedbackCallout}>
          <View style={styles.feedbackCalloutIcon}>
            <Icon name="Star" size={22} color={COLORS.primary} />
          </View>
          <View style={styles.feedbackCalloutContent}>
            <Text style={styles.feedbackCalloutTitle}>Help shape My Barrie Transit</Text>
            <Text style={styles.feedbackCalloutText}>
              This app is new and we're actively improving it. Tell us what's working, what's confusing, or what you'd like to see next.
            </Text>
            <TouchableOpacity style={styles.feedbackCalloutButton} onPress={handleAppFeedback}>
              <Text style={styles.feedbackCalloutButtonText}>Share app feedback</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Menu Items */}
        {menuSections.map(renderMenuSection)}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>{APP_CONFIG.APP_NAME}</Text>
          <Text style={styles.footerVersion}>Version {APP_CONFIG.VERSION}</Text>
          <Text style={styles.footerCopyright}>© 2026 Barrie Transit</Text>
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
  scrollContent: {
    width: '100%',
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.small,
  },
  loginCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.small,
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  profileIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  avatarText: {
    fontSize: 24,
    color: COLORS.white,
    fontWeight: '700',
  },
  userContent: {
    flex: 1,
  },
  userName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  accountEyebrow: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  userEmail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  accountHelper: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  loginContent: {
    flex: 1,
  },
  loginTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  loginSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  loginButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  loginButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  emptyStatsContainer: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    ...SHADOWS.small,
  },
  emptyStatsIcon: {
    fontSize: 32,
    marginBottom: SPACING.sm,
  },
  emptyStatsTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  emptyStatsSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.small,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.xs,
  },
  feedbackCallout: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.small,
  },
  feedbackCalloutIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  feedbackCalloutContent: {
    flex: 1,
  },
  feedbackCalloutTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  feedbackCalloutText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  feedbackCalloutButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  feedbackCalloutButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  menuContainer: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.small,
    overflow: 'hidden',
  },
  menuSection: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  menuIconText: {
    fontSize: 20,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  destructiveMenuTitle: {
    color: COLORS.error,
  },
  menuSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  chevron: {
    fontSize: 24,
    color: COLORS.grey400,
    marginLeft: SPACING.sm,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  footerText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  footerVersion: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.grey500,
    marginBottom: 2,
  },
  footerCopyright: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.grey500,
  },
});

export default ProfileScreen;
