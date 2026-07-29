import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_CONFIG } from '../config/constants';
import { BORDER_RADIUS, COLORS, FONT_SIZES, SHADOWS, SPACING } from '../config/theme';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';
import { openExternalUrl } from '../utils/externalLinks';

export default function AboutScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);
  const openLink = async (url) => {
    const result = await openExternalUrl(url);
    if (!result.success) Alert.alert('Could not open link', result.error);
  };
  const version = APP_CONFIG.BUILD_NUMBER ? `${APP_CONFIG.VERSION} (${APP_CONFIG.BUILD_NUMBER})` : APP_CONFIG.VERSION;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Back" style={styles.backButton} onPress={() => navigation.goBack()}><Text style={styles.backButtonText}>←</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>About</Text><View style={styles.placeholder} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: addSafeBottomPadding(SPACING.xl, bottomInset) }]}>
        <View style={styles.card}>
          <Text style={styles.title}>{APP_CONFIG.APP_NAME}</Text>
          <Text style={styles.version}>Version {version}</Text>
          <Text style={styles.body}>Trip planning and real-time transit information for Barrie Transit riders.</Text>
          <Text style={styles.disclaimer}>Independent app. Not affiliated with, endorsed by, or operated by the City of Barrie or Barrie Transit.</Text>
          <Text style={styles.attribution}>Transit data is provided by Barrie Transit. Map data © OpenStreetMap contributors.</Text>
        </View>
        <TouchableOpacity style={styles.row} onPress={() => openLink(APP_CONFIG.TRANSIT_URL)}><Text style={styles.rowText}>Barrie Transit website</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => openLink(APP_CONFIG.TERMS_URL)}><Text style={styles.rowText}>Terms of Service</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => openLink(APP_CONFIG.PRIVACY_URL)}><Text style={styles.rowText}>Privacy Policy</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => openLink(APP_CONFIG.ACCOUNT_DELETION_URL)}><Text style={styles.rowText}>Account deletion information</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => openLink(`mailto:${APP_CONFIG.APP_CONTACT_EMAIL}`)}><Text style={styles.rowText}>Contact app support</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
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
  card: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.small },
  title: { fontSize: FONT_SIZES.xxl, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center' },
  version: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: SPACING.lg },
  body: { fontSize: FONT_SIZES.md, color: COLORS.textPrimary, lineHeight: 22, textAlign: 'center' },
  disclaimer: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, lineHeight: 20, textAlign: 'center', marginTop: SPACING.md },
  attribution: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, lineHeight: 20, textAlign: 'center', marginTop: SPACING.md },
  row: { minHeight: 56, backgroundColor: COLORS.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  rowText: { flex: 1, fontSize: FONT_SIZES.md, color: COLORS.textPrimary, fontWeight: '600' },
  chevron: { fontSize: 22, color: COLORS.grey400 },
});
