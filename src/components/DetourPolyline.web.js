/**
 * DetourPolyline - Web component (Leaflet)
 * Renders a dashed polyline to indicate a suspected detour route.
 * Supports confidence-based styling and click-to-show-info popup.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Polyline, Popup, useMap } from 'react-leaflet';
import { COLORS } from '../config/theme';

const getConfidenceStyle = (confidenceLevel) => {
  switch (confidenceLevel) {
    case 'high-confidence':
      return { weight: 4, opacity: 0.9, color: '#E67E00' };
    case 'likely':
      return { weight: 3, opacity: 0.7, color: '#FF991F' };
    case 'suspected':
    default:
      return { weight: 2, opacity: 0.5, color: '#FFB347' };
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

const badgeColors = {
  suspected: { bg: '#FFF4E5', text: '#E67E00' },
  likely: { bg: '#FFE0B2', text: '#E67E00' },
  'high-confidence': { bg: '#FFCC80', text: '#BF5F00' },
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
}) => {
  const [showPopup, setShowPopup] = useState(false);
  const [clickLatLng, setClickLatLng] = useState(null);

  const positions = coordinates.map((coord) => [coord.latitude, coord.longitude]);

  if (positions.length < 2) {
    return null;
  }

  const style = getConfidenceStyle(confidenceLevel);
  const uniqueVehicles = new Set(confirmedByVehicles.map((v) => v.vehicleId)).size;
  const badge = badgeColors[confidenceLevel] || badgeColors.suspected;

  const handleClick = (e) => {
    setClickLatLng(e.latlng);
    setShowPopup(true);
  };

  return (
    <>
      <Polyline
        positions={positions}
        pathOptions={{
          color: style.color,
          weight: style.weight,
          dashArray: '15, 10',
          lineCap: 'round',
          lineJoin: 'round',
          opacity: style.opacity,
        }}
        eventHandlers={{
          click: handleClick,
        }}
      />
      {showPopup && clickLatLng && (
        <Popup
          position={clickLatLng}
          eventHandlers={{
            remove: () => setShowPopup(false),
          }}
        >
          <div style={{ minWidth: 170, maxWidth: 230, fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                color: badge.text,
                backgroundColor: badge.bg,
                padding: '2px 6px',
                borderRadius: 4,
                textTransform: 'uppercase',
              }}>
                {confidenceLabelMap[confidenceLevel] || 'Suspected'}
              </span>
            </div>

            {segmentLabel && (
              <div style={{ fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 4 }}>
                {segmentLabel}
              </div>
            )}

            <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>
              First detected {formatTimeAgo(firstDetectedAt)}
            </div>
            {uniqueVehicles > 0 && (
              <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>
                Confirmed by {uniqueVehicles} bus{uniqueVehicles !== 1 ? 'es' : ''}
              </div>
            )}
            {affectedStops.length > 0 && (
              <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>
                {affectedStops.length} stop{affectedStops.length !== 1 ? 's' : ''} affected
              </div>
            )}

            {onDismiss && (
              <button
                onClick={() => {
                  setShowPopup(false);
                  onDismiss();
                }}
                style={{
                  marginTop: 8,
                  width: '100%',
                  padding: '4px 8px',
                  border: 'none',
                  borderRadius: 4,
                  backgroundColor: '#f0f0f0',
                  color: '#666',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
            )}
          </div>
        </Popup>
      )}
    </>
  );
};

export default DetourPolyline;
