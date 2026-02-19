/**
 * DetourPolyline - Native (iOS/Android) component
 * Renders a dashed polyline to indicate a suspected detour route.
 * Supports confidence-based styling and tap-to-show-info popup.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';

let idCounter = 0;

const getConfidenceStyle = (confidenceLevel) => {
  switch (confidenceLevel) {
    case 'high-confidence':
      return { width: 4, opacity: 0.9, color: '#E67E00' };
    case 'likely':
      return { width: 3, opacity: 0.7, color: '#FF991F' };
    case 'suspected':
    default:
      return { width: 2, opacity: 0.5, color: '#FFB347' };
  }
};

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return 'Unknown';
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m ago`;
};

const confidenceLabelMap = {
  suspected: 'Suspected',
  likely: 'Likely',
  'high-confidence': 'High Confidence',
};

const DetourPolyline = ({
  coordinates,
  confidenceLevel = 'suspected',
  confidenceScore,
  firstDetectedAt,
  confirmedByVehicles = [],
  affectedStops = [],
  segmentLabel,
  onDismiss,
  id,
}) => {
  const [showPopup, setShowPopup] = useState(false);

  const style = getConfidenceStyle(confidenceLevel);
  const formattedCoordinates = coordinates.map((coord) => [
    coord.longitude,
    coord.latitude,
  ]);

  if (formattedCoordinates.length < 2) {
    return null;
  }

  const sourceId = id || `detour-polyline-${++idCounter}`;

  const geoJson = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: formattedCoordinates,
    },
  };

  // Calculate midpoint for popup position
  const midIdx = Math.floor(formattedCoordinates.length / 2);
  const midCoord = formattedCoordinates[midIdx];

  const uniqueVehicles = new Set(confirmedByVehicles.map((v) => v.vehicleId)).size;

  const handlePress = () => {
    setShowPopup(!showPopup);
  };

  return (
    <>
      <MapLibreGL.ShapeSource
        id={`${sourceId}-src`}
        shape={geoJson}
        onPress={handlePress}
        hitbox={{ width: 20, height: 20 }}
      >
        <MapLibreGL.LineLayer
          id={`${sourceId}-line`}
          style={{
            lineColor: style.color,
            lineWidth: style.width,
            lineDasharray: [15 / style.width, 10 / style.width],
            lineCap: 'round',
            lineJoin: 'round',
            lineOpacity: style.opacity,
          }}
        />
      </MapLibreGL.ShapeSource>

      {showPopup && midCoord && (
        <MapLibreGL.PointAnnotation
          id={`${sourceId}-popup`}
          coordinate={midCoord}
          anchor={{ x: 0.5, y: 1 }}
        >
          <View style={styles.popupContainer}>
            <View style={styles.popupCard}>
              <View style={styles.popupHeader}>
                <View style={[styles.confidenceBadge, styles[`badge_${confidenceLevel}`]]}>
                  <Text style={styles.confidenceBadgeText}>
                    {confidenceLabelMap[confidenceLevel] || 'Suspected'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setShowPopup(false)}
                >
                  <Text style={styles.closeButtonText}>×</Text>
                </TouchableOpacity>
              </View>

              {segmentLabel && (
                <Text style={styles.segmentLabel}>{segmentLabel}</Text>
              )}

              <Text style={styles.infoText}>
                First detected {formatTimeAgo(firstDetectedAt)}
              </Text>
              {uniqueVehicles > 0 && (
                <Text style={styles.infoText}>
                  Confirmed by {uniqueVehicles} bus{uniqueVehicles !== 1 ? 'es' : ''}
                </Text>
              )}
              {affectedStops.length > 0 && (
                <Text style={styles.infoText}>
                  {affectedStops.length} stop{affectedStops.length !== 1 ? 's' : ''} affected
                </Text>
              )}

              {onDismiss && (
                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={() => {
                    setShowPopup(false);
                    onDismiss();
                  }}
                >
                  <Text style={styles.dismissButtonText}>Dismiss</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.popupPointer} />
          </View>
        </MapLibreGL.PointAnnotation>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  popupContainer: {
    alignItems: 'center',
  },
  popupCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm,
    minWidth: 180,
    maxWidth: 240,
    ...SHADOWS.medium,
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  confidenceBadge: {
    paddingVertical: 2,
    paddingHorizontal: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  badge_suspected: {
    backgroundColor: '#FFF4E5',
  },
  'badge_likely': {
    backgroundColor: '#FFE0B2',
  },
  'badge_high-confidence': {
    backgroundColor: '#FFCC80',
  },
  confidenceBadgeText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#E67E00',
    textTransform: 'uppercase',
  },
  closeButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  segmentLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  infoText: {
    fontSize: FONT_SIZES.xxs,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  dismissButton: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
  },
  dismissButtonText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
  },
  popupPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: COLORS.white,
  },
});

export default DetourPolyline;
