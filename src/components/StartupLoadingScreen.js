import React from 'react';
import { Image, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Asset } from 'expo-asset';
import { BORDER_RADIUS, COLORS, FONT_FAMILIES, FONT_SIZES, FONT_WEIGHTS, SPACING, SHADOWS } from '../config/theme';
import { useSafeBottomInset } from '../utils/androidNavigationBar';

const APP_ICON = require('../../assets/splash-icon.png');
const HERO_IMAGE = require('../../assets/startup-home-scene.png');
const DETOUR_CARD_IMAGE = require('../../assets/startup-detour-card.png');
const STARTUP_IMAGE_ASSETS = [APP_ICON, HERO_IMAGE, DETOUR_CARD_IMAGE];

const DEFAULT_STATUS = 'Checking service alerts and detours...';
const DEFAULT_PERCENT = 65;
const STARTUP_LOADING_TEXT = 'Loading routes, stops, and live updates';

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

function HeroScene({ width, height, compact = false, preferPreloadedImages = false }) {
  return (
    <View
      style={[
        styles.heroWrap,
        { width, height },
        compact && styles.heroWrapCompact,
      ]}
      pointerEvents="none"
      accessible={false}
    >
      <Image
        source={getStartupImageSource(HERO_IMAGE, preferPreloadedImages)}
        style={styles.heroImage}
        resizeMode="contain"
        fadeDuration={0}
      />
    </View>
  );
}

function FeatureCard({
  cardWidth,
  deckHeight,
  miniMapHeight,
  compact = false,
  useBrandFonts = true,
  preferPreloadedImages = false,
}) {
  return (
    <View
      style={[
        styles.featureDeck,
        { width: cardWidth + 92, height: deckHeight },
        compact && styles.featureDeckCompact,
      ]}
    >
      <View style={[styles.sideCard, styles.sideCardLeft]}>
        <View style={styles.clockGlyph}>
          <View style={styles.clockHandVertical} />
          <View style={styles.clockHandHorizontal} />
        </View>
      </View>
      <View style={[styles.sideCard, styles.sideCardRight]}>
        <View style={styles.walkerGlyph}>
          <View style={styles.walkerHead} />
          <View style={styles.walkerBody} />
          <View style={[styles.walkerLeg, styles.walkerLegLeft]} />
          <View style={[styles.walkerLeg, styles.walkerLegRight]} />
        </View>
      </View>

      <View style={[
        styles.featureCard,
        { width: cardWidth },
        compact && styles.featureCardCompact,
      ]}>
        <View style={[styles.miniMap, { height: miniMapHeight }]}>
          <Image
            source={getStartupImageSource(DETOUR_CARD_IMAGE, preferPreloadedImages)}
            style={styles.miniMapImage}
            resizeMode="contain"
            fadeDuration={0}
          />
        </View>
        <Text style={[
          styles.featureTitle,
          useBrandFonts && styles.featureTitleFont,
          compact && styles.featureTitleCompact,
        ]}>
          Live Detour Awareness
        </Text>
        <Text style={[
          styles.featureText,
          useBrandFonts && styles.featureTextFont,
          compact && styles.featureTextCompact,
        ]}>
          We check live bus movement to inform you of possible detours.
        </Text>
        <View style={styles.shield}>
          <Text style={styles.shieldText}>✓</Text>
        </View>
      </View>
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
  const compact = height <= 780 || width <= 360;
  const veryCompact = height < 700;
  const shellWidth = Math.min(width || 390, 430);
  const horizontalPadding = compact ? 18 : 24;
  const heroWidth = Math.min(482, Math.max(320, shellWidth + (compact ? 2 : 22)));
  const heroHeight = Math.round(Math.min(
    compact ? 150 : 196,
    heroWidth * (213 / 482)
  ));
  const featureCardWidth = Math.round(Math.min(
    compact ? 292 : 318,
    Math.max(270, shellWidth * (compact ? 0.8 : 0.76))
  ));
  const featureDeckHeight = compact ? 246 : 278;
  const miniMapHeight = Math.round(Math.min(
    compact ? 88 : 106,
    (featureCardWidth - (compact ? 24 : 28)) * (129 / 304)
  ));
  const safePercent = Math.max(0, Math.min(100, Number.isFinite(Number(percent)) ? Number(percent) : DEFAULT_PERCENT));
  const baseBottomPadding = veryCompact ? 12 : 18;
  const progressBottomPadding = Platform.OS === 'android'
    ? safeBottomInset + SPACING.lg
    : baseBottomPadding;

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
          />
          <Text style={[
            styles.brandText,
            useBrandFonts && styles.brandTextFont,
            compact && styles.brandTextCompact,
          ]}>MyBarrie Transit</Text>
        </View>

        <HeroScene
          width={heroWidth}
          height={heroHeight}
          compact={compact}
          preferPreloadedImages={preferPreloadedImages}
        />

        <View style={[styles.copyWrap, compact && styles.copyWrapCompact]}>
          <Text style={[
            styles.title,
            styles.loadingLine,
            useBrandFonts && styles.titleFont,
            compact && styles.titleCompact,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          >
            {STARTUP_LOADING_TEXT}
          </Text>
        </View>

        <FeatureCard
          cardWidth={featureCardWidth}
          deckHeight={featureDeckHeight}
          miniMapHeight={miniMapHeight}
          compact={compact}
          useBrandFonts={useBrandFonts}
          preferPreloadedImages={preferPreloadedImages}
        />

        <View style={styles.progressArea}>
          <View style={styles.dots} accessible={false}>
            {[0, 1, 2, 3, 4].map((dot) => (
              <View key={dot} style={[styles.dot, dot === 1 && styles.dotActive]} />
            ))}
          </View>
          <Text style={[styles.statusText, useBrandFonts && styles.statusTextFont]}>
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
              <Text style={[styles.progressPercent, useBrandFonts && styles.progressPercentFont]}>
                {safePercent}%
              </Text>
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
  STARTUP_IMAGE_ASSETS,
  getStartupImageSource,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webContainer: {
    minHeight: '100vh',
  },
  content: {
    width: '100%',
    flex: 1,
    paddingTop: 30,
    paddingBottom: 18,
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: COLORS.white,
  },
  contentCompact: {
    paddingTop: 20,
    paddingBottom: 18,
  },
  contentVeryCompact: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 2,
    marginBottom: 4,
  },
  brandRowCompact: {
    marginBottom: 2,
  },
  appIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
  },
  appIconCompact: {
    width: 46,
    height: 46,
    borderRadius: 13,
  },
  brandText: {
    fontSize: 30,
    lineHeight: 36,
    color: '#061A3B',
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: -0.6,
  },
  brandTextFont: {
    fontFamily: FONT_FAMILIES.bold,
  },
  brandTextCompact: {
    fontSize: 23,
  },
  heroWrap: {
    position: 'relative',
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 16,
  },
  heroWrapCompact: {
    marginTop: 2,
    marginBottom: 8,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  copyWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 14,
  },
  copyWrapCompact: {
    marginBottom: 6,
  },
  title: {
    fontSize: 27,
    lineHeight: 33,
    color: '#061A3B',
    textAlign: 'center',
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: -1,
  },
  titleFont: {
    fontFamily: FONT_FAMILIES.bold,
  },
  loadingLine: {
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  titleCompact: {
    fontSize: 20,
    lineHeight: 26,
  },
  featureDeck: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
    marginBottom: 12,
  },
  featureDeckCompact: {
    marginTop: 2,
    marginBottom: 8,
  },
  sideCard: {
    position: 'absolute',
    width: 148,
    height: 194,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(223,225,230,0.78)',
    opacity: 0.82,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.medium,
  },
  sideCardLeft: {
    left: -6,
    transform: [{ rotate: '-5deg' }],
  },
  sideCardRight: {
    right: -6,
    transform: [{ rotate: '5deg' }],
  },
  clockGlyph: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 5,
    borderColor: '#0A315D',
    opacity: 0.9,
  },
  clockHandVertical: {
    position: 'absolute',
    left: 29,
    top: 16,
    width: 5,
    height: 22,
    borderRadius: 3,
    backgroundColor: '#0A315D',
  },
  clockHandHorizontal: {
    position: 'absolute',
    left: 31,
    top: 34,
    width: 17,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#0A315D',
  },
  walkerGlyph: {
    width: 60,
    height: 86,
    alignItems: 'center',
    justifyContent: 'flex-start',
    opacity: 0.9,
  },
  walkerHead: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#0A315D',
    marginBottom: 4,
  },
  walkerBody: {
    width: 8,
    height: 38,
    borderRadius: 5,
    backgroundColor: '#0A315D',
  },
  walkerLeg: {
    position: 'absolute',
    top: 52,
    width: 7,
    height: 36,
    borderRadius: 4,
    backgroundColor: '#0A315D',
  },
  walkerLegLeft: {
    left: 18,
    transform: [{ rotate: '20deg' }],
  },
  walkerLegRight: {
    right: 18,
    transform: [{ rotate: '-20deg' }],
  },
  featureCard: {
    minHeight: 258,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: 'rgba(223,225,230,0.92)',
    alignItems: 'center',
    padding: 12,
    ...SHADOWS.large,
  },
  featureCardCompact: {
    minHeight: 222,
    padding: 12,
  },
  miniMap: {
    position: 'relative',
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: COLORS.primarySubtle,
    borderWidth: 1,
    borderColor: 'rgba(209,232,255,0.9)',
  },
  miniMapImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  featureTitle: {
    marginTop: 14,
    fontSize: 22,
    lineHeight: 27,
    color: '#061A3B',
    textAlign: 'center',
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: -0.5,
  },
  featureTitleFont: {
    fontFamily: FONT_FAMILIES.bold,
  },
  featureTitleCompact: {
    marginTop: 14,
    fontSize: 21,
    lineHeight: 26,
  },
  featureText: {
    marginTop: 8,
    maxWidth: 238,
    fontSize: 15,
    lineHeight: 20,
    color: COLORS.grey800,
    textAlign: 'center',
  },
  featureTextFont: {
    fontFamily: FONT_FAMILIES.regular,
  },
  featureTextCompact: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  shield: {
    marginTop: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.grey200,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  shieldText: {
    fontSize: 24,
    lineHeight: 28,
    color: '#159C2E',
    fontWeight: FONT_WEIGHTS.bold,
  },
  progressArea: {
    width: '100%',
    alignItems: 'center',
    marginTop: 'auto',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.grey300,
  },
  dotActive: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#0969F5',
  },
  statusText: {
    fontSize: 15,
    lineHeight: 20,
    color: COLORS.grey800,
    textAlign: 'center',
    marginBottom: 10,
  },
  statusTextFont: {
    fontFamily: FONT_FAMILIES.regular,
  },
  progressRow: {
    width: '86%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  progressTrack: {
    flex: 1,
    height: 7,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.grey200,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: '#0969F5',
  },
  progressPercent: {
    minWidth: 42,
    fontSize: 15,
    lineHeight: 20,
    color: '#0969F5',
    fontWeight: FONT_WEIGHTS.bold,
  },
  progressPercentFont: {
    fontFamily: FONT_FAMILIES.bold,
  },
});
