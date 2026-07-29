import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BORDER_RADIUS,
  COLORS,
  FONT_SIZES,
  SHADOWS,
  SPACING,
} from '../config/theme';
import { FRIENDLY_FEATURE_FONTS } from '../config/friendlyFeatureFonts';
import { useSafeBottomPadding } from '../utils/androidNavigationBar';

const DETECTION_STEPS = [
  {
    symbol: '↗',
    color: COLORS.primaryDark,
    tint: COLORS.primarySubtle,
    title: 'Spots something different',
    body: 'A bus moves away from its usual route.',
  },
  {
    symbol: '✓',
    color: COLORS.ctaGreen,
    tint: COLORS.successSubtle,
    title: 'Checks that it is real',
    body: 'More bus trips help confirm the change.',
  },
  {
    symbol: '◇',
    color: '#7C3AED',
    tint: '#F3EDFF',
    title: 'Shows you the detour',
    body: 'See the likely path and skipped section on the map.',
  },
  {
    symbol: '↻',
    color: COLORS.accentDark,
    tint: COLORS.accentSubtle,
    title: 'Knows when it is over',
    body: 'The alert leaves when buses return to the usual route.',
  },
];

const DetourExplainerButton = ({ style }) => {
  const [visible, setVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const safeBottomPadding = useSafeBottomPadding(SPACING.lg, insets.bottom);

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, style]}
        onPress={() => setVisible(true)}
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel="Learn how the Auto Detour Detector works"
        accessibilityHint="Opens an explanation of the live GPS feature"
      >
        <View style={styles.detectorIcon} accessible={false}>
          <View style={styles.detectorRingLarge} />
          <View style={styles.detectorRingSmall} />
          <View style={styles.detectorDot} />
        </View>
        <View style={styles.triggerCopy}>
          <Text style={styles.triggerEyebrow}>LIVE MAP FEATURE</Text>
          <Text style={styles.triggerText}>Auto Detour Detector</Text>
          <Text style={styles.triggerSubtext}>See how it works</Text>
        </View>
        <Text style={styles.triggerArrow}>›</Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close Auto Detour Detector explanation"
          />
          <View
            style={[styles.sheet, { paddingBottom: safeBottomPadding }]}
            accessibilityViewIsModal
          >
            <View style={styles.headerRow}>
              <View style={styles.titleWrap}>
                <Text style={styles.eyebrow}>LIVE MAP FEATURE</Text>
                <Text style={styles.title}>Meet the Auto Detour Detector</Text>
                <Text style={styles.subtitle}>It keeps an eye on live bus movement, so you do not have to.</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setVisible(false)}
                activeOpacity={0.72}
                accessibilityRole="button"
                accessibilityLabel="Close Auto Detour Detector explanation"
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.heroCard}>
                <View style={styles.heroIcon} accessible={false}>
                  <View style={styles.heroRingLarge} />
                  <View style={styles.heroRingMedium} />
                  <View style={styles.heroRingSmall} />
                  <View style={styles.heroDot} />
                </View>
                <View style={styles.heroCopy}>
                  <Text style={styles.heroTitle}>Built to spot unexpected route changes</Text>
                  <Text style={styles.heroBody}>
                    When buses start taking a different path, the detector looks for the pattern and brings the likely detour to your map.
                  </Text>
                </View>
              </View>

              <Text style={styles.sectionLabel}>HERE IS HOW IT HELPS</Text>

              <View style={styles.steps}>
                {DETECTION_STEPS.map((step) => (
                  <View
                    key={step.title}
                    style={[styles.stepRow, { backgroundColor: step.tint }]}
                  >
                    <View style={[styles.stepIcon, { backgroundColor: step.color }]}>
                      <Text style={styles.stepIconText}>{step.symbol}</Text>
                    </View>
                    <View style={styles.stepCopy}>
                      <Text style={styles.stepTitle}>{step.title}</Text>
                      <Text style={styles.stepBody}>{step.body}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.noteCard}>
                <Text style={styles.noteLabel}>Good to know</Text>
                <Text style={styles.noteText}>
                  The detector takes a little time to check a new detour, and the path shown is its best estimate. Check Barrie Transit service alerts for planned changes and official updates.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingLeft: SPACING.sm,
    paddingRight: SPACING.md,
    borderRadius: BORDER_RADIUS.xxl,
    borderWidth: 2,
    borderColor: COLORS.grey200,
    backgroundColor: COLORS.white,
    ...SHADOWS.small,
  },
  detectorIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: COLORS.primarySubtle,
  },
  detectorRingLarge: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(12, 140, 229, 0.28)',
  },
  detectorRingSmall: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(12, 140, 229, 0.58)',
  },
  detectorDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  triggerCopy: {
    flexShrink: 1,
  },
  triggerEyebrow: {
    color: COLORS.primaryDark,
    fontSize: 8,
    fontFamily: FRIENDLY_FEATURE_FONTS.extrabold,
    letterSpacing: 0.65,
  },
  triggerText: {
    marginTop: 1,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.sm,
    fontFamily: FRIENDLY_FEATURE_FONTS.extrabold,
  },
  triggerSubtext: {
    marginTop: 1,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xxs,
    fontFamily: FRIENDLY_FEATURE_FONTS.semibold,
  },
  triggerArrow: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.xxl,
    fontFamily: FRIENDLY_FEATURE_FONTS.regular,
    lineHeight: 24,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: COLORS.grey200,
    backgroundColor: COLORS.surface,
    ...SHADOWS.large,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  titleWrap: {
    flex: 1,
  },
  eyebrow: {
    marginBottom: 3,
    color: COLORS.primary,
    fontSize: FONT_SIZES.xxs,
    fontFamily: FRIENDLY_FEATURE_FONTS.extrabold,
    letterSpacing: 0.7,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.xl,
    fontFamily: FRIENDLY_FEATURE_FONTS.extrabold,
  },
  subtitle: {
    marginTop: 2,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    fontFamily: FRIENDLY_FEATURE_FONTS.semibold,
  },
  closeButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    marginTop: -SPACING.xs,
    borderRadius: BORDER_RADIUS.round,
  },
  closeButtonText: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZES.sm,
    fontFamily: FRIENDLY_FEATURE_FONTS.bold,
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: SPACING.sm,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xxl,
    borderWidth: 2,
    borderColor: '#B9E1FF',
    backgroundColor: COLORS.primarySubtle,
  },
  heroIcon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    backgroundColor: COLORS.white,
  },
  heroRingLarge: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: 'rgba(12, 140, 229, 0.16)',
  },
  heroRingMedium: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(12, 140, 229, 0.30)',
  },
  heroRingSmall: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(12, 140, 229, 0.52)',
  },
  heroDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  heroCopy: {
    flex: 1,
  },
  heroTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.md,
    fontFamily: FRIENDLY_FEATURE_FONTS.extrabold,
    lineHeight: 19,
  },
  heroBody: {
    marginTop: SPACING.xs,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    fontFamily: FRIENDLY_FEATURE_FONTS.regular,
    lineHeight: 18,
  },
  sectionLabel: {
    marginTop: SPACING.xl,
    color: COLORS.primaryDark,
    fontSize: FONT_SIZES.xxs,
    fontFamily: FRIENDLY_FEATURE_FONTS.extrabold,
    letterSpacing: 0.65,
  },
  steps: {
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 66,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(23, 43, 77, 0.08)',
  },
  stepIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  stepIconText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xl,
    fontFamily: FRIENDLY_FEATURE_FONTS.bold,
  },
  stepCopy: {
    flex: 1,
  },
  stepTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.sm,
    fontFamily: FRIENDLY_FEATURE_FONTS.bold,
  },
  stepBody: {
    marginTop: 3,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    fontFamily: FRIENDLY_FEATURE_FONTS.regular,
    lineHeight: 19,
  },
  noteCard: {
    marginTop: SPACING.lg,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: '#F7D89A',
    backgroundColor: COLORS.accentSubtle,
  },
  noteLabel: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.sm,
    fontFamily: FRIENDLY_FEATURE_FONTS.bold,
  },
  noteText: {
    marginTop: 3,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    fontFamily: FRIENDLY_FEATURE_FONTS.regular,
    lineHeight: 19,
  },
});

export default React.memo(DetourExplainerButton);
