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

// Inject bus marker pulse + polyline draw-on animations
if (typeof document !== 'undefined' && !document.getElementById('bus-pulse-css')) {
  const pulseStyle = document.createElement('style');
  pulseStyle.id = 'bus-pulse-css';
  pulseStyle.textContent = `
    @keyframes busPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.85; }
    }
    .bus-icon > div {
      animation: busPulse 2.4s ease-in-out infinite;
    }
    @keyframes polylineDrawOn {
      from { stroke-dashoffset: 2000; }
      to { stroke-dashoffset: 0; }
    }
    .polyline-draw-on {
      stroke-dasharray: 2000;
      animation: polylineDrawOn 1.2s ease-out forwards;
    }
  `;
  document.head.appendChild(pulseStyle);
}

// Convert lat/lng delta to zoom level
const getZoomFromDelta = (latDelta) => {
  return Math.round(Math.log(360 / latDelta) / Math.LN2);
};
const webMarkerDebugState = new Map();
const ROUTE_LABEL_DEBUG = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_ROUTE_LABEL_DEBUG === 'true';

// Map controller for ref methods
const MapController = forwardRef((props, ref) => {
  const map = useMap();

  useImperativeHandle(ref, () => ({
    animateToRegion: (region, duration = 500) => {
      map.stop(); // Cancel any in-progress flyTo animation
      map.flyTo([region.latitude, region.longitude], getZoomFromDelta(region.latitudeDelta), {
        duration: duration / 1000,
      });
    },
    fitToCoordinates: (coords, options = {}) => {
      if (!coords || coords.length === 0) return;
      map.stop(); // Cancel any in-progress animation
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

// Create professional pill bus icon with route number and direction arrow
const createBusIcon = (color, routeId, bearing = null, scale = 1) => {
  const routeLabel = routeId || '?';
  const hasValidBearing = bearing !== null && bearing !== undefined;

  const arrowHtml = hasValidBearing ? `
    <svg width="80" height="80" viewBox="0 0 80 80"
      style="position:absolute;top:0;left:0;pointer-events:none;z-index:1;">
      <path d="M40 2 L30 32 L40 22 L50 32 Z"
        fill="#222222" stroke="white" stroke-width="2" stroke-linejoin="round"
        transform="rotate(${bearing}, 40, 40)"/>
    </svg>
  ` : '';

  return L.divIcon({
    className: 'bus-icon',
    html: `
      <div style="position:relative;width:80px;height:80px;overflow:visible;transform:scale(${scale});transition:transform 0.1s ease-out;">
        ${arrowHtml}
        <div style="
          position:absolute;
          top:50%;left:50%;
          transform:translate(-50%,-50%);
          display:inline-flex;
          align-items:center;
          justify-content:center;
          width:44px;
          height:44px;
          background:linear-gradient(to bottom, rgba(255,255,255,0.10) 0%, transparent 50%), ${color};
          border-radius:50%;
          border:2.5px solid rgba(255,255,255,0.92);
          box-shadow:0 1px 3px rgba(0,0,0,0.30), 0 3px 8px rgba(0,0,0,0.12);
          z-index:2;
          overflow:hidden;
          box-sizing:border-box;
        ">
          <span style="
            color:white;
            font-size:17px;
            font-weight:800;
            letter-spacing:0.5px;
            text-shadow:0 1px 2px rgba(0,0,0,0.25);
            line-height:1;
            position:relative;
            z-index:1;
          ">${routeLabel}</span>
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
  const hitArea = 24; // Larger click target
  const offset = (hitArea - size) / 2;
  return L.divIcon({
    className: '', // Avoid default leaflet-div-icon styling
    html: `<div style="width:${hitArea}px;height:${hitArea}px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><div style="background:${isSelected ? '#1a73e8' : 'white'};width:${size}px;height:${size}px;border-radius:50%;border:2px solid ${isSelected ? 'white' : '#1a73e8'};box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div></div>`,
    iconSize: [hitArea, hitArea],
    iconAnchor: [hitArea / 2, hitArea / 2],
  });
};

// Compute evenly spaced label positions along a coordinate array
const computeLabelPositions = (coordinates, spacingPx, map) => {
  if (!map || coordinates.length < 2) return [];

  const points = coordinates.map(c => map.latLngToContainerPoint([c.latitude, c.longitude]));
  const labels = [];
  let accumulated = spacingPx / 2; // start offset so first label isn't at the very beginning

  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (segLen === 0) continue;

    let remaining = segLen;
    while (accumulated <= remaining) {
      const ratio = accumulated / segLen;
      const lat = coordinates[i - 1].latitude + ratio * (coordinates[i].latitude - coordinates[i - 1].latitude);
      const lon = coordinates[i - 1].longitude + ratio * (coordinates[i].longitude - coordinates[i - 1].longitude);
      // Bearing in degrees, ensure text reads left-to-right
      let angle = Math.atan2(dy, dx) * (180 / Math.PI);
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      labels.push({ lat, lon, angle });
      remaining -= accumulated;
      accumulated = spacingPx;
    }
    accumulated -= remaining;
  }

  return labels;
};

// Inline route label markers along a polyline
export const RouteLineLabels = ({ coordinates, color, routeLabel }) => {
  const map = useMap();

  const labelPositions = useMemo(() => {
    if (!routeLabel || !map) return [];
    return computeLabelPositions(coordinates, 250, map);
  }, [coordinates, routeLabel, map]);

  if (labelPositions.length === 0) return null;

  return labelPositions.map((pos, i) => (
    <Marker
      key={`${routeLabel}-label-${i}`}
      position={[pos.lat, pos.lon]}
      interactive={false}
      icon={L.divIcon({
        className: '',
        html: `<div style="
          font-size:11px;
          font-weight:700;
          color:${color};
          text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 -2px 0 #fff, 0 2px 0 #fff, -2px 0 0 #fff, 2px 0 0 #fff;
          opacity:0.75;
          white-space:nowrap;
          transform:rotate(${pos.angle}deg);
          pointer-events:none;
        ">${routeLabel}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 6],
      })}
    />
  ));
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
  dashArray = null,
  onMouseOver,
  onMouseOut,
  interactive = true,
  className = '',
  routeLabel = null,
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
    ...(dashArray != null && { dashArray }),
    ...(className && { className }),
  };

  const eventHandlers = {};
  if (onMouseOver) eventHandlers.mouseover = onMouseOver;
  if (onMouseOut) eventHandlers.mouseout = onMouseOut;

  const labels = routeLabel ? (
    <RouteLineLabels coordinates={coordinates} color={color} routeLabel={routeLabel} />
  ) : null;

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
        {labels}
      </>
    );
  }

  return (
    <>
      <Polyline positions={positions} pathOptions={fillOptions} eventHandlers={eventHandlers} />
      {labels}
    </>
  );
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
      zIndexOffset={isSelected ? 1000 : 500}
      eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onPress?.(stop); } }}
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
          // Detect user-initiated drag — cancel any programmatic animation
          mapInstance.target.on('dragstart', () => {
            mapInstance.target.stop();
          });
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
