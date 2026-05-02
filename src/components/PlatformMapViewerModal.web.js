import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../config/theme';
import { buildPlatformMapImageUrl, getPlatformMapSourceUrl } from '../services/platformMapService';

const PlatformMapViewerModal = ({ visible, platformMap, onClose }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const imageUrl = useMemo(() => buildPlatformMapImageUrl(platformMap?.id), [platformMap]);
  const imageUri = imageUrl && reloadKey > 0 ? `${imageUrl}?v=${reloadKey}` : imageUrl;

  const retry = () => {
    setIsLoading(true);
    setHasError(false);
    setReloadKey((key) => key + 1);
  };

  const openSourcePdf = () => Linking.openURL(getPlatformMapSourceUrl()).catch(() => {});

  if (!platformMap) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Platform map</Text>
              <Text style={styles.title}>{platformMap.displayName}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close platform map">
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.viewer} contentContainerStyle={styles.viewerContent} maximumZoomScale={3} minimumZoomScale={1}>
            {isLoading && !hasError && <ActivityIndicator size="large" color={COLORS.primary} />}
            {hasError ? (
              <View style={styles.errorState}>
                <Text style={styles.errorTitle}>Platform map could not be loaded.</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={retry} accessibilityRole="button" accessibilityLabel="Retry loading platform map">
                  <Text style={styles.primaryButtonText}>Retry</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={openSourcePdf} accessibilityRole="button" accessibilityLabel="Open source PDF">
                  <Text style={styles.secondaryButtonText}>Open source PDF</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Image
                key={imageUri}
                source={{ uri: imageUri }}
                style={styles.mapImage}
                resizeMode="contain"
                accessibilityLabel={`Platform map for ${platformMap.displayName}`}
                onLoad={() => setIsLoading(false)}
                onError={() => {
                  setIsLoading(false);
                  setHasError(true);
                }}
              />
            )}
          </ScrollView>
          <TouchableOpacity style={styles.sourceButton} onPress={openSourcePdf} accessibilityRole="link" accessibilityLabel="Open City of Barrie source PDF">
            <Text style={styles.sourceLink}>Source: City of Barrie</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  dialog: { width: 'min(960px, 96vw)', height: 'min(820px, 92vh)', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden', ...SHADOWS.elevated },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  eyebrow: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: FONT_WEIGHTS.semibold },
  title: { fontSize: FONT_SIZES.xl, color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.bold },
  closeButton: { width: 44, height: 44, borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.grey100, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  closeText: { fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary },
  viewer: { flex: 1, backgroundColor: COLORS.grey50 },
  viewerContent: { minHeight: '100%', alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  mapImage: { width: '100%', height: 650 },
  errorState: { alignItems: 'center', gap: SPACING.md },
  errorTitle: { color: COLORS.textPrimary, fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.bold },
  primaryButton: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg },
  primaryButtonText: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold },
  secondaryButton: { backgroundColor: COLORS.grey100, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg },
  secondaryButtonText: { color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.semibold },
  sourceButton: { alignItems: 'center', padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.borderLight, cursor: 'pointer' },
  sourceLink: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.semibold },
});

export default PlatformMapViewerModal;
