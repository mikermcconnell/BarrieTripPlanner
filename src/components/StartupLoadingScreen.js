import React from 'react';
import { Image, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BORDER_RADIUS, COLORS, FONT_FAMILIES, FONT_SIZES, FONT_WEIGHTS, SPACING, SHADOWS } from '../config/theme';

const APP_ICON = require('../../assets/app-icon.png');
const HERO_IMAGE = require('../../assets/startup-home-scene.png');
const DETOUR_CARD_IMAGE = require('../../assets/startup-detour-card.png');

const DEFAULT_STATUS = 'Checking service alerts and detours...';
const DEFAULT_PERCENT = 65;

function HeroScene({ width, height, compact = false }) {
  const [imageReady, setImageReady] = React.useState(false);
  const [imageFailed, setImageFailed] = React.useState(false);

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
      <FallbackHeroScene compact={compact} />
      {!imageFailed ? (
        <Image
          source={HERO_IMAGE}
          style={[
            styles.heroImage,
            !imageReady && styles.artworkImageHidden,
          ]}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={() => setImageReady(true)}
          onError={() => setImageFailed(true)}
        />
      ) : null}
    </View>
  );
}

function FallbackHeroScene({ compact = false }) {
  return (
    <View style={styles.heroFallback}>
      <View style={[styles.heroCloud, styles.heroCloudLeft]} />
      <View style={[styles.heroCloud, styles.heroCloudRight]} />
      <View style={styles.heroSkyline}>
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <View
            key={item}
            style={[
              styles.heroBuilding,
              item % 2 === 0 && styles.heroBuildingTall,
            ]}
          />
        ))}
      </View>
      <View style={[styles.heroRouteLine, styles.heroRouteGreen]} />
      <View style={[styles.heroRouteLine, styles.heroRouteBlue]} />
      <View style={[styles.heroRouteLine, styles.heroRouteDetour]} />
      <View style={[styles.heroPin, styles.heroPinStart]}>
        <View style={styles.heroPinInner}>
          <View style={styles.heroPinBus} />
        </View>
      </View>
      <View style={[styles.heroPin, styles.heroPinAlert]}>
        <Text style={styles.heroAlertMark}>!</Text>
      </View>
      <View style={styles.heroBus}>
        <View style={styles.heroBusWindshield} />
        <View style={styles.heroBusWindows} />
        <View style={[styles.heroBusWheel, styles.heroBusWheelLeft]} />
        <View style={[styles.heroBusWheel, styles.heroBusWheelRight]} />
      </View>
      <View style={[styles.heroRouteDot, styles.heroRouteDotOne]} />
      <View style={[styles.heroRouteDot, styles.heroRouteDotTwo]} />
      <View style={[styles.heroRouteDot, styles.heroRouteDotThree]} />
      <View style={[styles.heroRouteDot, styles.heroRouteDotFour]} />
      {!compact ? <View style={styles.heroLake} /> : null}
    </View>
  );
}

function FeatureCard({
  cardWidth,
  deckHeight,
  miniMapHeight,
  compact = false,
  useBrandFonts = true,
}) {
  const [mapImageReady, setMapImageReady] = React.useState(false);
  const [mapImageFailed, setMapImageFailed] = React.useState(false);

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
          <FallbackMiniMap />
          {!mapImageFailed ? (
            <Image
              source={DETOUR_CARD_IMAGE}
              style={[
                styles.miniMapImage,
                !mapImageReady && styles.artworkImageHidden,
              ]}
              resizeMode="contain"
              fadeDuration={0}
              onLoad={() => setMapImageReady(true)}
              onError={() => setMapImageFailed(true)}
            />
          ) : null}
        </View>
        <Text style={[
          styles.featureTitle,
          useBrandFonts && styles.featureTitleFont,
          compact && styles.featureTitleCompact,
        ]}>
          Live detour awareness
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

function FallbackMiniMap() {
  return (
    <View style={styles.miniMapFallback}>
      <View style={[styles.miniMapGridLine, styles.miniMapGridLineOne]} />
      <View style={[styles.miniMapGridLine, styles.miniMapGridLineTwo]} />
      <View style={[styles.miniMapRouteLine, styles.miniMapRouteGreen]} />
      <View style={[styles.miniMapRouteLine, styles.miniMapRouteBlue]} />
      <View style={[styles.miniMapRouteLine, styles.miniMapRouteRed]} />
      <View style={[styles.miniMapPin, styles.miniMapPinBlue]}>
        <View style={styles.miniMapPinInner} />
      </View>
      <View style={[styles.miniMapPin, styles.miniMapPinAlert]}>
        <Text style={styles.miniMapAlertMark}>!</Text>
      </View>
      <View style={styles.miniMapBus}>
        <View style={styles.miniMapBusWindow} />
        <View style={[styles.miniMapBusWheel, styles.miniMapBusWheelLeft]} />
        <View style={[styles.miniMapBusWheel, styles.miniMapBusWheelRight]} />
      </View>
      <View style={[styles.miniMapDot, styles.miniMapDotOne]} />
      <View style={[styles.miniMapDot, styles.miniMapDotTwo]} />
      <View style={[styles.miniMapDot, styles.miniMapDotThree]} />
    </View>
  );
}

export default function StartupLoadingScreen({
  percent = DEFAULT_PERCENT,
  statusText = DEFAULT_STATUS,
  title = 'Getting Barrie Transit ready',
  detail = 'Loading routes, stops, live buses, and detour updates.',
  showProgress = true,
  useBrandFonts = true,
}) {
  const { height, width } = useWindowDimensions();
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

  return (
    <View style={[styles.container, Platform.OS === 'web' && styles.webContainer]}>
      <View
        style={[
          styles.content,
          { maxWidth: shellWidth, paddingHorizontal: horizontalPadding },
          compact && styles.contentCompact,
          veryCompact && styles.contentVeryCompact,
        ]}
      >
        <View style={[styles.brandRow, compact && styles.brandRowCompact]}>
          <Image source={APP_ICON} style={[styles.appIcon, compact && styles.appIconCompact]} />
          <Text style={[
            styles.brandText,
            useBrandFonts && styles.brandTextFont,
            compact && styles.brandTextCompact,
          ]}>MyBarrie Transit</Text>
        </View>

        <HeroScene width={heroWidth} height={heroHeight} compact={compact} />

        <View style={[styles.copyWrap, compact && styles.copyWrapCompact]}>
          <Text style={[
            styles.goodSoon,
            useBrandFonts && styles.goodSoonFont,
            compact && styles.goodSoonCompact,
          ]}>Good to go soon</Text>
          <Text style={[
            styles.title,
            useBrandFonts && styles.titleFont,
            compact && styles.titleCompact,
          ]}>{title}</Text>
          <Text style={[
            styles.detail,
            useBrandFonts && styles.detailFont,
            compact && styles.detailCompact,
          ]}>{detail}</Text>
        </View>

        <FeatureCard
          cardWidth={featureCardWidth}
          deckHeight={featureDeckHeight}
          miniMapHeight={miniMapHeight}
          compact={compact}
          useBrandFonts={useBrandFonts}
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

export { DEFAULT_PERCENT, DEFAULT_STATUS };

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
  artworkImageHidden: {
    opacity: 0,
  },
  heroFallback: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#F7FCFF',
  },
  heroCloud: {
    position: 'absolute',
    width: 58,
    height: 20,
    borderRadius: 12,
    backgroundColor: '#EAF4FF',
    opacity: 0.9,
  },
  heroCloudLeft: {
    left: '9%',
    top: 8,
  },
  heroCloudRight: {
    right: '13%',
    top: 14,
  },
  heroSkyline: {
    position: 'absolute',
    top: '12%',
    left: '26%',
    right: '28%',
    height: 76,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    opacity: 0.52,
  },
  heroBuilding: {
    width: 20,
    height: 46,
    borderRadius: 4,
    backgroundColor: '#D9ECFF',
  },
  heroBuildingTall: {
    height: 68,
    backgroundColor: '#CCE6FF',
  },
  heroRouteLine: {
    position: 'absolute',
    borderRadius: 999,
  },
  heroRouteGreen: {
    left: '-7%',
    bottom: '22%',
    width: '39%',
    height: 9,
    backgroundColor: '#4BB842',
    transform: [{ rotate: '-12deg' }],
  },
  heroRouteBlue: {
    left: '29%',
    bottom: '24%',
    width: '35%',
    height: 9,
    backgroundColor: '#0B8FE8',
    transform: [{ rotate: '8deg' }],
  },
  heroRouteDetour: {
    right: '5%',
    bottom: '40%',
    width: '29%',
    height: 1,
    borderTopWidth: 4,
    borderStyle: 'dashed',
    borderColor: '#FF6A2A',
    transform: [{ rotate: '15deg' }],
  },
  heroPin: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: COLORS.white,
    ...SHADOWS.small,
  },
  heroPinStart: {
    left: '11%',
    top: '18%',
    backgroundColor: '#43B647',
  },
  heroPinAlert: {
    right: '13%',
    top: '16%',
    backgroundColor: '#FF4A23',
  },
  heroPinInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPinBus: {
    width: 18,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#0A315D',
  },
  heroAlertMark: {
    color: COLORS.white,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: FONT_WEIGHTS.bold,
  },
  heroBus: {
    position: 'absolute',
    right: '32%',
    bottom: '20%',
    width: 96,
    height: 58,
    borderRadius: 13,
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: '#0A315D',
    ...SHADOWS.small,
  },
  heroBusWindshield: {
    position: 'absolute',
    left: 10,
    top: 10,
    width: 28,
    height: 22,
    borderRadius: 5,
    backgroundColor: '#123B63',
  },
  heroBusWindows: {
    position: 'absolute',
    left: 42,
    top: 10,
    right: 10,
    height: 22,
    borderRadius: 5,
    backgroundColor: '#BDE4FF',
  },
  heroBusWheel: {
    position: 'absolute',
    bottom: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#0A315D',
  },
  heroBusWheelLeft: {
    left: 16,
  },
  heroBusWheelRight: {
    right: 16,
  },
  heroRouteDot: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#48B847',
  },
  heroRouteDotOne: {
    right: '30%',
    bottom: '35%',
  },
  heroRouteDotTwo: {
    right: '27%',
    bottom: '37%',
  },
  heroRouteDotThree: {
    right: '24%',
    bottom: '39%',
  },
  heroRouteDotFour: {
    right: '21%',
    bottom: '41%',
  },
  heroLake: {
    position: 'absolute',
    right: '-6%',
    bottom: '-8%',
    width: '34%',
    height: '28%',
    borderRadius: 999,
    backgroundColor: '#DDF4FF',
  },
  copyWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 14,
  },
  copyWrapCompact: {
    marginBottom: 6,
  },
  goodSoon: {
    fontSize: 23,
    lineHeight: 28,
    color: '#159C2E',
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  goodSoonFont: {
    fontFamily: FONT_FAMILIES.bold,
  },
  goodSoonCompact: {
    fontSize: 20,
    marginBottom: 4,
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
  titleCompact: {
    fontSize: 25,
    lineHeight: 31,
  },
  detail: {
    marginTop: 6,
    fontSize: 17,
    lineHeight: 24,
    color: COLORS.grey800,
    textAlign: 'center',
  },
  detailFont: {
    fontFamily: FONT_FAMILIES.regular,
  },
  detailCompact: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
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
  miniMapFallback: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#F7FBFF',
  },
  miniMapGridLine: {
    position: 'absolute',
    height: 2,
    width: '70%',
    borderRadius: 999,
    backgroundColor: '#E7F1FA',
  },
  miniMapGridLineOne: {
    left: '-8%',
    top: '32%',
    transform: [{ rotate: '-18deg' }],
  },
  miniMapGridLineTwo: {
    right: '-10%',
    top: '61%',
    transform: [{ rotate: '-18deg' }],
  },
  miniMapRouteLine: {
    position: 'absolute',
    borderRadius: 999,
  },
  miniMapRouteGreen: {
    left: '-4%',
    bottom: '32%',
    width: '34%',
    height: 6,
    backgroundColor: '#46B947',
    transform: [{ rotate: '-12deg' }],
  },
  miniMapRouteBlue: {
    left: '31%',
    bottom: '39%',
    width: '24%',
    height: 6,
    backgroundColor: '#0C8CE5',
    transform: [{ rotate: '11deg' }],
  },
  miniMapRouteRed: {
    right: '6%',
    bottom: '43%',
    width: '28%',
    height: 1,
    borderTopWidth: 4,
    borderStyle: 'dashed',
    borderColor: '#FF4A23',
    transform: [{ rotate: '8deg' }],
  },
  miniMapPin: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
    ...SHADOWS.small,
  },
  miniMapPinBlue: {
    left: '11%',
    top: '14%',
    backgroundColor: '#0C8CE5',
  },
  miniMapPinAlert: {
    right: '17%',
    top: '13%',
    backgroundColor: '#FF4A23',
  },
  miniMapPinInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.white,
  },
  miniMapAlertMark: {
    color: COLORS.white,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: FONT_WEIGHTS.bold,
  },
  miniMapBus: {
    position: 'absolute',
    left: '34%',
    top: '36%',
    width: 50,
    height: 29,
    borderRadius: 7,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: '#0A315D',
    ...SHADOWS.small,
  },
  miniMapBusWindow: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 7,
    height: 10,
    borderRadius: 3,
    backgroundColor: '#BDE4FF',
  },
  miniMapBusWheel: {
    position: 'absolute',
    bottom: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0A315D',
  },
  miniMapBusWheelLeft: {
    left: 8,
  },
  miniMapBusWheelRight: {
    right: 8,
  },
  miniMapDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#46B947',
  },
  miniMapDotOne: {
    left: '56%',
    top: '50%',
  },
  miniMapDotTwo: {
    left: '61%',
    top: '48%',
  },
  miniMapDotThree: {
    left: '66%',
    top: '46%',
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
