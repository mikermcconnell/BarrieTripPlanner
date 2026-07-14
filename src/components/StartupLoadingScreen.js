import React, { useRef } from 'react';
import { Animated, Image, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Asset } from 'expo-asset';
import {
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILIES,
  FONT_WEIGHTS,
  SPACING,
  SHADOWS,
} from '../config/theme';
import { useSafeBottomInset } from '../utils/androidNavigationBar';
import StartupDetourAnimation from './StartupDetourAnimation';

const APP_ICON = require('../../assets/splash-icon.png');
const AUTO_DETOUR_MAP_BASE = require('../../assets/startup-auto-detour-map-base.png');
const STARTUP_IMAGE_ASSETS = [APP_ICON, AUTO_DETOUR_MAP_BASE];

const DEFAULT_STATUS = 'Checking live routes and service alerts...';
const DEFAULT_PERCENT = 65;
const STARTUP_HEADLINE = 'See likely detours. Avoid skipped stops.';
const STARTUP_SUPPORTING_TEXT = 'Powered by live bus movement.';
const STARTUP_BACKGROUND_COLOR = '#F7FBFF';

function getStartupImageSource(moduleId, preferPreloadedImages = false) {
  if (!preferPreloadedImages || Platform.OS === 'web') {
    return moduleId;
  }

  try {
    const asset = Asset.fromModule(moduleId);
    return asset?.localUri ? { uri: asset.localUri } : moduleId;
  } catch {
    return moduleId;
  }
}

function DetectionHero({ width, compact = false, preferPreloadedImages = false }) {
  const timeline = useRef(new Animated.Value(0)).current;
  const imageHeight = Math.round(width * (520 / 900));
  const alertAnimation = {
    opacity: timeline.interpolate({
      inputRange: [0, 0.16, 0.22, 0.94, 1],
      outputRange: [0, 0, 1, 1, 0],
    }),
    transform: [{
      translateY: timeline.interpolate({
        inputRange: [0, 0.16, 0.22, 0.94, 1],
        outputRange: [8, 8, 0, 0, 8],
      }),
    }],
  };

  return (
    <View style={[styles.heroArea, compact && styles.heroAreaCompact]}>
      <View
        style={[styles.heroFrame, { width, height: imageHeight }]}
        pointerEvents="none"
        accessible={false}
      >
        <StartupDetourAnimation
          imageSource={getStartupImageSource(AUTO_DETOUR_MAP_BASE, preferPreloadedImages)}
          width={width}
          height={imageHeight}
          timeline={timeline}
        />
      </View>

      <Animated.View
        style={[styles.detourAlert, compact && styles.detourAlertCompact, alertAnimation]}
        accessibilityRole="summary"
        accessibilityLabel="Likely detour detected. Route change identified from live bus movement."
      >
        <View style={styles.alertIcon}>
          <Text style={styles.alertIconText}>!</Text>
        </View>
        <View style={styles.alertCopy}>
          <Text style={styles.alertTitle} numberOfLines={2}>Likely detour detected</Text>
          <Text style={styles.alertDescription} numberOfLines={2}>
            Route change identified from live bus movement
          </Text>
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </Animated.View>
    </View>
  );
}

export default function StartupLoadingScreen({
  percent = DEFAULT_PERCENT,
  statusText = DEFAULT_STATUS,
  showProgress = true,
  useBrandFonts = true,
  preferPreloadedImages = false,
  onReadyToDisplay,
}) {
  const { height, width } = useWindowDimensions();
  const safeBottomInset = useSafeBottomInset(0);
  const compact = height <= 760 || width <= 360;
  const veryCompact = height < 690;
  const shellWidth = Math.min(width || 390, 430);
  const horizontalPadding = compact ? 18 : 24;
  const heroWidth = Math.min(
    382,
    shellWidth - (horizontalPadding * 2),
    veryCompact ? 272 : 382
  );
  const safePercent = Math.max(
    0,
    Math.min(100, Number.isFinite(Number(percent)) ? Number(percent) : DEFAULT_PERCENT)
  );
  const baseBottomPadding = veryCompact ? 10 : 18;
  const progressBottomPadding = Platform.OS === 'android'
    ? safeBottomInset + SPACING.lg
    : baseBottomPadding;

  const brandFont = useBrandFonts && styles.brandTextFont;
  const boldFont = useBrandFonts && styles.boldFont;
  const regularFont = useBrandFonts && styles.regularFont;

  return (
    <View
      style={[styles.container, Platform.OS === 'web' && styles.webContainer]}
      onLayout={onReadyToDisplay}
    >
      <View
        style={[
          styles.content,
          { maxWidth: shellWidth, paddingHorizontal: horizontalPadding },
          compact && styles.contentCompact,
          veryCompact && styles.contentVeryCompact,
          { paddingBottom: progressBottomPadding },
        ]}
      >
        <View style={[styles.brandRow, compact && styles.brandRowCompact]}>
          <Image
            source={getStartupImageSource(APP_ICON, preferPreloadedImages)}
            style={[styles.appIcon, compact && styles.appIconCompact]}
            fadeDuration={0}
            accessible={false}
          />
          <Text
            style={[styles.brandText, brandFont, compact && styles.brandTextCompact]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            MyBarrie Transit
          </Text>
        </View>

        <View style={[styles.featureLabel, compact && styles.featureLabelCompact]}>
          <View style={styles.featureLabelDot} />
          <Text
            style={[styles.featureLabelText, boldFont]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            AUTOMATIC DETOUR DETECTION
          </Text>
        </View>

        <Text
          style={[styles.title, boldFont, compact && styles.titleCompact]}
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.84}
          accessibilityRole="header"
        >
          See <Text style={styles.detourTitleAccent}>likely detours.</Text>{'\n'}
          Avoid <Text style={styles.stopTitleAccent}>skipped stops.</Text>
        </Text>
        <View style={styles.poweredRow}>
          <View style={styles.poweredDot} />
          <Text
            style={[styles.poweredText, regularFont]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {STARTUP_SUPPORTING_TEXT}
          </Text>
        </View>
        <DetectionHero
          width={heroWidth}
          compact={compact}
          preferPreloadedImages={preferPreloadedImages}
        />

        <View style={[styles.progressArea, veryCompact && styles.progressAreaVeryCompact]}>
          <Text
            style={[styles.statusText, regularFont]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {statusText}
          </Text>
          {showProgress ? (
            <View
              style={styles.progressRow}
              accessibilityRole="progressbar"
              accessibilityLabel={statusText}
              accessibilityValue={{ min: 0, max: 100, now: safePercent }}
            >
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${safePercent}%` }]} />
              </View>
              <Text style={[styles.progressPercent, boldFont]}>{safePercent}%</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export {
  DEFAULT_PERCENT,
  DEFAULT_STATUS,
  STARTUP_HEADLINE,
  STARTUP_BACKGROUND_COLOR,
  STARTUP_IMAGE_ASSETS,
  STARTUP_SUPPORTING_TEXT,
  getStartupImageSource,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: STARTUP_BACKGROUND_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webContainer: {
    minHeight: '100vh',
  },
  content: {
    width: '100%',
    flex: 1,
    paddingTop: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: STARTUP_BACKGROUND_COLOR,
  },
  contentCompact: {
    paddingTop: 16,
  },
  contentVeryCompact: {
    paddingTop: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
  },
  brandRowCompact: {
    marginBottom: 12,
  },
  appIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
  },
  appIconCompact: {
    width: 42,
    height: 42,
    borderRadius: 12,
  },
  brandText: {
    fontSize: 25,
    lineHeight: 31,
    color: '#061A3B',
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: -0.5,
  },
  brandTextFont: {
    fontFamily: FONT_FAMILIES.bold,
  },
  brandTextCompact: {
    fontSize: 22,
    lineHeight: 28,
  },
  featureLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: '#EEE7FC',
    marginBottom: 13,
  },
  featureLabelCompact: {
    marginBottom: 9,
    paddingVertical: 6,
  },
  featureLabelDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#8539D6',
  },
  featureLabelText: {
    color: '#6421A8',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.7,
  },
  title: {
    maxWidth: 370,
    color: '#061A3B',
    fontSize: 29,
    lineHeight: 34,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: -1,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 26,
    lineHeight: 31,
  },
  detourTitleAccent: {
    color: '#6F2DBD',
  },
  stopTitleAccent: {
    color: '#C94B23',
  },
  poweredRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  poweredDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#159C63',
  },
  poweredText: {
    color: '#50647A',
    fontSize: 14,
    lineHeight: 18,
  },
  heroArea: {
    width: '100%',
    alignItems: 'center',
    marginTop: 18,
  },
  heroAreaCompact: {
    marginTop: 12,
  },
  heroFrame: {
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#EAF6FF',
    borderWidth: 1,
    borderColor: '#D8EAF7',
    ...SHADOWS.medium,
  },
  detourAlert: {
    width: '88%',
    minHeight: 74,
    marginTop: -28,
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    ...SHADOWS.large,
  },
  detourAlertCompact: {
    width: '91%',
    minHeight: 68,
    marginTop: -22,
    paddingVertical: 9,
  },
  alertIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3DD',
  },
  alertIconText: {
    color: '#D94B2B',
    fontSize: 25,
    lineHeight: 28,
    fontWeight: FONT_WEIGHTS.bold,
  },
  alertCopy: {
    flex: 1,
    minWidth: 0,
  },
  alertTitle: {
    color: '#061A3B',
    fontFamily: FONT_FAMILIES.bold,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: FONT_WEIGHTS.bold,
  },
  alertDescription: {
    marginTop: 2,
    color: '#5F7387',
    fontFamily: FONT_FAMILIES.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: '#E5F8EF',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#159C63',
  },
  liveText: {
    color: '#087747',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: FONT_WEIGHTS.bold,
  },
  progressArea: {
    width: '100%',
    alignItems: 'center',
    marginTop: 28,
  },
  progressAreaVeryCompact: {
    marginTop: 18,
  },
  statusText: {
    marginBottom: 9,
    color: '#5F7387',
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
  },
  progressRow: {
    width: '88%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    height: 7,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: '#DCE7EF',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: '#1174E7',
  },
  progressPercent: {
    minWidth: 40,
    color: '#005EA8',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: FONT_WEIGHTS.bold,
  },
  boldFont: {
    fontFamily: FONT_FAMILIES.bold,
  },
  regularFont: {
    fontFamily: FONT_FAMILIES.regular,
  },
});
