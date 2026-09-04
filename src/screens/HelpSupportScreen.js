import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_CONFIG } from '../config/constants';
import { BORDER_RADIUS, COLORS, FONT_SIZES, SHADOWS, SPACING } from '../config/theme';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';
import { openAppContactEmail, openTransitContactPage } from '../utils/externalLinks';

const FAQS = [
  ['Saved transit', 'Sign in to sync saved places, trips, stops, and routes across devices.'],
  ['Service information', 'Service alerts and transit news use Barrie Transit data. Pull down on supported lists to refresh.'],
  ['Trip planning', 'Check the trip date, time, origin, and destination, then try again if no itinerary is available.'],
];

export default function HelpSupportScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);

  const contactBarrieTransit = async () => {
    const result = await openTransitContactPage();
    if (!result.success) {
      Alert.alert('Could not open Service Barrie', `${result.error}\n\nEmail ${APP_CONFIG.TRANSIT_CONTACT_EMAIL}`);
    }
  };

  const contactAppSupport = () => navigation.navigate('AppFeedback', { source: 'help_support' });

  const emailAppSupport = async () => {
    const result = await openAppContactEmail({
      body: 'Please describe the app issue or question.\n',
    });
    if (!result.success) {
      Alert.alert('Could not open email', `${result.error}\n\nEmail ${APP_CONFIG.APP_CONTACT_EMAIL}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Back" style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={styles.placeholder} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: addSafeBottomPadding(SPACING.xl, bottomInset) }]}>
        <View style={styles.card}>
          <Text style={styles.title}>How can we help?</Text>
          <Text style={styles.body}>Contact the independent developer or share private feedback for app issues. For fares, schedules, service, or other Barrie Transit questions, contact Service Barrie.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={contactAppSupport}>
            <Text style={styles.primaryButtonText}>Contact app support</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={emailAppSupport}>
            <Text style={styles.secondaryButtonText}>Email app support</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={contactBarrieTransit}>
            <Text style={styles.secondaryButtonText}>Contact Barrie Transit</Text>
          </TouchableOpacity>
          <Text style={styles.email}>App: {APP_CONFIG.APP_CONTACT_EMAIL}</Text>
          <Text style={styles.email}>Barrie Transit: {APP_CONFIG.TRANSIT_CONTACT_EMAIL}</Text>
        </View>
        <Text style={styles.sectionTitle}>Common questions</Text>
        {FAQS.map(([title, body]) => (
          <View key={title} style={styles.faqCard}>
            <Text style={styles.faqTitle}>{title}</Text>
            <Text style={styles.body}>{body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backButtonText: { fontSize: 24, color: COLORS.textPrimary },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '600', color: COLORS.textPrimary },
  placeholder: { width: 40 },
  content: { padding: SPACING.md },
  card: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, ...SHADOWS.small },
  title: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.textPrimary, marginBottom: SPACING.sm },
  body: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, lineHeight: 22 },
  primaryButton: { marginTop: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, alignItems: 'center' },
  primaryButtonText: { color: COLORS.white, fontWeight: '700', fontSize: FONT_SIZES.md },
  secondaryButton: { marginTop: SPACING.sm, borderWidth: 1, borderColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, alignItems: 'center' },
  secondaryButtonText: { color: COLORS.primary, fontWeight: '700', fontSize: FONT_SIZES.md },
  email: { textAlign: 'center', color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, marginTop: SPACING.md },
  sectionTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', textTransform: 'uppercase', color: COLORS.textSecondary, marginBottom: SPACING.sm },
  faqCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.small },
  faqTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
});
