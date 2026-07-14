import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import DetourReviewMap from '../components/DetourReviewMap';
import Icon from '../components/Icon';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';
import { detourReviewService } from '../services/detourReviewService';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';

const STATUS_FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'uncertain', label: 'Uncertain' },
  { value: 'all', label: 'All' },
];
const VISIBILITY_FILTERS = [
  { value: 'rider', label: 'Rider-visible' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'all', label: 'All detections' },
];
const DETECTION_OPTIONS = [
  { value: 'true-positive', label: 'Real detour', tone: 'success' },
  { value: 'false-positive', label: 'False detection', tone: 'error' },
  { value: 'uncertain', label: 'Uncertain', tone: 'warning' },
];
const QUALITY_OPTIONS = [
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'not-applicable', label: 'N/A' },
];
const EVIDENCE_OPTIONS = [
  { value: 'official-notice', label: 'Official notice' },
  { value: 'operator-knowledge', label: 'Operator knowledge' },
  { value: 'gps-map', label: 'GPS/map evidence' },
  { value: 'service-control', label: 'Service control' },
  { value: 'other', label: 'Other' },
];

const emptyForm = () => ({
  detectionLabel: '', pathQuality: 'not-applicable', stopImpactQuality: 'not-applicable',
  evidenceSources: [], note: '', revision: 0,
});

function formatTime(value) {
  if (!Number.isFinite(Number(value))) return 'Unknown time';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(Number(value)));
}

function ChoiceRow({ options, value, onChange, disabled = false }) {
  return (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            style={[styles.choice, selected && styles.choiceSelected, disabled && styles.disabled]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function FilterRow({ options, value, onChange }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
      {options.map((option) => (
        <TouchableOpacity
          key={option.value}
          style={[styles.filterChip, value === option.value && styles.filterChipSelected]}
          onPress={() => onChange(option.value)}
        >
          <Text style={[styles.filterChipText, value === option.value && styles.filterChipTextSelected]}>{option.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function CaseCard({ item, selected, onPress }) {
  return (
    <TouchableOpacity style={[styles.caseCard, selected && styles.caseCardSelected]} onPress={onPress}>
      <View style={styles.caseCardTop}>
        <View style={styles.routeBadge}><Text style={styles.routeBadgeText}>{item.routeId}</Text></View>
        <Text style={styles.caseTime}>{formatTime(item.detectedAt)}</Text>
        <View style={[styles.visibilityDot, { backgroundColor: item.riderVisible ? COLORS.success : COLORS.grey400 }]} />
      </View>
      <Text style={styles.caseTitle}>{item.riderVisible ? 'Shown to riders' : 'Safely hidden'} · {item.confidence} confidence</Text>
      <Text style={styles.caseMeta}>{item.maxVehicleCount} confirming vehicle{item.maxVehicleCount === 1 ? '' : 's'} · {item.status}</Text>
    </TouchableOpacity>
  );
}

export default function DetourReviewScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === 'web' && width >= 1000;
  const [status, setStatus] = useState('pending');
  const [visibility, setVisibility] = useState('rider');
  const [queue, setQueue] = useState([]);
  const [totals, setTotals] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  const loadQueue = useCallback(async (preserveSelection = true) => {
    setLoadingQueue(true);
    setError('');
    try {
      const result = await detourReviewService.listCases({ status, visibility, limit: 100 });
      setQueue(result.cases || []);
      setTotals(result.totals || null);
      setReadiness(result.readiness || null);
      setSelectedId((current) => {
        if (preserveSelection && current && result.cases?.some((item) => item.caseId === current)) return current;
        return result.cases?.[0]?.caseId || null;
      });
    } catch (requestError) {
      setError(requestError.status === 403 ? 'This account is not authorized to review detours.' : requestError.message);
      setQueue([]);
    } finally {
      setLoadingQueue(false);
    }
  }, [status, visibility]);

  useEffect(() => { void loadQueue(false); }, [loadQueue]);
  useEffect(() => {
    if (!selectedId) { setDetail(null); setForm(emptyForm()); return; }
    let cancelled = false;
    setLoadingDetail(true);
    setSaveMessage('');
    detourReviewService.getCase(selectedId).then((nextDetail) => {
      if (cancelled) return;
      setDetail(nextDetail);
      const review = nextDetail.review;
      setForm(review ? {
        detectionLabel: review.detectionLabel,
        pathQuality: review.pathQuality,
        stopImpactQuality: review.stopImpactQuality,
        evidenceSources: review.evidenceSources || [],
        note: review.note || '',
        revision: review.revision || 0,
      } : emptyForm());
    }).catch((requestError) => !cancelled && setError(requestError.message))
      .finally(() => !cancelled && setLoadingDetail(false));
    return () => { cancelled = true; };
  }, [selectedId]);

  const progress = readiness?.minReviewedCount
    ? Math.min(100, Math.round((readiness.reviewedCount / readiness.minReviewedCount) * 100)) : 0;
  const toggleEvidence = (source) => setForm((current) => ({
    ...current,
    evidenceSources: current.evidenceSources.includes(source)
      ? current.evidenceSources.filter((value) => value !== source)
      : [...current.evidenceSources, source],
  }));
  const setDetectionLabel = (detectionLabel) => setForm((current) => ({
    ...current,
    detectionLabel,
    ...(detectionLabel === 'true-positive' ? {} : {
      pathQuality: 'not-applicable', stopImpactQuality: 'not-applicable',
    }),
  }));

  const handleSave = async () => {
    if (!detail || saving) return;
    setSaving(true);
    setError('');
    setSaveMessage('');
    try {
      const saved = await detourReviewService.saveReview(detail.caseId, form);
      setForm((current) => ({ ...current, revision: saved.revision }));
      setSaveMessage('Review saved and readiness updated.');
      await loadQueue(false);
    } catch (requestError) {
      setError(requestError.status === 409 ? 'This review changed. Reload the case before saving again.' : requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const queuePanel = (
    <View style={[styles.queuePanel, isWide && styles.queuePanelWide]}>
      <Text style={styles.sectionEyebrow}>Review queue</Text>
      <FilterRow options={STATUS_FILTERS} value={status} onChange={setStatus} />
      <FilterRow options={VISIBILITY_FILTERS} value={visibility} onChange={setVisibility} />
      {loadingQueue ? <ActivityIndicator style={styles.loader} color={COLORS.primary} /> : null}
      {!loadingQueue && queue.length === 0 ? (
        <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No matching cases</Text><Text style={styles.emptyText}>Try another queue filter.</Text></View>
      ) : queue.map((item) => (
        <CaseCard key={item.caseId} item={item} selected={selectedId === item.caseId} onPress={() => setSelectedId(item.caseId)} />
      ))}
    </View>
  );

  const detailPanel = (
    <View style={styles.detailPanel}>
      {loadingDetail ? <ActivityIndicator style={styles.loader} color={COLORS.primary} /> : null}
      {!loadingDetail && detail ? (
        <>
          <View style={styles.detailHeader}>
            <View><Text style={styles.sectionEyebrow}>Route {detail.routeId}</Text><Text style={styles.detailTitle}>Detector evidence review</Text></View>
            <View style={[styles.statusPill, detail.riderVisible ? styles.statusPillVisible : styles.statusPillHidden]}>
              <Text style={styles.statusPillText}>{detail.riderVisible ? 'Rider-visible' : 'Hidden'}</Text>
            </View>
          </View>
          <Text style={styles.detailMeta}>{formatTime(detail.detectedAt)} · {detail.confidence} confidence · {detail.maxVehicleCount} vehicles</Text>
          <DetourReviewMap reviewCase={detail} />
          <View style={styles.legendRow}>
            <Text style={styles.legendClosed}>━ Closed regular route</Text><Text style={styles.legendDetour}>━ Detour path</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>Evidence available</Text>
            <Text style={styles.infoText}>Path: {detail.pathEvidenceAvailable ? 'available' : 'not captured'}</Text>
            <Text style={styles.infoText}>Stop impacts: {detail.stopEvidenceAvailable ? `${detail.snapshot?.skippedStops?.length || 0} affected` : 'not captured'}</Text>
            <Text style={styles.infoText}>Visibility reason: {detail.riderVisibilityReason || 'not recorded'}</Text>
          </View>

          {detail.matchedNotices?.length > 0 ? (
            <View style={styles.infoCard}>
              <Text style={styles.cardTitle}>Matching official notices</Text>
              {detail.matchedNotices.map((notice) => (
                <TouchableOpacity key={notice.id} disabled={!notice.url} onPress={() => notice.url && Linking.openURL(notice.url)}>
                  <Text style={styles.noticeTitle}>{notice.title || 'Official notice'}</Text>
                  {notice.body ? <Text style={styles.infoText} numberOfLines={3}>{notice.body}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <View style={styles.formCard}>
            <Text style={styles.cardTitle}>Was this a real detour?</Text>
            <ChoiceRow options={DETECTION_OPTIONS} value={form.detectionLabel} onChange={setDetectionLabel} />

            {form.detectionLabel === 'true-positive' ? (
              <>
                <Text style={styles.fieldLabel}>Displayed path</Text>
                <ChoiceRow options={QUALITY_OPTIONS} value={form.pathQuality}
                  disabled={!detail.pathEvidenceAvailable}
                  onChange={(pathQuality) => setForm((current) => ({ ...current, pathQuality }))} />
                <Text style={styles.fieldLabel}>Affected stops</Text>
                <ChoiceRow options={QUALITY_OPTIONS} value={form.stopImpactQuality}
                  disabled={!detail.stopEvidenceAvailable}
                  onChange={(stopImpactQuality) => setForm((current) => ({ ...current, stopImpactQuality }))} />
              </>
            ) : null}

            <Text style={styles.fieldLabel}>Evidence source</Text>
            <View style={styles.choiceRow}>
              {EVIDENCE_OPTIONS.map((option) => {
                const selected = form.evidenceSources.includes(option.value);
                return (
                  <TouchableOpacity key={option.value} style={[styles.choice, selected && styles.choiceSelected]} onPress={() => toggleEvidence(option.value)}>
                    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>Operator note</Text>
            <TextInput
              style={styles.noteInput}
              value={form.note}
              onChangeText={(note) => setForm((current) => ({ ...current, note }))}
              placeholder="What confirms this decision?"
              placeholderTextColor={COLORS.textDisabled}
              multiline
              maxLength={2000}
            />
            {saveMessage ? <Text style={styles.successText}>{saveMessage}</Text> : null}
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.primaryButton, (!form.detectionLabel || saving) && styles.disabled]} disabled={!form.detectionLabel || saving} onPress={handleSave}>
                {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryButtonText}>Save and continue</Text>}
              </TouchableOpacity>
              {detail.review ? (
                <TouchableOpacity style={styles.secondaryButton} onPress={() => detourReviewService.exportCase(detail.caseId).catch((exportError) => setError(exportError.message))}>
                  <Text style={styles.secondaryButtonText}>Export JSON</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity accessibilityLabel="Back" style={styles.backButton} onPress={() => navigation.goBack()}><Icon name="ArrowLeft" size={22} color={COLORS.textPrimary} /></TouchableOpacity>
        <View style={styles.topBarText}><Text style={styles.pageTitle}>Detour review</Text><Text style={styles.pageSubtitle}>Turn live detections into ground truth</Text></View>
        <Text style={styles.progressLabel}>{readiness?.reviewedCount || 0}/{readiness?.minReviewedCount || 20}</Text>
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
      {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={() => loadQueue()}><Text style={styles.retryText}>Retry</Text></TouchableOpacity></View> : null}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: addSafeBottomPadding(SPACING.xxl, bottomInset) }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.layout, isWide && styles.layoutWide]}>{queuePanel}{detailPanel}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  topBar: { minHeight: 72, paddingHorizontal: SPACING.md, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topBarText: { flex: 1 }, pageTitle: { fontSize: 21, fontWeight: '800', color: COLORS.textPrimary },
  pageSubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }, progressLabel: { fontSize: FONT_SIZES.md, fontWeight: '800', color: COLORS.primary },
  progressTrack: { height: 4, backgroundColor: COLORS.grey200 }, progressFill: { height: 4, backgroundColor: COLORS.success },
  content: { width: '100%', alignSelf: 'center', maxWidth: 1440 }, layout: { padding: SPACING.md, gap: SPACING.md },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' }, queuePanel: { gap: SPACING.sm }, queuePanelWide: { width: 350, flexShrink: 0 }, detailPanel: { flex: 1, minWidth: 0, gap: SPACING.md },
  sectionEyebrow: { fontSize: 12, fontWeight: '800', color: COLORS.primaryDark, textTransform: 'uppercase', letterSpacing: 0.7 },
  filterRow: { gap: 8, paddingVertical: 4 }, filterChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterChipSelected: { backgroundColor: COLORS.primaryDark, borderColor: COLORS.primaryDark }, filterChipText: { color: COLORS.textSecondary, fontWeight: '700' }, filterChipTextSelected: { color: COLORS.white },
  caseCard: { padding: SPACING.md, borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLight, ...SHADOWS.small },
  caseCardSelected: { borderColor: COLORS.primary, borderWidth: 2 }, caseCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeBadge: { minWidth: 42, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.secondary }, routeBadgeText: { color: COLORS.white, fontWeight: '900' },
  caseTime: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }, visibilityDot: { width: 10, height: 10, borderRadius: 5 }, caseTitle: { marginTop: 10, color: COLORS.textPrimary, fontWeight: '800' }, caseMeta: { marginTop: 4, color: COLORS.textSecondary, fontSize: FONT_SIZES.sm },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md, alignItems: 'center' }, detailTitle: { fontSize: 24, fontWeight: '900', color: COLORS.textPrimary }, detailMeta: { color: COLORS.textSecondary },
  statusPill: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 }, statusPillVisible: { backgroundColor: COLORS.successSubtle }, statusPillHidden: { backgroundColor: COLORS.grey200 }, statusPillText: { color: COLORS.textPrimary, fontWeight: '800', fontSize: FONT_SIZES.sm },
  legendRow: { flexDirection: 'row', gap: 18, flexWrap: 'wrap' }, legendClosed: { color: '#C2413B', fontWeight: '800' }, legendDetour: { color: '#167A68', fontWeight: '800' },
  infoCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.borderLight, gap: 6 }, formCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.borderLight, gap: 12, ...SHADOWS.small },
  cardTitle: { fontSize: FONT_SIZES.lg, fontWeight: '900', color: COLORS.textPrimary }, infoText: { color: COLORS.textSecondary, lineHeight: 20 }, noticeTitle: { color: COLORS.primaryDark, fontWeight: '800', marginTop: 6 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.grey50, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10 }, choiceSelected: { backgroundColor: COLORS.primarySubtle, borderColor: COLORS.primary }, choiceText: { color: COLORS.textSecondary, fontWeight: '700' }, choiceTextSelected: { color: COLORS.primaryDark },
  fieldLabel: { marginTop: 6, fontSize: FONT_SIZES.sm, fontWeight: '800', color: COLORS.textPrimary }, noteInput: { minHeight: 108, textAlignVertical: 'top', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, color: COLORS.textPrimary, backgroundColor: COLORS.white },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, primaryButton: { minHeight: 48, paddingHorizontal: 20, borderRadius: 12, backgroundColor: COLORS.primaryDark, alignItems: 'center', justifyContent: 'center' }, primaryButtonText: { color: COLORS.white, fontWeight: '900' }, secondaryButton: { minHeight: 48, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }, secondaryButtonText: { color: COLORS.primaryDark, fontWeight: '800' },
  errorBanner: { margin: SPACING.md, marginBottom: 0, padding: SPACING.md, borderRadius: 12, backgroundColor: COLORS.errorSubtle, flexDirection: 'row', gap: 12 }, errorText: { flex: 1, color: COLORS.error }, retryText: { color: COLORS.primaryDark, fontWeight: '800' }, successText: { color: COLORS.success, fontWeight: '800' },
  emptyCard: { padding: SPACING.xl, alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg }, emptyTitle: { color: COLORS.textPrimary, fontWeight: '900' }, emptyText: { marginTop: 4, color: COLORS.textSecondary }, loader: { margin: SPACING.xl }, disabled: { opacity: 0.45 },
});
