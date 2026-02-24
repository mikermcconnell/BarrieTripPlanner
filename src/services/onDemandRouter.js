/**
 * On-Demand Zone Router
 *
 * Analyzes whether trip endpoints fall inside on-demand transit zones
 * and builds zone-aware trip plans that splice ON_DEMAND legs onto
 * regular RAPTOR-routed itineraries.
 */

import { findContainingZone, isZoneOperating, findNearestHubStop } from '../utils/zoneUtils';
import { haversineDistance } from '../utils/geometryUtils';

/**
 * Analyze whether origin/destination fall inside on-demand zones.
 *
 * @param {Object} params
 * @param {number} params.fromLat
 * @param {number} params.fromLon
 * @param {number} params.toLat
 * @param {number} params.toLon
 * @param {Object} params.onDemandZones - { zoneId: zoneObject }
 * @param {Array}  params.stops - Full stops array from TransitContext
 * @param {Date}   params.departureTime
 * @returns {{ originZone, destZone, originHubStop, destHubStop, needsOnDemand: boolean }}
 */
export const analyzeZoneInvolvement = ({
  fromLat,
  fromLon,
  toLat,
  toLon,
  onDemandZones,
  stops,
  departureTime,
}) => {
  const result = {
    originZone: null,
    destZone: null,
    originHubStop: null,
    destHubStop: null,
    needsOnDemand: false,
  };

  if (!onDemandZones || Object.keys(onDemandZones).length === 0) {
    return result;
  }

  // Check if origin is in a zone
  const originZone = findContainingZone(fromLat, fromLon, onDemandZones);
  if (originZone && isZoneOperating(originZone, departureTime)) {
    const hubStop = findNearestHubStop(fromLat, fromLon, originZone.hubStops, stops);
    if (hubStop) {
      result.originZone = originZone;
      result.originHubStop = hubStop;
    }
  }

  // Check if destination is in a zone
  const destZone = findContainingZone(toLat, toLon, onDemandZones);
  if (destZone && isZoneOperating(destZone, departureTime)) {
    const hubStop = findNearestHubStop(toLat, toLon, destZone.hubStops, stops);
    if (hubStop) {
      result.destZone = destZone;
      result.destHubStop = hubStop;
    }
  }

  result.needsOnDemand = !!(result.originZone && result.originHubStop) ||
                          !!(result.destZone && result.destHubStop);

  return result;
};

/**
 * Build a zone-aware trip plan from zone analysis results.
 *
 * @param {Object} zoneAnalysis - Result from analyzeZoneInvolvement
 * @returns {{ raptorFrom, raptorTo, prependLeg, appendLeg, sameZone?, zone? }}
 */
export const buildZoneAwareTrip = (zoneAnalysis) => {
  const { originZone, destZone, originHubStop, destHubStop } = zoneAnalysis;

  // Special case: both endpoints in the SAME zone
  if (originZone && destZone && originZone.id === destZone.id) {
    return {
      sameZone: true,
      zone: originZone,
      raptorFrom: null,
      raptorTo: null,
      prependLeg: null,
      appendLeg: null,
    };
  }

  const result = {
    sameZone: false,
    raptorFrom: null,
    raptorTo: null,
    prependLeg: null,
    appendLeg: null,
  };

  // Origin in zone: RAPTOR starts from hub stop
  if (originZone && originHubStop) {
    result.raptorFrom = {
      lat: originHubStop.latitude,
      lon: originHubStop.longitude,
    };
    result.prependLeg = {
      zone: originZone,
      hubStop: originHubStop,
    };
  }

  // Destination in zone: RAPTOR ends at hub stop
  if (destZone && destHubStop) {
    result.raptorTo = {
      lat: destHubStop.latitude,
      lon: destHubStop.longitude,
    };
    result.appendLeg = {
      zone: destZone,
      hubStop: destHubStop,
    };
  }

  return result;
};

/**
 * Estimate on-demand travel duration between two points.
 * Uses straight-line distance with a 1.3x road buffer and 25 km/h average speed,
 * plus a 5-minute pickup wait.
 *
 * @param {number} fromLat
 * @param {number} fromLon
 * @param {number} toLat
 * @param {number} toLon
 * @returns {number} Estimated duration in seconds
 */
export const estimateOnDemandDuration = (fromLat, fromLon, toLat, toLon) => {
  const ROAD_BUFFER = 1.3;
  const AVERAGE_SPEED_KMH = 25;
  const PICKUP_WAIT_SECONDS = 300; // 5 minutes

  const straightLineMeters = haversineDistance(fromLat, fromLon, toLat, toLon);
  const roadDistanceKm = (straightLineMeters * ROAD_BUFFER) / 1000;
  const travelSeconds = (roadDistanceKm / AVERAGE_SPEED_KMH) * 3600;

  return Math.round(travelSeconds + PICKUP_WAIT_SECONDS);
};
