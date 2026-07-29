import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BORDER_RADIUS, COLORS, FONT_SIZES, SHADOWS, SPACING } from '../config/theme';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';
import { appFeedbackService } from '../services/appFeedbackService';

const STATUS_LABELS = { new: 'New', reviewed: 'Reviewed', resolved: 'Resolved' };

const formatDate = (value) => {
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
};

export default function AppFeedbackInboxScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);
  const [feedback, setFeedback] = useState([]);
  const [filter, setFilter] = useState('open');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [error, setError] = useState('');

  const loadFeedback = useCallback(async ({ append = false, status = 'open', cursor = null } = {}) => {
    if (append) setIsLoadingMore(true);
    else setIsLoading(true);
    setError('');
    try {
      if (!append) {
        const access = await appFeedbackService.getAccess();
        if (!access.canManage) throw new Error('Developer access is required.');
      }
      const result = await appFeedbackService.list({ limit: 50, status, cursor });
      const incoming = result.feedback || [];
      setFeedback((current) => {
        if (!append) return incoming;
        const byId = new Map(current.map((item) => [item.id, item]));
        incoming.forEach((item) => byId.set(item.id, item));
        return Array.from(byId.values());
      });
      setNextCursor(result.nextCursor || null);
    } catch (error) {
      const message = error.message || 'Please try again.';
      if (append) Alert.alert('Could not load more feedback', message);
      else setError(message);
    } finally {
      if (append) setIsLoadingMore(false);
      else setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadFeedback({ status: filter }); }, [filter, loadFeedback]);

  const visibleFeedback = useMemo(() => feedback.filter((item) => (
    filter === 'all' || (filter === 'open' ? item.status !== 'resolved' : item.status === filter)
  )), [feedback, filter]);

  const updateStatus = async (item, status) => {
    setUpdatingId(item.id);
    try {
      const result = await appFeedbackService.updateStatus(item.id, status);
      setFeedback((current) => current.map((entry) => (
        entry.id === item.id ? result.feedback : entry
      )));
    } catch (error) {
      Alert.alert('Could not update feedback', error.message || 'Please try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteFeedback = (item) => {
    Alert.alert(
      'Delete feedback?',
      'This permanently removes the submission.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setUpdatingId(item.id);
            try {
              await appFeedbackService.remove(item.id);
              await loadFeedback({ status: filter });
            } catch (error) {
              Alert.alert('Could not delete feedback', error.message || 'Please try again.');
            } finally {
              setUpdatingId(null);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.categoryPill}><Text style={styles.categoryText}>{item.category}</Text></View>
        <Text style={styles.status}>{STATUS_LABELS[item.status] || item.status}</Text>
      </View>
      <Text style={styles.message}>{item.message}</Text>
      <Text style={styles.metadata}>{formatDate(item.createdAt)} · {item.platform || 'unknown'} · v{item.appVersion || '?'}</Text>
      <View style={styles.actions}>
        {item.status === 'new' ? (
          <TouchableOpacity style={styles.secondaryButton} disabled={updatingId === item.id} onPress={() => updateStatus(item, 'reviewed')}>
            <Text style={styles.secondaryButtonText}>Mark reviewed</Text>
          </TouchableOpacity>
        ) : null}
        {item.status !== 'resolved' ? (
          <TouchableOpacity style={styles.primaryButton} disabled={updatingId === item.id} onPress={() => updateStatus(item, 'resolved')}>
            <Text style={styles.primaryButtonText}>{updatingId === item.id ? 'Saving…' : 'Resolve'}</Text>
          </TouchableOpacity>
        ) : null}
        {item.status === 'resolved' ? (
          <TouchableOpacity style={styles.deleteButton} disabled={updatingId === item.id} onPress={() => deleteFeedback(item)}>
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Back" style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Developer Feedback</Text>
        <TouchableOpacity accessibilityLabel="Refresh feedback" style={styles.backButton} onPress={() => loadFeedback({ status: filter })}>
          <Text style={styles.refreshText}>↻</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.filters}>
        {['open', 'new', 'reviewed', 'resolved', 'all'].map((status) => (
          <TouchableOpacity
            key={status}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === status }}
            style={[styles.filterButton, filter === status && styles.filterButtonSelected]}
            onPress={() => setFilter(status)}
          >
            <Text style={[styles.filterText, filter === status && styles.filterTextSelected]}>{status[0].toUpperCase() + status.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /><Text style={styles.emptyText}>Loading feedback…</Text></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Feedback unavailable</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => loadFeedback({ status: filter })}>
            <Text style={styles.primaryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visibleFeedback}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshing={isLoading}
          onRefresh={() => loadFeedback({ status: filter })}
          contentContainerStyle={[styles.list, { paddingBottom: addSafeBottomPadding(SPACING.xl, bottomInset) }, visibleFeedback.length === 0 && styles.emptyList]}
          ListEmptyComponent={<Text style={styles.emptyText}>No feedback in this view.</Text>}
          ListFooterComponent={nextCursor ? (
            <TouchableOpacity
              style={styles.loadMoreButton}
              disabled={isLoadingMore}
              onPress={() => loadFeedback({ append: true, status: filter, cursor: nextCursor })}
            >
              <Text style={styles.secondaryButtonText}>{isLoadingMore ? 'Loading…' : 'Load more'}</Text>
            </TouchableOpacity>
          ) : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backButtonText: { fontSize: 24, color: COLORS.textPrimary },
  refreshText: { fontSize: 25, color: COLORS.primary },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '600', color: COLORS.textPrimary },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: SPACING.sm, backgroundColor: COLORS.surface },
  filterButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: COLORS.background },
  filterButtonSelected: { backgroundColor: COLORS.primarySubtle },
  filterText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.xs, fontWeight: '700' },
  filterTextSelected: { color: COLORS.primary },
  list: { padding: SPACING.md },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  emptyText: { textAlign: 'center', color: COLORS.textSecondary, fontSize: FONT_SIZES.md },
  errorTitle: { color: COLORS.error, fontSize: FONT_SIZES.lg, fontWeight: '700' },
  card: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, ...SHADOWS.small },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  categoryPill: { backgroundColor: COLORS.primarySubtle, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  categoryText: { color: COLORS.primary, fontSize: FONT_SIZES.xs, fontWeight: '800', textTransform: 'uppercase' },
  status: { color: COLORS.textSecondary, fontSize: FONT_SIZES.xs, fontWeight: '700' },
  message: { color: COLORS.textPrimary, fontSize: FONT_SIZES.md, lineHeight: 22 },
  metadata: { color: COLORS.textSecondary, fontSize: FONT_SIZES.xs, marginTop: SPACING.sm },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm, marginTop: SPACING.md },
  secondaryButton: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  secondaryButtonText: { color: COLORS.primary, fontWeight: '700' },
  loadMoreButton: { alignSelf: 'center', borderWidth: 1, borderColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, marginTop: SPACING.sm },
  primaryButton: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  primaryButtonText: { color: COLORS.white, fontWeight: '700' },
  deleteButton: { borderWidth: 1, borderColor: COLORS.error, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  deleteButtonText: { color: COLORS.error, fontWeight: '700' },
});
