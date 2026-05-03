import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';
import { formatDuration, formatDistance } from '../services/tripService';
import Icon from '../components/Icon';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';

const formatTripDate = (value) => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getTripSummary = (item) => {
  const summary = item.summary || item.itineraries?.[0] || {};
  const parts = [];

  if (summary.duration) {
    parts.push(formatDuration(summary.duration));
  }
  if (Number.isFinite(summary.transfers)) {
    parts.push(`${summary.transfers} transfer${summary.transfers === 1 ? '' : 's'}`);
  }
  if (summary.walkDistance) {
    parts.push(`${formatDistance(summary.walkDistance)} walk`);
  }

  return parts.length ? parts.join(' • ') : 'Trip planned';
};

const TripHistoryScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);
  const { tripHistory, clearTripHistory } = useAuth();

  const handleClearHistory = () => {
    Alert.alert(
      'Clear trip history?',
      'This removes your saved trip searches from this device/account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: clearTripHistory,
        },
      ]
    );
  };

  const renderItem = ({ item }) => (
    <View style={styles.tripCard}>
      <View style={styles.tripIcon}>
        <Icon name="Route" size={22} color={COLORS.primary} />
      </View>
      <View style={styles.tripContent}>
        <Text style={styles.tripRoute} numberOfLines={2}>
          {item.from?.name || 'Start'} → {item.to?.name || 'Destination'}
        </Text>
        <Text style={styles.tripMeta}>{getTripSummary(item)}</Text>
        <Text style={styles.tripDate}>{formatTripDate(item.searchedAt)}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip History</Text>
        {tripHistory.length > 0 ? (
          <TouchableOpacity style={styles.clearButton} onPress={handleClearHistory}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>

      <FlatList
        data={tripHistory}
        keyExtractor={(item, index) => item.id || `${item.searchedAt || 'trip'}-${index}`}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: addSafeBottomPadding(SPACING.xl, bottomInset) },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="Clock" size={56} color={COLORS.grey400} />
            <Text style={styles.emptyTitle}>No trip history yet</Text>
            <Text style={styles.emptySubtitle}>
              Planned trips will show up here so you can quickly review recent searches.
            </Text>
          </View>
        }
      />
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
  clearButton: {
    minWidth: 40,
    alignItems: 'flex-end',
    paddingVertical: SPACING.xs,
  },
  clearButtonText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  placeholder: {
    width: 40,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  tripCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.small,
  },
  tripIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primarySubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  tripContent: {
    flex: 1,
  },
  tripRoute: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  tripMeta: {
    marginTop: 4,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  tripDate: {
    marginTop: 3,
    fontSize: FONT_SIZES.xs,
    color: COLORS.grey500,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  emptyTitle: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  emptySubtitle: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
});

export default TripHistoryScreen;
