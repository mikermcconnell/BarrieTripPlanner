/**
 * Web-only map component using MapLibre GL JS.
 * This component should ONLY be imported on web.
 */
import React, {
  createContext,
  forwardRef,
  memo,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAnimatedBusPosition } from '../hooks/useAnimatedBusPosition';
import { OSM_MAP_STYLE } from '../config/constants';
import { escapeHtml } from '../utils/htmlUtils';

const MAPLIBRE_CSS_URL = 'https://unpkg.com/maplibre-gl@5.19.0/dist/maplibre-gl.css';
const MAPLIBRE_JS_URL = 'https://unpkg.com/maplibre-gl@5.19.0/dist/maplibre-gl.js';
const MapContext = createContext(null);
const webMarkerDebugState = new Map();
const ROUTE_LABEL_DEBUG =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  process.env.EXPO_PUBLIC_ROUTE_LABEL_DEBUG === 'true';

let mapElementCounter = 0;

const getNextMapElementId = (prefix) => {
  mapElementCounter += 1;
  return `${prefix}-${mapElementCounter}`;
};

const getZoomFromDelta = (latDelta) => Math.round(Math.log(360 / latDelta) / Math.LN2);
const getDeltaFromZoom = (zoom) => 360 / Math.pow(2, zoom);

const buildMapPadding = (edgePadding = {}) => ({
  top: edgePadding.top || 50,
  right: edgePadding.right || 50,
  bottom: edgePadding.bottom || 50,
  left: edgePadding.left || 50,
});

const darkenColorHex = (hex, factor = 0.3) => {
  if (!hex || !hex.startsWith('#')) return hex;
  const raw = hex.replace('#', '');
  const r = Math.round(parseInt(raw.substring(0, 2), 16) * (1 - factor));
  const g = Math.round(parseInt(raw.substring(2, 4), 16) * (1 - factor));
  const b = Math.round(parseInt(raw.substring(4, 6), 16) * (1 - factor));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

const parseDashArray = (dashArray, strokeWidth) => {
  if (!dashArray) return undefined;
  const values = Array.isArray(dashArray)
    ? dashArray
    : String(dashArray)
        .split(/[\s,]+/)
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value));

  if (values.length === 0) return undefined;

  return values.map((value) => value / Math.max(strokeWidth, 1));
};

let mapLibreScriptPromise = null;

const ensureGlobalAssets = () => {
  if (typeof document === 'undefined') return;

  if (!document.getElementById('maplibre-css')) {
    const link = document.createElement('link');
    link.id = 'maplibre-css';
    link.rel = 'stylesheet';
    link.href = MAPLIBRE_CSS_URL;
    document.head.appendChild(link);
  }

  if (!document.getElementById('maplibre-custom-css')) {
    const style = document.createElement('style');
    style.id = 'maplibre-custom-css';
    style.textContent = `
      .maplibregl-ctrl-attrib {
        font-size: 9px !important;
        background: rgba(255, 255, 255, 0.55) !important;
        padding: 1px 6px !important;
        color: #666 !important;
        backdrop-filter: blur(4px);
      }
      .maplibregl-ctrl-attrib a {
        color: #888 !important;
        text-decoration: none !important;
      }
      @keyframes busPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.85; }
      }
      .bus-icon > div {
        animation: busPulse 2.4s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
  }
};

const ensureMapLibreGlobal = async () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  if (window.maplibregl) {
    return window.maplibregl;
  }

  if (mapLibreScriptPromise) {
    return mapLibreScriptPromise;
  }

  mapLibreScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById('maplibre-js');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.maplibregl), { once: true });
      existingScript.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'maplibre-js';
    script.src = MAPLIBRE_JS_URL;
    script.async = true;
    script.onload = () => resolve(window.maplibregl);
    script.onerror = (error) => reject(error);
    document.head.appendChild(script);
  });

  return mapLibreScriptPromise;
};

const useMapContext = () => useContext(MapContext);

const useStableMapId = (prefix) => {
  const idRef = useRef(null);
  if (!idRef.current) {
    idRef.current = getNextMapElementId(prefix);
  }
  return idRef.current;
};

const safeGetLayer = (map, layerId) => {
  try {
    return map?.getLayer?.(layerId) ?? null;
  } catch {
    return null;
  }
};

const safeGetSource = (map, sourceId) => {
  try {
    return map?.getSource?.(sourceId) ?? null;
  } catch {
    return null;
  }
};

const resetCursorIfNeeded = (map) => {
  try {
    if (map?.getCanvas?.()?.style?.cursor === 'pointer') {
      map.getCanvas().style.cursor = '';
    }
  } catch {
    // The map may already be destroyed during teardown.
  }
};

const createMarkerElement = ({ html, className = '', onClickRef, zIndexOffset = 0 }) => {
  const element = document.createElement('div');
  element.className = className;
  element.style.pointerEvents = 'auto';
  element.style.cursor = onClickRef?.current ? 'pointer' : 'default';
  element.style.zIndex = String(zIndexOffset);
  element.innerHTML = html;
  element.addEventListener('click', (event) => {
    if (!onClickRef?.current) return;
    event.preventDefault();
    event.stopPropagation();
    onClickRef.current(event);
  });

  return element;
};

const updateMarkerElement = (element, { html, className = '', zIndexOffset = 0 }) => {
  if (!element) return;
  element.className = className;
  element.style.zIndex = String(zIndexOffset);
  element.innerHTML = html;
};

const createBusHtml = (color, routeId, bearing = null, scale = 1) => {
  const routeLabel = escapeHtml(routeId || '?');
  const hasValidBearing = bearing !== null && bearing !== undefined;

  const arrowHtml = hasValidBearing ? `
    <svg width="80" height="80" viewBox="0 0 80 80"
      style="position:absolute;top:0;left:0;pointer-events:none;z-index:1;">
      <path d="M40 2 L30 32 L40 22 L50 32 Z"
        fill="#222222" stroke="white" stroke-width="2" stroke-linejoin="round"
        transform="rotate(${bearing}, 40, 40)"/>
    </svg>
  ` : '';

  return `
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
  `;
};

const createStopHtml = (isSelected) => {
  const size = isSelected ? 16 : 12;
  const hitArea = 24;

  return `<div style="width:${hitArea}px;height:${hitArea}px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><div style="background:${isSelected ? '#1a73e8' : 'white'};width:${size}px;height:${size}px;border-radius:50%;border:2px solid ${isSelected ? 'white' : '#1a73e8'};box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div></div>`;
};

const buildPopup = (maplibre, popupHtml) => {
  if (!maplibre || !popupHtml) return null;
  return new maplibre.Popup({
    offset: 12,
    closeButton: false,
    closeOnClick: true,
    maxWidth: '220px',
  }).setHTML(popupHtml);
};

const WebHtmlMarkerComponent = ({
  coordinate,
  html,
  className = '',
  anchor = 'center',
  offset = [0, 0],
  zIndexOffset = 0,
  onPress,
  popupHtml,
}) => {
  const context = useMapContext();
  const markerRef = useRef(null);
  const elementRef = useRef(null);
  const onPressRef = useRef(onPress);
  const hasValidCoordinate =
    Number.isFinite(coordinate?.latitude) &&
    Number.isFinite(coordinate?.longitude);

  onPressRef.current = onPress;

  useEffect(() => {
    if (!context?.map || !context?.maplibre || !hasValidCoordinate || typeof document === 'undefined') {
      return undefined;
    }

    const element = createMarkerElement({
      html,
      className,
      onClickRef: onPressRef,
      zIndexOffset,
    });
    const marker = new context.maplibre.Marker({
      element,
      anchor,
      offset,
    })
      .setLngLat([coordinate.longitude, coordinate.latitude])
      .addTo(context.map);

    const popup = buildPopup(context.maplibre, popupHtml);
    if (popup) {
      marker.setPopup(popup);
    }

    markerRef.current = marker;
    elementRef.current = element;

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      elementRef.current = null;
    };
  }, [anchor, context?.map, context?.maplibre, hasValidCoordinate, offset]);

  useEffect(() => {
    if (!markerRef.current || !hasValidCoordinate) return;
    markerRef.current.setLngLat([coordinate.longitude, coordinate.latitude]);
  }, [coordinate?.latitude, coordinate?.longitude, hasValidCoordinate]);

  useEffect(() => {
    if (!elementRef.current) return;
    updateMarkerElement(elementRef.current, { html, className, zIndexOffset });
  }, [className, html, zIndexOffset]);

  useEffect(() => {
    if (!elementRef.current) return;
    elementRef.current.style.cursor = onPress ? 'pointer' : 'default';
  }, [onPress]);

  useEffect(() => {
    if (!markerRef.current) return;
    if (!popupHtml) {
      markerRef.current.setPopup(null);
      return;
    }
    markerRef.current.setPopup(buildPopup(context?.maplibre, popupHtml));
  }, [context?.maplibre, popupHtml]);

  return null;
};

export const WebHtmlMarker = memo(WebHtmlMarkerComponent);

const resolveLayerCallbacks = ({ callbacksRef, onClick, onMouseOver, onMouseOut }) => {
  if (callbacksRef?.current) {
    return callbacksRef.current;
  }

  return { onClick, onMouseOver, onMouseOut };
};

const applyLayerEvents = ({ map, layerId, interactive, callbacksRef, onClick, onMouseOver, onMouseOut }) => {
  if (!interactive || !safeGetLayer(map, layerId)) {
    return () => {};
  }

  const callbacks = resolveLayerCallbacks({ callbacksRef, onClick, onMouseOver, onMouseOut });
  const handleClick = () => callbacks.onClick?.();
  const handleMouseEnter = () => {
    map.getCanvas().style.cursor = 'pointer';
    callbacks.onMouseOver?.();
  };
  const handleMouseLeave = () => {
    map.getCanvas().style.cursor = '';
    callbacks.onMouseOut?.();
  };

  map.on('click', layerId, handleClick);
  map.on('mouseenter', layerId, handleMouseEnter);
  map.on('mouseleave', layerId, handleMouseLeave);

  return () => {
    if (safeGetLayer(map, layerId)) {
      map.off('click', layerId, handleClick);
      map.off('mouseenter', layerId, handleMouseEnter);
      map.off('mouseleave', layerId, handleMouseLeave);
    }
    resetCursorIfNeeded(map);
  };
};

const removeLayerIfExists = (map, layerId) => {
  if (safeGetLayer(map, layerId)) {
    map.removeLayer(layerId);
  }
};

const removeSourceIfExists = (map, sourceId) => {
  if (safeGetSource(map, sourceId)) {
    map.removeSource(sourceId);
  }
};

const addLineLayers = ({
  map,
  sourceId,
  outlineId,
  fillId,
  labelId,
  arrowId,
  geoJson,
  color,
  strokeWidth,
  opacity,
  outlineWidth,
  outlineColor,
  lineCap,
  lineJoin,
  dashArray,
  offset,
  routeLabel,
  showArrows,
}) => {
  map.addSource(sourceId, {
    type: 'geojson',
    data: geoJson,
    lineMetrics: true,
  });

  const lineDasharray = parseDashArray(dashArray, strokeWidth);

  if (outlineWidth > 0) {
    map.addLayer({
      id: outlineId,
      type: 'line',
      source: sourceId,
      layout: {
        'line-cap': lineCap,
        'line-join': lineJoin,
      },
      paint: {
        'line-color': outlineColor || darkenColorHex(color, 0.4),
        'line-width': strokeWidth + outlineWidth * 2,
        'line-opacity': opacity,
        ...(lineDasharray ? { 'line-dasharray': lineDasharray } : {}),
        ...(offset ? { 'line-offset': offset } : {}),
      },
    });
  }

  map.addLayer({
    id: fillId,
    type: 'line',
    source: sourceId,
    layout: {
      'line-cap': lineCap,
      'line-join': lineJoin,
    },
    paint: {
      'line-color': color,
      'line-width': strokeWidth,
      'line-opacity': opacity,
      ...(lineDasharray ? { 'line-dasharray': lineDasharray } : {}),
      ...(offset ? { 'line-offset': offset } : {}),
    },
  });

  if (showArrows) {
    map.addLayer({
      id: arrowId,
      type: 'symbol',
      source: sourceId,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 150,
        'text-field': '▶',
        'text-size': 10,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-rotation-alignment': 'map',
      },
      paint: {
        'text-color': color,
        'text-opacity': opacity,
      },
    });
  }

  if (routeLabel) {
    map.addLayer({
      id: labelId,
      type: 'symbol',
      source: sourceId,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 250,
        'text-field': routeLabel,
        'text-size': 11,
        'text-rotation-alignment': 'map',
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      paint: {
        'text-color': color,
        'text-halo-color': '#FFFFFF',
        'text-halo-width': 2,
        'text-opacity': 0.75,
      },
    });
  }
};

const WebRoutePolylineComponent = ({
  coordinates,
  color,
  strokeWidth = 6,
  opacity = 0.85,
  outlineWidth = 2,
  outlineColor = '#000000',
  offset = 0,
  lineCap = 'round',
  lineJoin = 'round',
  dashArray = null,
  onMouseOver,
  onMouseOut,
  onPress,
  interactive = true,
  routeLabel = null,
  showArrows = false,
}) => {
  const context = useMapContext();
  const baseId = useStableMapId('web-route');
  const callbacksRef = useRef({ onClick: onPress, onMouseOver, onMouseOut });

  callbacksRef.current = { onClick: onPress, onMouseOver, onMouseOut };

  useEffect(() => {
    if (!context?.map || !context.isReady || !Array.isArray(coordinates) || coordinates.length < 2) {
      return undefined;
    }

    const sourceId = `${baseId}-source`;
    const outlineId = `${baseId}-outline`;
    const fillId = `${baseId}-fill`;
    const labelId = `${baseId}-label`;
    const arrowId = `${baseId}-arrow`;

    const geoJson = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: coordinates.map((coord) => [coord.longitude, coord.latitude]),
      },
    };

    addLineLayers({
      map: context.map,
      sourceId,
      outlineId,
      fillId,
      labelId,
      arrowId,
      geoJson,
      color,
      strokeWidth,
      opacity,
      outlineWidth,
      outlineColor,
      lineCap,
      lineJoin,
      dashArray,
      offset,
      routeLabel,
      showArrows,
    });

    const cleanupEvents = applyLayerEvents({
      map: context.map,
      layerId: fillId,
      interactive,
      callbacksRef,
    });

    return () => {
      cleanupEvents();
      removeLayerIfExists(context.map, labelId);
      removeLayerIfExists(context.map, arrowId);
      removeLayerIfExists(context.map, fillId);
      removeLayerIfExists(context.map, outlineId);
      removeSourceIfExists(context.map, sourceId);
    };
  }, [
    baseId,
    color,
    context?.isReady,
    context?.map,
    coordinates,
    dashArray,
    interactive,
    lineCap,
    lineJoin,
    offset,
    opacity,
    outlineColor,
    outlineWidth,
    routeLabel,
    showArrows,
    strokeWidth,
  ]);

  return null;
};

export const WebRoutePolyline = memo(WebRoutePolylineComponent);

export const RouteLineLabels = memo(({ coordinates, color, routeLabel }) => (
  <WebRoutePolyline
    coordinates={coordinates}
    color={color}
    strokeWidth={1}
    opacity={0}
    outlineWidth={0}
    interactive={false}
    routeLabel={routeLabel}
  />
));

export const WebRouteArrows = memo(({ coordinates, color, opacity = 0.7 }) => (
  <WebRoutePolyline
    coordinates={coordinates}
    color={color}
    strokeWidth={1}
    opacity={opacity}
    outlineWidth={0}
    interactive={false}
    showArrows
  />
));

export const WebPolygon = memo(({
  coordinates,
  color,
  fillOpacity = 0.15,
  strokeOpacity = 0.6,
  strokeWidth = 2,
  dashArray = '8, 6',
  onPress,
}) => {
  const context = useMapContext();
  const baseId = useStableMapId('web-polygon');
  const callbacksRef = useRef({ onClick: onPress });

  callbacksRef.current = { onClick: onPress };

  useEffect(() => {
    if (!context?.map || !context.isReady || !Array.isArray(coordinates) || coordinates.length < 3) {
      return undefined;
    }

    const sourceId = `${baseId}-source`;
    const fillId = `${baseId}-fill`;
    const lineId = `${baseId}-line`;

    context.map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[...coordinates.map((coord) => [coord.longitude, coord.latitude]), [coordinates[0].longitude, coordinates[0].latitude]]],
        },
      },
    });

    context.map.addLayer({
      id: fillId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': color,
        'fill-opacity': fillOpacity,
      },
    });

    context.map.addLayer({
      id: lineId,
      type: 'line',
      source: sourceId,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': color,
        'line-opacity': strokeOpacity,
        'line-width': strokeWidth,
        ...(parseDashArray(dashArray, strokeWidth) ? { 'line-dasharray': parseDashArray(dashArray, strokeWidth) } : {}),
      },
    });

    const cleanupEvents = applyLayerEvents({
      map: context.map,
      layerId: fillId,
      interactive: Boolean(onPress),
      callbacksRef,
    });

    return () => {
      cleanupEvents();
      removeLayerIfExists(context.map, lineId);
      removeLayerIfExists(context.map, fillId);
      removeSourceIfExists(context.map, sourceId);
    };
  }, [
    baseId,
    color,
    context?.isReady,
    context?.map,
    coordinates,
    dashArray,
    fillOpacity,
    onPress,
    strokeOpacity,
    strokeWidth,
  ]);

  return null;
});

export const __TEST_ONLY__ = {
  applyLayerEvents,
  resolveLayerCallbacks,
};

export const WebBusMarker = memo(({ vehicle, color, routeLabel: routeLabelProp, snapPath = null }) => {
  if (!vehicle?.coordinate?.latitude || !vehicle?.coordinate?.longitude) return null;
  const label = routeLabelProp || vehicle.routeId;
  const { latitude, longitude, bearing, scale } = useAnimatedBusPosition(vehicle, { snapPath });

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
    <WebHtmlMarker
      coordinate={{ latitude, longitude }}
      html={createBusHtml(color, label, bearing, scale)}
      className="bus-icon"
      popupHtml={`<strong>Route ${escapeHtml(label)}</strong>${vehicle.label ? `<br />Bus ${escapeHtml(vehicle.label)}` : ''}`}
    />
  );
});

export const WebStopMarker = memo(({ stop, onPress, isSelected }) => (
  <WebHtmlMarker
    coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
    html={createStopHtml(isSelected)}
    zIndexOffset={isSelected ? 1000 : 500}
    onPress={() => onPress?.(stop)}
    popupHtml={`<strong>${escapeHtml(stop.name)}</strong><br />Stop #${escapeHtml(stop.code)}`}
  />
));

const WebMapView = forwardRef(({
  initialRegion,
  children,
  onRegionChangeComplete,
  onPress,
  onUserInteraction,
  onMapReady,
}, ref) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const maplibreRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const callbacksRef = useRef({
    onRegionChangeComplete,
    onPress,
    onUserInteraction,
    onMapReady,
  });

  callbacksRef.current = {
    onRegionChangeComplete,
    onPress,
    onUserInteraction,
    onMapReady,
  };

  useEffect(() => {
    ensureGlobalAssets();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || !containerRef.current || mapRef.current) {
      return undefined;
    }

    let isCancelled = false;
    let map = null;

    const initMap = async () => {
      const maplibre = await ensureMapLibreGlobal();
      if (isCancelled || !containerRef.current || mapRef.current || !maplibre) {
        return;
      }

      maplibreRef.current = maplibre;
      map = new maplibre.Map({
        container: containerRef.current,
        style: OSM_MAP_STYLE,
        center: [initialRegion.longitude, initialRegion.latitude],
        zoom: getZoomFromDelta(initialRegion.latitudeDelta),
        attributionControl: true,
      });

      mapRef.current = map;

      const handleLoad = () => {
        setIsReady(true);
        callbacksRef.current.onMapReady?.(map);
      };
      const handleMoveEnd = () => {
        const center = map.getCenter();
        const bounds = map.getBounds();
        callbacksRef.current.onRegionChangeComplete?.({
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: bounds.getNorth() - bounds.getSouth(),
          longitudeDelta: bounds.getEast() - bounds.getWest(),
        });
      };
      const handleUserInteraction = () => {
        callbacksRef.current.onUserInteraction?.();
      };
      const handleClick = (event) => {
        callbacksRef.current.onPress?.({
          nativeEvent: {
            coordinate: {
              latitude: event.lngLat.lat,
              longitude: event.lngLat.lng,
            },
          },
        });
      };

      map.on('load', handleLoad);
      map.on('moveend', handleMoveEnd);
      map.on('dragstart', () => {
        map.stop();
        handleUserInteraction();
      });
      map.on('zoomstart', handleUserInteraction);
      map.on('click', handleClick);
    };

    initMap().catch((error) => {
      console.error('[WebMapView] Failed to initialize MapLibre', error);
    });

    return () => {
      isCancelled = true;
      setIsReady(false);
      map?.remove();
      mapRef.current = null;
      maplibreRef.current = null;
    };
  }, [initialRegion.latitude, initialRegion.latitudeDelta, initialRegion.longitude]);

  useImperativeHandle(ref, () => ({
    animateToRegion: (region, duration = 500) => {
      if (!mapRef.current) return;
      mapRef.current.stop();
      mapRef.current.easeTo({
        center: [region.longitude, region.latitude],
        zoom: getZoomFromDelta(region.latitudeDelta),
        duration,
      });
    },
    fitToCoordinates: (coords, options = {}) => {
      if (!mapRef.current || !maplibreRef.current || !Array.isArray(coords) || coords.length === 0) return;
      mapRef.current.stop();
      const bounds = new maplibreRef.current.LngLatBounds();
      coords.forEach((coord) => bounds.extend([coord.longitude, coord.latitude]));
      mapRef.current.fitBounds(bounds, {
        padding: buildMapPadding(options.edgePadding),
        ...(Number.isFinite(options.maxZoom) ? { maxZoom: options.maxZoom } : {}),
        duration: options.animated === false ? 0 : 500,
      });
    },
    setBearing: (bearing = 0, duration = 0) => {
      if (!mapRef.current) return;
      mapRef.current.stop();
      if (duration > 0) {
        mapRef.current.easeTo({ bearing, duration });
        return;
      }
      mapRef.current.jumpTo({ bearing });
    },
    getRegion: () => {
      if (!mapRef.current) return null;
      const center = mapRef.current.getCenter();
      const bounds = mapRef.current.getBounds();
      return {
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: bounds.getNorth() - bounds.getSouth() || getDeltaFromZoom(mapRef.current.getZoom()),
        longitudeDelta: bounds.getEast() - bounds.getWest(),
      };
    },
  }), []);

  const contextValue = useMemo(() => ({
    map: mapRef.current,
    maplibre: maplibreRef.current,
    isReady,
  }), [isReady]);

  return (
    <MapContext.Provider value={contextValue}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
      {isReady ? children : null}
    </MapContext.Provider>
  );
});

export default WebMapView;
