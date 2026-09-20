import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { sharedTripFirestoreService } from '../services/firebase/sharedTripFirestoreService';
import { shareTrip } from '../utils/shareUtils';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';
import { BORDER_RADIUS, COLORS, FONT_SIZES, SHADOWS, SPACING } from '../config/theme';

const formatUpdatedAt = (value) => {
  if (!value) return 'Live shared trip';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Live shared trip';
  return `Updated ${date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
};

const SharedTripScreen = ({ navigation, route }) => {
  const shareId = route?.params?.shareId;
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);
  const { addSavedTrip } = useAuth();
  const [sharedTrip, setSharedTrip] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setIsLoading(true);
    setError('');
    return sharedTripFirestoreService.subscribeToSharedTrip(
      shareId,
      (nextTrip) => {
        setSharedTrip(nextTrip);
        setError(nextTrip ? '' : 'This shared trip is no longer available.');
        setIsLoading(false);
      },
      () => {
        setError('This shared trip could not be opened. Check the link and try again.');
        setIsLoading(false);
      }
    );
  }, [shareId]);

  const trip = sharedTrip?.trip;

  const saveCopy = async () => {
    const result = await addSavedTrip(trip);
    Alert.alert(
      result?.success ? 'Saved to My Trips' : 'Could not save trip',
      result?.success ? 'This trip is now available from My Transit.' : (result?.error || 'Please try again.')
    );
  };

  const editSharedTrip = () => {
    navigation.getParent()?.navigate('Map', {
      screen: 'MapMain',
      params: {
        sharedTripToEdit: {
          shareId,
          revision: sharedTrip.revision,
          trip,
        },
      },
    });
  };

  const shareAgain = async () => {
    const result = await shareTrip(trip, shareId);
    if (result.copied) Alert.alert('Edit link copied', 'Anyone with this link can update the shared trip.');
    if (!result.success && !result.cancelled) Alert.alert('Share link', result.link);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shared Trip</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={styles.loadingText}>Opening shared trip…</Text>
        </View>
      ) : error || !trip ? (
        <View style={styles.centered}>
          <Icon name="Route" size={48} color={COLORS.grey400} />
          <Text style={styles.errorTitle}>Trip unavailable</Text>
          <Text style={styles.errorText}>{error || 'Check the link and try again.'}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: addSafeBottomPadding(SPACING.xxl, bottomInset) },
          ]}
        >
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live collaboration</Text>
          </View>

          <View style={styles.tripCard}>
            <View style={styles.tripIcon}>
              <Icon name="Route" size={24} color={COLORS.primary} />
            </View>
            <Text style={styles.tripName}>{trip.name || 'Shared trip'}</Text>
            <Text style={styles.routeText}>{trip.from?.name || 'Start'}</Text>
            <View style={styles.routeDivider} />
            <Text style={styles.routeText}>{trip.to?.name || 'Destination'}</Text>
            <Text style={styles.updatedText}>
              {formatUpdatedAt(sharedTrip.updatedAt)} · Version {sharedTrip.revision || 1}
            </Text>
          </View>

          <Text style={styles.explainer}>
            Everyone using this edit link sees the latest saved version. Update the route on the map or save your own copy.
          </Text>

          <TouchableOpacity style={styles.primaryButton} onPress={editSharedTrip} accessibilityRole="button">
            <Icon name="Map" size={19} color={COLORS.white} />
            <Text style={styles.primaryButtonText}>Edit shared trip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={saveCopy} accessibilityRole="button">
            <Icon name="Star" size={19} color={COLORS.primary} />
            <Text style={styles.secondaryButtonText}>Save a copy to My Trips</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={shareAgain} accessibilityRole="button">
            <Icon name="Route" size={19} color={COLORS.primary} />
            <Text style={styles.secondaryButtonText}>Share edit link</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backButtonText: { fontSize: 24, color: COLORS.textPrimary },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.textPrimary },
  headerSpacer: { width: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  loadingText: { marginTop: SPACING.md, color: COLORS.textSecondary, fontSize: FONT_SIZES.md },
  errorTitle: { marginTop: SPACING.md, fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.textPrimary },
  errorText: { marginTop: SPACING.xs, textAlign: 'center', color: COLORS.textSecondary, lineHeight: 21 },
  content: { padding: SPACING.lg, width: '100%', maxWidth: 640, alignSelf: 'center' },
  livePill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: COLORS.successSubtle, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.round, marginBottom: SPACING.md,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  liveText: { color: COLORS.ctaGreen, fontWeight: '700', fontSize: FONT_SIZES.sm },
  tripCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.xl, ...SHADOWS.small },
  tripIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primarySubtle,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md,
  },
  tripName: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.textPrimary, marginBottom: SPACING.lg },
  routeText: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.textPrimary, lineHeight: 24 },
  routeDivider: { width: 2, height: 24, backgroundColor: COLORS.primary, marginLeft: 8, marginVertical: 5 },
  updatedText: { marginTop: SPACING.lg, color: COLORS.textSecondary, fontSize: FONT_SIZES.sm },
  explainer: { marginVertical: SPACING.lg, color: COLORS.textSecondary, fontSize: FONT_SIZES.md, lineHeight: 22 },
  primaryButton: {
    minHeight: 50, borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginBottom: SPACING.sm,
  },
  primaryButtonText: { color: COLORS.white, fontWeight: '800', fontSize: FONT_SIZES.md },
  secondaryButton: {
    minHeight: 50, borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: SPACING.sm, marginBottom: SPACING.sm,
  },
  secondaryButtonText: { color: COLORS.primary, fontWeight: '700', fontSize: FONT_SIZES.md },
});

export default SharedTripScreen;
