import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';
import { buildPlatformMapImageUrl, getPlatformMapSourceUrl } from '../services/platformMapService';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;

const PlatformMapViewerModal = ({ visible, platformMap, onClose }) => {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [zoom, setZoom] = useState(1);

  const imageUrl = useMemo(() => buildPlatformMapImageUrl(platformMap?.id), [platformMap]);
  const imageUri = imageUrl && reloadKey > 0 ? `${imageUrl}?v=${reloadKey}` : imageUrl;

  const resetAndClose = () => {
    setIsLoading(true);
    setHasError(false);
    setZoom(1);
    onClose?.();
  };

  const retry = () => {
    setIsLoading(true);
    setHasError(false);
    setReloadKey((key) => key + 1);
  };

  const openSourcePdf = () => {
    Linking.openURL(getPlatformMapSourceUrl()).catch(() => {});
  };

  const zoomOut = () => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP));
  const zoomIn = () => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP));

  if (!platformMap) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={resetAndClose} presentationStyle="fullScreen">
      <View style={[styles.container, { paddingTop: insets.top }]}> 
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Platform map</Text>
            <Text style={styles.title}>{platformMap.displayName}</Text>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={resetAndClose}
            accessibilityRole="button"
            accessibilityLabel="Close platform map"
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.viewerShell}>
          {isLoading && !hasError && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading platform map...</Text>
            </View>
          )}

          {hasError ? (
            <View style={styles.errorState}>
              <Text style={styles.errorTitle}>Platform map could not be loaded.</Text>
              <Text style={styles.errorBody}>Check your connection and try again, or open the City of Barrie source PDF.</Text>
              <View style={styles.errorActions}>
                <TouchableOpacity style={styles.primaryButton} onPress={retry} accessibilityRole="button" accessibilityLabel="Retry loading platform map">
                  <Text style={styles.primaryButtonText}>Retry</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={openSourcePdf} accessibilityRole="button" accessibilityLabel="Open source PDF">
                  <Text style={styles.secondaryButtonText}>Open source PDF</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <ScrollView style={styles.panArea} contentContainerStyle={styles.panContent} maximumZoomScale={MAX_ZOOM} minimumZoomScale={MIN_ZOOM}>
              <Image
                key={imageUri}
                source={{ uri: imageUri }}
                style={[styles.mapImage, { transform: [{ scale: zoom }] }]}
                resizeMode="contain"
                accessibilityLabel={`Platform map for ${platformMap.displayName}`}
                onLoad={() => setIsLoading(false)}
                onError={() => {
                  setIsLoading(false);
                  setHasError(true);
                }}
              />
            </ScrollView>
          )}
        </View>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}> 
          <View style={styles.zoomControls}>
            <TouchableOpacity style={styles.zoomButton} onPress={zoomOut} accessibilityRole="button" accessibilityLabel="Zoom out platform map">
              <Text style={styles.zoomButtonText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
            <TouchableOpacity style={styles.zoomButton} onPress={zoomIn} accessibilityRole="button" accessibilityLabel="Zoom in platform map">
              <Text style={styles.zoomButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={openSourcePdf} accessibilityRole="link" accessibilityLabel="Open City of Barrie source PDF">
            <Text style={styles.sourceLink}>Source: City of Barrie</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerText: { flex: 1, paddingRight: SPACING.md },
  eyebrow: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: FONT_WEIGHTS.semibold },
  title: { fontSize: FONT_SIZES.xl, color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.bold },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BORDER_RADIUS.lg, backgroundColor: 'transparent' },
  closeText: { fontSize: FONT_SIZES.lg, color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.bold },
  viewerShell: { flex: 1, backgroundColor: COLORS.grey50 },
  panArea: { flex: 1 },
  panContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.md },
  mapImage: { width: '100%', height: 560 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 2, backgroundColor: COLORS.grey50 },
  loadingText: { marginTop: SPACING.md, color: COLORS.textSecondary, fontSize: FONT_SIZES.sm },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  errorTitle: { fontSize: FONT_SIZES.lg, color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.bold, marginBottom: SPACING.sm, textAlign: 'center' },
  errorBody: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: SPACING.lg },
  errorActions: { flexDirection: 'row', gap: SPACING.sm },
  primaryButton: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg },
  primaryButtonText: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold },
  secondaryButton: { backgroundColor: COLORS.grey100, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg },
  secondaryButtonText: { color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.semibold },
  footer: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.borderLight, alignItems: 'center', gap: SPACING.sm },
  zoomControls: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  zoomButton: { width: 40, height: 40, borderRadius: BORDER_RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary },
  zoomButtonText: { color: COLORS.white, fontSize: FONT_SIZES.xl, fontWeight: FONT_WEIGHTS.bold },
  zoomLabel: { minWidth: 52, textAlign: 'center', color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.semibold },
  sourceLink: { color: COLORS.primary, fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.semibold },
});

export default PlatformMapViewerModal;
