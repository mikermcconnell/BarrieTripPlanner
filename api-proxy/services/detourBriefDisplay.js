'use strict';

// Operator-verified correction for the active Route 8B Blake Street event.
// Its published path roles are reversed relative to observed service. Scope
// this to the exact event so normal detour geometry keeps its usual meaning.
const BLAKE_ROUTE_8B_EVENT_ID = '8B:ceeeb924-c9cb-4358-aedb-d96b5bdfe1e4:5100-5300';

function passesNear(path, latitude, longitude) {
  return Array.isArray(path) && path.some((value) =>
    Math.abs(Number(value.latitude) - latitude) < 0.00035 &&
    Math.abs(Number(value.longitude) - longitude) < 0.00045);
}

function getBriefDisplayCorrection(event, targetSegment) {
  if (event?.eventId !== BLAKE_ROUTE_8B_EVENT_ID || event.routeId !== '8B') return null;
  const segments = targetSegment ? [targetSegment]
    : Array.isArray(event.segments) && event.segments.length ? event.segments : [event];
  // Stop applying the exception if the detector replaces either corridor.
  if (!segments.some((segment) =>
    segment.canShowDetourPath === true && /^osrm-(match|route)$/.test(segment.roadMatchSource || '') &&
    passesNear(segment.skippedSegmentPolyline, 44.394809, -79.660687) &&
    passesNear(segment.likelyDetourPolyline, 44.396167, -79.659512))) return null;
  return {
    reversePathRoles: true,
    routingRoads: ['Johnson Street', 'Shanty Bay Road'],
    affectedRoads: ['Blake Street'],
  };
}

// Apply the reviewed path roles to ALL email content, not only the map lines.
// Stops derived from the former closed path cannot be asserted after swapping it.
function prepareBriefDisplayEvent(event) {
  if (event?.briefDisplayPrepared || !getBriefDisplayCorrection(event)) return event;
  const emptyImpacts = {
    skippedStops: [], skippedStopCodes: [], skippedStopIds: [],
    affectedStops: [], affectedStopCodes: [], affectedStopIds: [],
    likelyDetourRoadNames: [], closedSegmentRoadNames: [],
    likelyDetourDirections: [],
    skippedSegmentRoadNames: [], closedRoadNames: [],
  };
  const segments = (event.segments?.length ? event.segments : [event]).map((segment) => {
    const correction = getBriefDisplayCorrection(event, segment);
    if (!correction) return segment;
    return {
      ...segment, ...emptyImpacts,
      skippedSegmentPolyline: segment.likelyDetourPolyline,
      likelyDetourPolyline: segment.skippedSegmentPolyline,
      skippedSegmentRoadNames: correction.affectedRoads,
      likelyDetourRoadNames: correction.routingRoads,
      briefStopImpactsPending: true,
    };
  });
  return { ...event, ...emptyImpacts, segments, briefDisplayPrepared: true, briefStopImpactsPending: true };
}

module.exports = { getBriefDisplayCorrection, prepareBriefDisplayEvent };
