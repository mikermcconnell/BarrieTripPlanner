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
import { Image as RNImage } from 'react-native';
import { useAnimatedBusPosition } from '../hooks/useAnimatedBusPosition';
import { OSM_MAP_STYLE } from '../config/constants';
import { ROUTE_LINE_LABEL_STYLE } from '../config/routeLineLabels';
import { COLORS } from '../config/theme';
import { escapeHtml } from '../utils/htmlUtils';

const MAPLIBRE_CSS_URL = 'https://unpkg.com/maplibre-gl@5.19.0/dist/maplibre-gl.css';
const MAPLIBRE_JS_URL = 'https://unpkg.com/maplibre-gl@5.19.0/dist/maplibre-gl.js';
const BUS_HUB_ICON_CENTER_OFFSET = [0, 0];
const WEB_BUS_MARKER_IMAGE_SIZE = 46;
const WEB_BUS_MARKER_FALLBACK_SIZE = 44;
const WEB_BUS_MARKER_HEADING_SVG_SIZE = 104;
const BUS_MARKER_SOURCES = {
  1: require('../../assets/bus-markers/route-1.png'),
  2: require('../../assets/bus-markers/route-2.png'),
  3: require('../../assets/bus-markers/route-3.png'),
  4: require('../../assets/bus-markers/route-4.png'),
  5: require('../../assets/bus-markers/route-5.png'),
  6: require('../../assets/bus-markers/route-6.png'),
  7: require('../../assets/bus-markers/route-7.png'),
  8: require('../../assets/bus-markers/route-8.png'),
  90: require('../../assets/bus-markers/route-90.png'),
  100: require('../../assets/bus-markers/route-100.png'),
};
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


const WEB_MAP_KEYBOARD_PAN_PIXELS = 140;

const isEditableKeyboardTarget = (target) => {
  const tagName = String(target?.tagName || '').toLowerCase();
  return Boolean(
    target?.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
};

const handleWebMapKeyboardPan = ({ map, event, onUserInteraction }) => {
  if (!map || !event || isEditableKeyboardTarget(event.target)) {
    return false;
  }

  const pan = WEB_MAP_KEYBOARD_PAN_PIXELS;
  const keyActions = {
    ArrowUp: () => map.panBy?.([0, -pan], { duration: 220 }),
    ArrowDown: () => map.panBy?.([0, pan], { duration: 220 }),
    ArrowLeft: () => map.panBy?.([-pan, 0], { duration: 220 }),
    ArrowRight: () => map.panBy?.([pan, 0], { duration: 220 }),
    '+': () => map.zoomIn?.({ duration: 220 }),
    '=': () => map.zoomIn?.({ duration: 220 }),
    '-': () => map.zoomOut?.({ duration: 220 }),
    _: () => map.zoomOut?.({ duration: 220 }),
  };

  const action = keyActions[event.key];
  if (!action) {
    return false;
  }

  event.preventDefault?.();
  event.stopPropagation?.();
  map.stop?.();
  action();
  onUserInteraction?.();
  return true;
};

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

const resolveAssetUri = (assetSource) => {
  if (!assetSource) return null;
  const uri = RNImage.resolveAssetSource?.(assetSource)?.uri || assetSource;
  return typeof uri === 'string' && uri.length > 8 && uri !== '[object Object]' ? uri : null;
};

const getBusMarkerAssetKey = (routeId) => {
  const normalized = String(routeId || '').trim().toUpperCase();
  const match = normalized.match(/^(\d+)/);
  if (!match) return null;
  return BUS_MARKER_SOURCES[match[1]] ? match[1] : null;
};

const getBusMarkerImageUri = (routeId) => {
  const assetKey = getBusMarkerAssetKey(routeId);
  return assetKey ? resolveAssetUri(BUS_MARKER_SOURCES[assetKey]) : null;
};

const createHeadingArrowHtml = ({ bearing, markerSize, opacity }) => {
  const arrowOffset = (markerSize - WEB_BUS_MARKER_HEADING_SVG_SIZE) / 2;
  return `
    <svg width="${WEB_BUS_MARKER_HEADING_SVG_SIZE}" height="${WEB_BUS_MARKER_HEADING_SVG_SIZE}" viewBox="0 0 ${WEB_BUS_MARKER_HEADING_SVG_SIZE} ${WEB_BUS_MARKER_HEADING_SVG_SIZE}"
      data-heading-tab="true"
      style="position:absolute;top:${arrowOffset}px;left:${arrowOffset}px;pointer-events:none;z-index:3;opacity:${opacity};overflow:visible;">
      <g transform="rotate(${bearing}, 52, 52)" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.22));">
        <path d="M52 8 L42 30 L49 30 L49 34 L55 34 L55 30 L62 30 Z"
          fill="rgba(255,255,255,0.96)" />
        <path d="M52 12 L46 28 L50 28 L50 30 L54 30 L54 28 L58 28 Z"
          fill="#111111" />
      </g>
    </svg>
  `;
};

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

const createMarkerElement = ({ html, className = '', onClickRef, zIndexOffset = 0, accessibilityLabel, pointerEvents }) => {
  const element = document.createElement('div');
  element.className = className;
  element.style.pointerEvents = pointerEvents || 'auto';
  element.style.cursor = onClickRef?.current ? 'pointer' : 'default';
  element.style.zIndex = String(zIndexOffset);
  if (accessibilityLabel) {
    element.setAttribute('aria-label', accessibilityLabel);
    element.setAttribute('role', onClickRef?.current ? 'button' : 'img');
  }
  element.innerHTML = html;
  element.addEventListener('click', (event) => {
    if (!onClickRef?.current) return;
    event.preventDefault();
    event.stopPropagation();
    onClickRef.current(event);
  });

  return element;
};

const updateMarkerElement = (element, { html, className = '', zIndexOffset = 0, accessibilityLabel, pointerEvents }) => {
  if (!element) return;
  element.className = className;
  element.style.zIndex = String(zIndexOffset);
  element.style.pointerEvents = pointerEvents || 'auto';
  if (accessibilityLabel) {
    element.setAttribute('aria-label', accessibilityLabel);
  } else {
    element.removeAttribute('aria-label');
    element.removeAttribute('role');
  }
  element.innerHTML = html;
};

const createBusHtml = (color, routeId, bearing = null, scale = 1, dimmed = false, directionLabel = null) => {
  const routeLabel = escapeHtml(routeId || '?');
  const routeDirectionLabel = directionLabel ? escapeHtml(directionLabel) : '';
  const assetUri = getBusMarkerImageUri(routeId);
  const assetKey = getBusMarkerAssetKey(routeId);
  const shouldShowSupplementalLabel =
    assetUri && (
      String(routeId || '').trim().toUpperCase() !== String(assetKey || '').trim().toUpperCase() ||
      Boolean(routeDirectionLabel)
    );
  const numericBearing = Number(bearing);
  const hasValidBearing = Number.isFinite(numericBearing);
  const resolvedScale = scale * (dimmed ? 0.84 : 1);
  const resolvedOpacity = dimmed ? 0.42 : 1;

  if (assetUri) {
    const arrowHtml = hasValidBearing
      ? createHeadingArrowHtml({
          bearing: numericBearing,
          markerSize: WEB_BUS_MARKER_IMAGE_SIZE,
          opacity: resolvedOpacity,
        })
      : '';

    return `
      <div
        data-live-bus-marker="image"
        style="position:relative;width:${WEB_BUS_MARKER_IMAGE_SIZE}px;height:${WEB_BUS_MARKER_IMAGE_SIZE}px;overflow:visible;transform:scale(${resolvedScale});transform-origin:center center;transition:transform 0.1s ease-out;opacity:${resolvedOpacity};"
      >
        ${arrowHtml}
        <img
          data-live-bus-artwork="true"
          src="${escapeHtml(assetUri)}"
          alt=""
          aria-hidden="true"
          style="
            position:absolute;
            top:0;left:0;
            display:block;
            width:${WEB_BUS_MARKER_IMAGE_SIZE}px;
            height:${WEB_BUS_MARKER_IMAGE_SIZE}px;
            object-fit:contain;
            filter:drop-shadow(0 1px 3px rgba(0,0,0,0.30)) drop-shadow(0 3px 8px rgba(0,0,0,0.12));
            z-index:2;
          "
        />
        ${shouldShowSupplementalLabel ? `<div style="
          position:absolute;
          left:50%;
          top:${WEB_BUS_MARKER_IMAGE_SIZE - 6}px;
          transform:translateX(-50%);
          min-width:28px;
          padding:1px 6px;
          border-radius:999px;
          background:rgba(23,43,77,0.92);
          border:1px solid rgba(255,255,255,0.95);
          color:#ffffff;
          font:900 10px/1.15 Avenir, Arial, sans-serif;
          letter-spacing:0.3px;
          text-align:center;
          white-space:nowrap;
          box-shadow:0 1px 3px rgba(0,0,0,0.22);
          z-index:4;
        ">${routeLabel}${routeDirectionLabel ? ` ${routeDirectionLabel}` : ''}</div>` : ''}
      </div>
    `;
  }

  const arrowHtml = hasValidBearing
    ? createHeadingArrowHtml({
        bearing: numericBearing,
        markerSize: WEB_BUS_MARKER_FALLBACK_SIZE,
        opacity: resolvedOpacity,
      })
    : '';

  return `
    <div data-live-bus-marker="generated" style="position:relative;width:${WEB_BUS_MARKER_FALLBACK_SIZE}px;height:${WEB_BUS_MARKER_FALLBACK_SIZE}px;overflow:visible;transform:scale(${resolvedScale});transform-origin:center center;transition:transform 0.1s ease-out;opacity:${resolvedOpacity};">
      ${arrowHtml}
      <div style="
        position:absolute;
        top:0;left:0;
        display:inline-flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        width:${WEB_BUS_MARKER_FALLBACK_SIZE}px;
        height:${WEB_BUS_MARKER_FALLBACK_SIZE}px;
        background:linear-gradient(to bottom, rgba(255,255,255,0.10) 0%, transparent 50%), ${color};
        border-radius:50%;
        border:2.5px solid rgba(255,255,255,0.92);
        box-shadow:0 1px 3px rgba(0,0,0,0.30), 0 3px 8px rgba(0,0,0,0.12);
        z-index:2;
        overflow:hidden;
        box-sizing:border-box;
      ">
        <svg
          data-live-bus-glyph="true"
          width="16"
          height="12"
          viewBox="0 0 24 18"
          aria-hidden="true"
          style="position:relative;z-index:1;margin-bottom:1px;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.24));"
        >
          <path d="M5 0h14c2.2 0 4 1.8 4 4v8c0 1.1-.9 2-2 2v2c0 1.1-.9 2-2 2h-1c-1.1 0-2-.9-2-2v-2H8v2c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-2c-1.1 0-2-.9-2-2V4c0-2.2 1.8-4 4-4Zm0 3v5h14V3H5Zm1 9.8a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Zm12 0a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z" fill="rgba(255,255,255,0.92)" />
        </svg>
        <span style="
          color:white;
          font-size:${routeDirectionLabel ? 13 : 14}px;
          font-weight:800;
          letter-spacing:0.5px;
          text-shadow:0 1px 2px rgba(0,0,0,0.25);
          line-height:${routeDirectionLabel ? 0.9 : 1};
          position:relative;
          z-index:1;
        ">${routeLabel}</span>
        ${routeDirectionLabel ? `<span style="
          color:white;
          font-size:11px;
          font-weight:900;
          letter-spacing:0.5px;
          text-shadow:0 1px 2px rgba(0,0,0,0.25);
          line-height:1;
          position:relative;
          z-index:1;
        ">${routeDirectionLabel}</span>` : ''}
      </div>
    </div>
  `;
};

const createStopHtml = (isSelected, isClosed = false, stopCode = '', opacity = 1) => {
  const size = isSelected ? 16 : 12;
  const hitArea = isClosed ? 78 : 24;
  const background = isSelected ? '#1a73e8' : 'white';
  const border = isSelected ? 'white' : isClosed ? '#FF991F' : '#1a73e8';

  if (isClosed) {
    const codeLabel = stopCode
      ? `<div style="padding:1px 5px;margin:0 0 3px 28px;border-radius:7px;background:#ffffff;border:1px solid #FF991F;box-sizing:border-box;box-shadow:0 1px 4px rgba(0,0,0,0.16);color:#FF991F;font:900 10px/1.2 Avenir, Arial, sans-serif;letter-spacing:0.2px;white-space:nowrap;">${escapeHtml(stopCode)}</div>`
      : '';

    return `<div style="width:${hitArea}px;min-height:${hitArea}px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:visible;opacity:${opacity};">${codeLabel}<div style="background:#ffffff;width:22px;height:22px;border-radius:50%;border:3px solid #FF991F;box-shadow:0 1px 5px rgba(0,0,0,0.2);box-sizing:border-box;display:flex;align-items:center;justify-content:center;"><div style="width:7px;height:7px;border-radius:50%;background:#FF991F;"></div></div></div>`;
  }

  return `<div style="width:${hitArea}px;height:${hitArea}px;cursor:pointer;display:flex;align-items:center;justify-content:center;position:relative;overflow:visible;opacity:${opacity};"><div style="background:${background};width:${size}px;height:${size}px;border-radius:50%;border:2px solid ${border};box-shadow:0 1px 3px rgba(0,0,0,0.24);display:flex;align-items:center;justify-content:center;"></div></div>`;
};

const createBusHubHtml = ({ label = '', hubType = 'minor' } = {}) => {
  const isMajor = hubType === 'major';
  const safeLabel = escapeHtml(label);
  const iconSize = isMajor ? 21 : 21 * 0.75;
  const markerWidth = isMajor ? 190 : 150;
  const labelTop = iconSize + 1;
  const artworkHtml = isMajor
    ? `<div
        data-bus-hub-major-circle="true"
        aria-hidden="true"
        style="width:${iconSize}px;height:${iconSize}px;border-radius:${iconSize / 2}px;background:#0C8CE5;border:2px solid #FFFFFF;box-sizing:border-box;filter:drop-shadow(0 3px 5px rgba(0,0,0,0.24));"
      ></div>`
    : `<div
        data-bus-hub-minor-circle="true"
        aria-hidden="true"
        style="width:${iconSize}px;height:${iconSize}px;border-radius:${iconSize / 2}px;background:#0C8CE5;border:2px solid #FFFFFF;box-sizing:border-box;filter:drop-shadow(0 3px 5px rgba(0,0,0,0.22));"
      ></div>`;
  const labelHtml = safeLabel
    ? `<div style="
        position:absolute;
        top:${labelTop}px;
        left:50%;
        transform:translateX(-50%);
        max-width:${isMajor ? 184 : 142}px;
        padding:3px 8px;
        border-radius:999px;
        border:1px solid ${isMajor ? 'rgba(0,78,128,0.28)' : 'rgba(52,69,99,0.22)'};
        background:rgba(255,255,255,0.97);
        box-shadow:0 1px 4px rgba(0,0,0,0.15);
        color:${COLORS.textPrimary};
        font:800 ${isMajor ? 11 : 10}px/1.2 Avenir, Arial, sans-serif;
        letter-spacing:0.1px;
        text-align:center;
        text-shadow:0 1px 0 rgba(255,255,255,0.8);
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        box-sizing:border-box;
      ">${safeLabel}</div>`
    : '';

  return `
    <div data-bus-hub-icon="true" style="
      position:relative;
      width:${markerWidth}px;
      height:${iconSize}px;
      display:flex;
      align-items:center;
      justify-content:center;
      pointer-events:none;
      overflow:visible;
    ">
      ${artworkHtml}
      ${labelHtml}
    </div>
  `;
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
  accessibilityLabel,
  pointerEvents,
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
      accessibilityLabel,
      pointerEvents,
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
  }, [accessibilityLabel, anchor, context?.map, context?.maplibre, hasValidCoordinate, offset, pointerEvents]);

  useEffect(() => {
    if (!markerRef.current || !hasValidCoordinate) return;
    markerRef.current.setLngLat([coordinate.longitude, coordinate.latitude]);
  }, [coordinate?.latitude, coordinate?.longitude, hasValidCoordinate]);

  useEffect(() => {
    if (!elementRef.current) return;
    updateMarkerElement(elementRef.current, { html, className, zIndexOffset, accessibilityLabel, pointerEvents });
  }, [accessibilityLabel, className, html, pointerEvents, zIndexOffset]);

  useEffect(() => {
    if (!elementRef.current) return;
    elementRef.current.style.cursor = onPress ? 'pointer' : 'default';
    if (accessibilityLabel) {
      elementRef.current.setAttribute('role', onPress ? 'button' : 'img');
    }
  }, [accessibilityLabel, onPress]);

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

const DEFAULT_WEB_LAYER_ORDER = 100;
const orderedMapLayerRegistries = new WeakMap();
let orderedMapLayerSequence = 0;

const normalizeLayerOrder = (layerOrder) => {
  const numericOrder = Number(layerOrder);
  return Number.isFinite(numericOrder) ? numericOrder : DEFAULT_WEB_LAYER_ORDER;
};

const getOrderedMapLayerRegistry = (map) => {
  let registry = orderedMapLayerRegistries.get(map);
  if (!registry) {
    registry = new Map();
    orderedMapLayerRegistries.set(map, registry);
  }
  return registry;
};

const reorderRegisteredMapLayers = (map) => {
  const registry = orderedMapLayerRegistries.get(map);
  if (!registry || typeof map?.moveLayer !== 'function') return;

  [...registry.values()]
    .sort((a, b) => (
      a.layerOrder === b.layerOrder
        ? a.sequence - b.sequence
        : a.layerOrder - b.layerOrder
    ))
    .forEach((entry) => {
      entry.layerIds.forEach((layerId) => {
        if (!safeGetLayer(map, layerId)) return;
        try {
          map.moveLayer(layerId);
        } catch {
          // Layers can disappear during style reloads or component teardown.
        }
      });
    });
};

const registerOrderedMapLayers = ({ map, registryKey, layerOrder, layerIds }) => {
  if (!map || !registryKey || !Array.isArray(layerIds) || layerIds.length === 0) {
    return () => {};
  }

  const registry = getOrderedMapLayerRegistry(map);
  const previousEntry = registry.get(registryKey);
  const entry = {
    layerOrder: normalizeLayerOrder(layerOrder),
    layerIds: layerIds.filter(Boolean),
    sequence: previousEntry?.sequence ?? orderedMapLayerSequence,
  };
  if (!previousEntry) {
    orderedMapLayerSequence += 1;
  }

  registry.set(registryKey, entry);
  reorderRegisteredMapLayers(map);

  return () => {
    registry.delete(registryKey);
    if (registry.size === 0) {
      orderedMapLayerRegistries.delete(map);
    } else {
      reorderRegisteredMapLayers(map);
    }
  };
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
  labelStyle,
  showArrows,
}) => {
  map.addSource(sourceId, {
    type: 'geojson',
    data: geoJson,
    lineMetrics: true,
  });

  const lineDasharray = parseDashArray(dashArray, strokeWidth);

  if (outlineWidth > 0) {
    const outlineStrokeWidth = strokeWidth + outlineWidth * 2;
    const outlineDasharray = parseDashArray(dashArray, outlineStrokeWidth);
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
        'line-width': outlineStrokeWidth,
        'line-opacity': opacity,
        ...(outlineDasharray ? { 'line-dasharray': outlineDasharray } : {}),
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
    const resolvedLabelStyle = {
      ...ROUTE_LINE_LABEL_STYLE,
      ...(labelStyle || {}),
    };

    map.addLayer({
      id: labelId,
      type: 'symbol',
      source: sourceId,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': resolvedLabelStyle.spacing,
        'text-field': routeLabel,
        'text-size': resolvedLabelStyle.size,
        'text-offset': resolvedLabelStyle.textOffset || resolvedLabelStyle.offset,
        'text-rotation-alignment': 'map',
        'text-allow-overlap': resolvedLabelStyle.textAllowOverlap ?? false,
        'text-ignore-placement': resolvedLabelStyle.textIgnorePlacement ?? false,
      },
      paint: {
        'text-color': resolvedLabelStyle.color,
        'text-halo-color': resolvedLabelStyle.haloColor,
        'text-halo-width': resolvedLabelStyle.haloWidth,
        'text-opacity': resolvedLabelStyle.opacity,
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
  labelStyle = null,
  showArrows = false,
  layerOrder = DEFAULT_WEB_LAYER_ORDER,
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
      labelStyle,
      showArrows,
    });

    const unregisterLayerOrder = registerOrderedMapLayers({
      map: context.map,
      registryKey: baseId,
      layerOrder,
      layerIds: [
        outlineWidth > 0 ? outlineId : null,
        fillId,
        showArrows ? arrowId : null,
        routeLabel ? labelId : null,
      ].filter(Boolean),
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
      unregisterLayerOrder();
    };
  }, [
    baseId,
    color,
    context?.isReady,
    context?.map,
    coordinates,
    dashArray,
    interactive,
    layerOrder,
    lineCap,
    lineJoin,
    offset,
    opacity,
    outlineColor,
    outlineWidth,
    routeLabel,
    labelStyle,
    showArrows,
    strokeWidth,
  ]);

  return null;
};

export const WebRoutePolyline = memo(WebRoutePolylineComponent);

const WebLineLabelLayerComponent = ({
  labels = [],
  labelStyle = {},
  layerOrder = DEFAULT_WEB_LAYER_ORDER,
}) => {
  const context = useMapContext();
  const baseId = useStableMapId('web-line-labels');

  useEffect(() => {
    if (!context?.map || !context.isReady || !Array.isArray(labels) || labels.length === 0) {
      return undefined;
    }

    const features = labels
      .map((label) => {
        const coordinates = Array.isArray(label.coordinates)
          ? label.coordinates
              .filter((coord) => Number.isFinite(coord?.latitude) && Number.isFinite(coord?.longitude))
              .map((coord) => [coord.longitude, coord.latitude])
          : [];

        if (coordinates.length < 2) return null;

        return {
          type: 'Feature',
          properties: {
            label: label.label,
            kind: label.kind,
            priority: label.priority,
            sortKey: label.sortKey,
          },
          geometry: {
            type: 'LineString',
            coordinates,
          },
        };
      })
      .filter(Boolean);

    if (features.length === 0) {
      return undefined;
    }

    const sourceId = `${baseId}-source`;
    const layerId = `${baseId}-symbols`;
    const resolvedLabelStyle = {
      ...ROUTE_LINE_LABEL_STYLE,
      ...labelStyle,
    };
    const symbolPlacement = resolvedLabelStyle.symbolPlacement || 'line';
    const labelLayout = {
      'symbol-placement': symbolPlacement,
      'symbol-sort-key': ['get', 'sortKey'],
      'text-field': ['get', 'label'],
      'text-size': resolvedLabelStyle.size,
      'text-offset': resolvedLabelStyle.textOffset || resolvedLabelStyle.offset,
      'text-padding': resolvedLabelStyle.textPadding ?? resolvedLabelStyle.padding,
      'text-letter-spacing': resolvedLabelStyle.textLetterSpacing ?? resolvedLabelStyle.letterSpacing,
      'text-max-angle': resolvedLabelStyle.textMaxAngle ?? resolvedLabelStyle.maxAngle,
      'text-keep-upright': true,
      'text-rotation-alignment': 'map',
      'text-allow-overlap': resolvedLabelStyle.textAllowOverlap ?? false,
      'text-ignore-placement': resolvedLabelStyle.textIgnorePlacement ?? false,
    };

    if (symbolPlacement !== 'line-center') {
      labelLayout['symbol-spacing'] = resolvedLabelStyle.spacing;
    }

    context.map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features,
      },
    });
    context.map.addLayer({
      id: layerId,
      type: 'symbol',
      source: sourceId,
      layout: labelLayout,
      paint: {
        'text-color': resolvedLabelStyle.color,
        'text-halo-color': resolvedLabelStyle.haloColor,
        'text-halo-width': resolvedLabelStyle.haloWidth,
        'text-opacity': resolvedLabelStyle.opacity,
      },
    });

    const unregisterLayerOrder = registerOrderedMapLayers({
      map: context.map,
      registryKey: baseId,
      layerOrder,
      layerIds: [layerId],
    });

    return () => {
      removeLayerIfExists(context.map, layerId);
      removeSourceIfExists(context.map, sourceId);
      unregisterLayerOrder();
    };
  }, [baseId, context?.isReady, context?.map, labelStyle, labels, layerOrder]);

  return null;
};

export const WebLineLabelLayer = memo(WebLineLabelLayerComponent);

const WebBusHubLayerComponent = ({ featureCollection }) => {
  const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];

  return (
    <>
      {features.map((feature) => {
        const [longitude, latitude] = feature?.geometry?.coordinates || [];
        const hubType = feature?.properties?.hubType || 'minor';
        const label = feature?.properties?.label || '';

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return null;
        }

        return (
          <WebHtmlMarker
            key={feature.id || feature.properties?.id}
            coordinate={{ latitude, longitude }}
            html={createBusHubHtml({ label, hubType })}
            className={`bus-hub-marker bus-hub-marker-${hubType}`}
            anchor="center"
            offset={BUS_HUB_ICON_CENTER_OFFSET}
            zIndexOffset={hubType === 'major' ? 655 : 652}
            accessibilityLabel={label ? `${label} bus hub` : 'Bus hub'}
          />
        );
      })}
    </>
  );
};

export const WebBusHubLayer = memo(WebBusHubLayerComponent);

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
  createBusHubHtml,
  createBusHtml,
  handleWebMapKeyboardPan,
  isEditableKeyboardTarget,
  registerOrderedMapLayers,
  reorderRegisteredMapLayers,
  resolveLayerCallbacks,
};

export const WebBusMarker = memo(({ vehicle, color, routeLabel: routeLabelProp, routeDirectionLabel = null, snapPath = null, dimmed = false }) => {
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
      html={createBusHtml(color, label, bearing, scale, dimmed, routeDirectionLabel)}
      className="bus-icon"
      popupHtml={`<strong>Route ${escapeHtml(label)}</strong>${vehicle.label ? `<br />Bus ${escapeHtml(vehicle.label)}` : ''}`}
      accessibilityLabel={`Route ${label} bus${vehicle.label ? ` ${vehicle.label}` : ''}`}
    />
  );
});

export const WebStopMarker = memo(({ stop, onPress, isSelected, closedStopOpacity = 1 }) => (
  <WebHtmlMarker
    coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
    html={createStopHtml(isSelected, Boolean(stop.isClosed), String(stop.code ?? stop.stopCode ?? stop.id ?? ''), stop.isClosed ? closedStopOpacity : 1)}
    zIndexOffset={isSelected ? 1000 : 500}
    onPress={() => onPress?.(stop)}
    popupHtml={`<strong>${escapeHtml(stop.name)}</strong><br />Stop #${escapeHtml(stop.code)}${stop.isClosed ? '<br /><span style="color:#8a5a00;">Stop closure reported</span>' : ''}`}
    accessibilityLabel={`${stop.name}, stop ${stop.code}${stop.isClosed ? ', stop closure reported' : ''}`}
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
  const eventCleanupRef = useRef(() => {});
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
        dragPan: true,
        scrollZoom: true,
        keyboard: false,
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
        containerRef.current?.focus?.({ preventScroll: true });
        callbacksRef.current.onPress?.({
          nativeEvent: {
            coordinate: {
              latitude: event.lngLat.lat,
              longitude: event.lngLat.lng,
            },
          },
        });
      };
      const handleKeyDown = (event) => {
        handleWebMapKeyboardPan({
          map,
          event,
          onUserInteraction: callbacksRef.current.onUserInteraction,
        });
      };
      const handlePointerDown = () => {
        containerRef.current?.focus?.({ preventScroll: true });
      };

      containerRef.current?.addEventListener?.('keydown', handleKeyDown);
      containerRef.current?.addEventListener?.('pointerdown', handlePointerDown);
      eventCleanupRef.current = () => {
        containerRef.current?.removeEventListener?.('keydown', handleKeyDown);
        containerRef.current?.removeEventListener?.('pointerdown', handlePointerDown);
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
      eventCleanupRef.current?.();
      eventCleanupRef.current = () => {};
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
        <div
          ref={containerRef}
          tabIndex={0}
          aria-label="Transit map. Use arrow keys to move the map and plus or minus to zoom."
          style={{
            width: '100%',
            height: '100%',
            outline: 'none',
            touchAction: 'none',
          }}
        />
      </div>
      {isReady ? children : null}
    </MapContext.Provider>
  );
});

export default WebMapView;
