import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';
import { APP_CONFIG } from '../config/constants';
import Icon from '../components/Icon';

const ProfileScreen = ({ navigation }) => {
  const { user, isAuthenticated, favorites, tripHistory, signOut } = useAuth();

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

  const menuItems = [
    {
      id: 'favorites',
      icon: 'Star',
      title: 'Favorites',
      subtitle: `${favorites.stops.length} stops, ${favorites.routes.length} routes`,
      onPress: () => navigation.navigate('Favorites'),
    },
    {
      id: 'history',
      icon: 'Clock',
      title: 'Trip History',
      subtitle: `${tripHistory.length} recent trips`,
      onPress: () => Alert.alert('Coming Soon', 'Trip history details coming soon'),
    },
    {
      id: 'alerts',
      icon: 'Warning',
      title: 'Service Alerts',
      subtitle: 'View current alerts',
      onPress: () => navigation.getParent()?.navigate('Map', { screen: 'Alerts' }),
    },
    {
      id: 'news',
      icon: 'Map',
      title: 'Transit News',
      subtitle: 'Latest updates',
      onPress: () => navigation.navigate('News'),
    },
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
  ];

  const renderMenuItem = (item) => (
    <TouchableOpacity key={item.id} style={styles.menuItem} onPress={item.onPress}>
      <View style={styles.menuIcon}>
        <Icon name={item.icon} size={22} color={COLORS.primary} />
      </View>
      <View style={styles.menuContent}>
        <Text style={styles.menuTitle}>{item.title}</Text>
        <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        {/* User Card */}
        {isAuthenticated ? (
          <View style={styles.userCard}>
            {user.displayName ? (
              <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>
                  {user.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            ) : (
              <Icon name="User" size={64} color={COLORS.primary} />
            )}
            <View style={styles.userContent}>
              <Text style={styles.userName}>{user.displayName}</Text>
              <Text style={styles.userEmail}>{user.email}</Text>
            </View>
            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
              <Text style={styles.signOutButtonText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.loginCard}>
            <Icon name="User" size={64} color={COLORS.primary} />
            <View style={styles.loginContent}>
              <Text style={styles.loginTitle}>Sign in to Barrie Transit</Text>
              <Text style={styles.loginSubtitle}>Save favorites and sync across devices</Text>
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
        {favorites.stops.length === 0 && favorites.routes.length === 0 && tripHistory.length === 0 ? (
          <View style={styles.emptyStatsContainer}>
            <Icon name="Bus" size={48} color={COLORS.primary} />
            <Text style={styles.emptyStatsTitle}>Start exploring!</Text>
            <Text style={styles.emptyStatsSubtitle}>
              Save stops and plan trips to see your stats here
            </Text>
          </View>
        ) : (
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{favorites.stops.length}</Text>
              <Text style={styles.statLabel}>Saved Stops</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{favorites.routes.length}</Text>
              <Text style={styles.statLabel}>Saved Routes</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{tripHistory.length}</Text>
              <Text style={styles.statLabel}>Trips Planned</Text>
            </View>
          </View>
        )}

        {/* Menu Items */}
        <View style={styles.menuContainer}>{menuItems.map(renderMenuItem)}</View>

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
  userEmail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  signOutButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  signOutButtonText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
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
  menuContainer: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.small,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
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
