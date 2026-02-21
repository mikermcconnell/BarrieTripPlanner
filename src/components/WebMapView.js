/**
 * Web-only map component using Leaflet
 * This component should ONLY be imported on web platform
 */
import React, { forwardRef, useRef, useImperativeHandle, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Fix for default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Inject Leaflet CSS
if (typeof document !== 'undefined' && !document.getElementById('leaflet-css')) {
  const link = document.createElement('link');
  link.id = 'leaflet-css';
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  document.head.appendChild(link);
}

import { useAnimatedBusPosition } from '../hooks/useAnimatedBusPosition';
import { ANIMATION } from '../config/constants';

// Inject custom attribution styling
if (typeof document !== 'undefined' && !document.getElementById('leaflet-attribution-css')) {
  const style = document.createElement('style');
  style.id = 'leaflet-attribution-css';
  style.textContent = `
    .leaflet-control-attribution {
      font-size: 9px !important;
      background: rgba(255, 255, 255, 0.55) !important;
      padding: 1px 6px !important;
      color: #666 !important;
      backdrop-filter: blur(4px);
    }
    .leaflet-control-attribution a {
      color: #888 !important;
      text-decoration: none !important;
    }
  `;
  document.head.appendChild(style);
}


// Convert lat/lng delta to zoom level
const getZoomFromDelta = (latDelta) => {
  return Math.round(Math.log(360 / latDelta) / Math.LN2);
};
const webMarkerDebugState = new Map();
const ROUTE_LABEL_DEBUG = __DEV__ && process.env.EXPO_PUBLIC_ROUTE_LABEL_DEBUG === 'true';

// Map controller for ref methods
const MapController = forwardRef((props, ref) => {
  const map = useMap();

  useImperativeHandle(ref, () => ({
    animateToRegion: (region, duration = 500) => {
      map.flyTo([region.latitude, region.longitude], getZoomFromDelta(region.latitudeDelta), {
        duration: duration / 1000,
      });
    },
    fitToCoordinates: (coords, options = {}) => {
      if (!coords || coords.length === 0) return;
      const bounds = L.latLngBounds(coords.map(c => [c.latitude, c.longitude]));
      const padding = options.edgePadding
        ? [options.edgePadding.top || 50, options.edgePadding.right || 50]
        : [50, 50];
      map.flyToBounds(bounds, { padding, animate: true, duration: 0.5 });
    },
  }));

  return null;
});

// Map click handler component - uses useMapEvents hook for proper React lifecycle
const MapClickHandler = ({ onPress }) => {
  useMapEvents({
    click: (e) => {
      onPress?.({
        nativeEvent: {
          coordinate: {
            latitude: e.latlng.lat,
            longitude: e.latlng.lng,
          },
        },
      });
    },
  });
  return null;
};

// Create compact pill bus icon with route number and direction arrow
const createBusIcon = (color, routeId, bearing = null, scale = 1) => {
  const routeLabel = routeId || '?';

  // Check if we have valid bearing data (not null/undefined and not the default 0 fallback)
  const hasValidBearing = bearing !== null && bearing !== undefined;

  const arrowHtml = hasValidBearing ? `
    <div style="
      position: absolute;
      top: 0;
      left: 0;
      width: 80px;
      height: 80px;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      transform: rotate(${bearing}deg);
      pointer-events: none;
      z-index: 1;
    ">
      <div style="
        width: 0;
        height: 0;
        margin-top: 0px;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-bottom: 14px solid ${color};
        filter: drop-shadow(0 1px 3px rgba(0,0,0,0.5));
      "></div>
    </div>
  ` : '';

  return L.divIcon({
    className: 'bus-icon',
    html: `
      <div style="position: relative; width: 80px; height: 80px; overflow: visible; transform: scale(${scale}); transition: transform 0.1s ease-out;">
        ${arrowHtml}
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          width: 40px;
          height: 40px;
          background: ${color};
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          z-index: 2;
        ">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
            <path d="M4 16C4 16.88 4.39 17.67 5 18.22V20C5 20.55 5.45 21 6 21H7C7.55 21 8 20.55 8 20V19H16V20C16 20.55 16.45 21 17 21H18C18.55 21 19 20.55 19 20V18.22C19.61 17.67 20 16.88 20 16V6C20 2.5 16.42 2 12 2C7.58 2 4 2.5 4 6V16ZM7.5 17C6.67 17 6 16.33 6 15.5C6 14.67 6.67 14 7.5 14C8.33 14 9 14.67 9 15.5C9 16.33 8.33 17 7.5 17ZM16.5 17C15.67 17 15 16.33 15 15.5C15 14.67 15.67 14 16.5 14C17.33 14 18 14.67 18 15.5C18 16.33 17.33 17 16.5 17ZM18 11H6V6H18V11Z"/>
          </svg>
          <span style="color:white;font-size:10px;font-weight:700;letter-spacing:0.3px;line-height:1;">${routeLabel}</span>
        </div>
      </div>
    `,
    iconSize: [80, 80],
    iconAnchor: [40, 40],
  });
};

// Create stop icon
const createStopIcon = (isSelected) => {
  const size = isSelected ? 16 : 12;
  return L.divIcon({
    className: 'stop-icon',
    html: `<div style="background:${isSelected ? '#1a73e8' : 'white'};width:${size}px;height:${size}px;border-radius:50%;border:2px solid ${isSelected ? 'white' : '#1a73e8'};box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// Web Route Polyline - Professional rendering with casing, offset, and hover support
export const WebRoutePolyline = ({
  coordinates,
  color,
  strokeWidth = 6,
  opacity = 0.85,
  outlineWidth = 2,
  outlineColor = '#000000',
  offset = 0,
  smoothFactor = 1.5,
  lineCap = 'round',
  lineJoin = 'round',
  onMouseOver,
  onMouseOut,
  interactive = true,
}) => {
  const positions = coordinates.map(c => [c.latitude, c.longitude]);

  const fillOptions = {
    color,
    weight: strokeWidth,
    opacity,
    smoothFactor,
    lineCap,
    lineJoin,
    interactive,
    ...(offset !== 0 && { offset }),
  };

  const eventHandlers = {};
  if (onMouseOver) eventHandlers.mouseover = onMouseOver;
  if (onMouseOut) eventHandlers.mouseout = onMouseOut;

  if (outlineWidth > 0) {
    const resolvedOutlineColor = outlineColor || darkenColorHex(color, 0.4);
    const outlineOptions = {
      color: resolvedOutlineColor,
      weight: strokeWidth + outlineWidth * 2,
      opacity,
      smoothFactor,
      lineCap,
      lineJoin,
      interactive: false,
      ...(offset !== 0 && { offset }),
    };

    return (
      <>
        <Polyline positions={positions} pathOptions={outlineOptions} />
        <Polyline positions={positions} pathOptions={fillOptions} eventHandlers={eventHandlers} />
      </>
    );
  }

  return <Polyline positions={positions} pathOptions={fillOptions} eventHandlers={eventHandlers} />;
};

// Inline darken helper for web (avoids importing geometryUtils into web map module)
const darkenColorHex = (hex, factor = 0.3) => {
  if (!hex || !hex.startsWith('#')) return hex;
  const raw = hex.replace('#', '');
  const r = Math.round(parseInt(raw.substring(0, 2), 16) * (1 - factor));
  const g = Math.round(parseInt(raw.substring(2, 4), 16) * (1 - factor));
  const b = Math.round(parseInt(raw.substring(4, 6), 16) * (1 - factor));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

// Web Bus Marker — uses animated position/bearing for smooth interpolation
export const WebBusMarker = ({ vehicle, color, routeLabel: routeLabelProp }) => {
  if (!vehicle.coordinate?.latitude || !vehicle.coordinate?.longitude) return null;
  const label = routeLabelProp || vehicle.routeId;

  const { latitude, longitude, bearing, scale } = useAnimatedBusPosition(vehicle);

  // Memoize icon — only recreate when bearing crosses threshold or color/label changes
  const lastIconRef = useRef({ bearing: null, color: null, label: null, icon: null });
  const icon = useMemo(() => {
    const prev = lastIconRef.current;
    const bearingChanged = prev.bearing === null ||
      Math.abs(bearing - prev.bearing) >= ANIMATION.BUS_BEARING_THRESHOLD_DEG;
    const otherChanged = prev.color !== color || prev.label !== label;

    if (!bearingChanged && !otherChanged && prev.icon) {
      return prev.icon;
    }

    const newIcon = createBusIcon(color, label, bearing, scale);
    lastIconRef.current = { bearing, color, label, icon: newIcon };
    return newIcon;
  }, [bearing, color, label, scale]);

  if (ROUTE_LABEL_DEBUG) {
    const raw = String(vehicle.routeId || '').trim();
    if (/^(2|2A|2B|7|7A|7B|12|12A|12B)$/i.test(raw)) {
      const signature = `${raw}|${String(label)}|${String(routeLabelProp || '')}`;
      if (webMarkerDebugState.get(vehicle.id) !== signature) {
        webMarkerDebugState.set(vehicle.id, signature);
        console.info(
          '[route-label-debug][web-marker] bus=%s raw=%s prop=%s rendered=%s',
          vehicle.id,
          raw || '-',
          routeLabelProp || '-',
          label || '-'
        );
      }
    }
  }

  if (!latitude || !longitude) return null;

  return (
    <Marker
      position={[latitude, longitude]}
      icon={icon}
    >
      <Popup>
        <strong>Route {label}</strong><br />
        {vehicle.label && `Bus ${vehicle.label}`}
      </Popup>
    </Marker>
  );
};

// Web Stop Marker
export const WebStopMarker = ({ stop, onPress, isSelected }) => {
  return (
    <Marker
      position={[stop.latitude, stop.longitude]}
      icon={createStopIcon(isSelected)}
      eventHandlers={{ click: () => onPress?.(stop) }}
    >
      <Popup>
        <strong>{stop.name}</strong><br />
        Stop #{stop.code}
      </Popup>
    </Marker>
  );
};

// Main Web Map Component
const WebMapView = forwardRef(({ initialRegion, children, onRegionChangeComplete, onPress, onUserInteraction }, ref) => {
  const controllerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    animateToRegion: (region, duration) => {
      controllerRef.current?.animateToRegion(region, duration);
    },
    fitToCoordinates: (coords, options) => {
      controllerRef.current?.fitToCoordinates(coords, options);
    },
  }));

  const center = [initialRegion.latitude, initialRegion.longitude];
  const zoom = getZoomFromDelta(initialRegion.latitudeDelta);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
      <MapContainer
        center={center}
        zoom={zoom}
        zoomControl={false}
        style={{ width: '100%', height: '100%' }}
        whenReady={(mapInstance) => {
          mapInstance.target.on('moveend', () => {
            const bounds = mapInstance.target.getBounds();
            const c = mapInstance.target.getCenter();
            onRegionChangeComplete?.({
              latitude: c.lat,
              longitude: c.lng,
              latitudeDelta: bounds.getNorth() - bounds.getSouth(),
              longitudeDelta: bounds.getEast() - bounds.getWest(),
            });
          });
          // Detect user-initiated drag (not programmatic flyTo/fitBounds)
          mapInstance.target.on('dragend', () => {
            onUserInteraction?.();
          });
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://stadiamaps.com/">Stadia Maps</a>'
          url="https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png"
        />
        <MapController ref={controllerRef} />
        <MapClickHandler onPress={onPress} />
        {children}
      </MapContainer>
    </div>
  );
});

export default WebMapView;
