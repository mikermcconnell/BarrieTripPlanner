import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';
import { APP_CONFIG } from '../config/constants';
import Icon from '../components/Icon';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';
import { buildProfileAccountViewModel } from '../utils/profileViewModel';

const AccountScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);
  const { user, isAuthenticated, sendPasswordReset, signOut } = useAuth();
  const accountView = buildProfileAccountViewModel({ isAuthenticated, user });
  const email = user?.email || '';

  const handlePasswordReset = async () => {
    if (!email) {
      Alert.alert('Password reset unavailable', 'No email address is attached to this account.');
      return;
    }

    const result = await sendPasswordReset(email);
    if (result?.success) {
      Alert.alert('Password reset sent', 'Check your email for reset instructions.');
    } else {
      Alert.alert('Password reset failed', result?.error || 'Could not send reset instructions.');
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          navigation.goBack();
        },
      },
    ]);
  };

  const renderActionRow = ({ icon, title, subtitle, onPress, destructive = false }) => (
    <TouchableOpacity style={styles.actionRow} onPress={onPress}>
      <View style={styles.actionIcon}>
        <Icon name={icon} size={22} color={destructive ? COLORS.error : COLORS.primary} />
      </View>
      <View style={styles.actionContent}>
        <Text style={[styles.actionTitle, destructive && styles.destructiveText]}>{title}</Text>
        {subtitle ? <Text style={styles.actionSubtitle}>{subtitle}</Text> : null}
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
        <Text style={styles.headerTitle}>Account</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: addSafeBottomPadding(SPACING.lg, bottomInset) }}
        showsVerticalScrollIndicator={false}
      >
        {isAuthenticated ? (
          <>
            <View style={styles.accountCard}>
              <View style={styles.avatarContainer}>
                {accountView.avatarInitial ? (
                  <Text style={styles.avatarText}>{accountView.avatarInitial}</Text>
                ) : (
                  <Icon name="User" size={28} color={COLORS.white} />
                )}
              </View>
              <View style={styles.accountContent}>
                <Text style={styles.accountEyebrow}>{accountView.eyebrow}</Text>
                <Text style={styles.accountName} numberOfLines={1}>{accountView.primaryIdentity}</Text>
                {accountView.secondaryIdentity ? (
                  <Text style={styles.accountEmail} numberOfLines={1}>{accountView.secondaryIdentity}</Text>
                ) : null}
                <Text style={styles.accountHelper}>{accountView.helperText}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Account actions</Text>
              <View style={styles.sectionContent}>
                {renderActionRow({
                  icon: 'User',
                  title: 'Account details',
                  subtitle: email || 'No email on this account',
                  onPress: () => Alert.alert('Account details', email ? `Signed in as ${email}` : 'No email address is attached to this account.'),
                })}
                {renderActionRow({
                  icon: 'Settings',
                  title: 'Reset password',
                  subtitle: 'Send reset instructions to your email',
                  onPress: handlePasswordReset,
                })}
                {renderActionRow({
                  icon: 'Door',
                  title: 'Sign out',
                  subtitle: 'Stop syncing this account on this device',
                  onPress: handleSignOut,
                  destructive: true,
                })}
              </View>
            </View>

            <View style={styles.helpCard}>
              <Text style={styles.helpTitle}>Need to change or delete your account?</Text>
              <Text style={styles.helpText}>
                Contact support at {APP_CONFIG.SUPPORT_EMAIL}. Include the email shown above so we can find the right account.
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.accountCard}>
            <View style={styles.avatarContainerMuted}>
              <Icon name="User" size={28} color={COLORS.primary} />
            </View>
            <View style={styles.accountContent}>
              <Text style={styles.accountEyebrow}>{accountView.eyebrow}</Text>
              <Text style={styles.accountName}>{accountView.title}</Text>
              <Text style={styles.accountHelper}>{accountView.subtitle}</Text>
              <TouchableOpacity style={styles.signInButton} onPress={() => navigation.navigate('SignIn')}>
                <Text style={styles.signInButtonText}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
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
  accountCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    margin: SPACING.md,
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
  avatarContainerMuted: {
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
  accountContent: {
    flex: 1,
  },
  accountEyebrow: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  accountName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  accountEmail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  accountHelper: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  section: {
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
  sectionContent: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.small,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  destructiveText: {
    color: COLORS.error,
  },
  chevron: {
    fontSize: 24,
    color: COLORS.grey400,
    marginLeft: SPACING.sm,
  },
  helpCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.small,
  },
  helpTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  helpText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  signInButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
  },
  signInButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
});

export default AccountScreen;
