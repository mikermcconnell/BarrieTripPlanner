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

function getBriefDisplayCorrection(event) {
  if (event?.eventId !== BLAKE_ROUTE_8B_EVENT_ID || event.routeId !== '8B') return null;
  const segments = Array.isArray(event.segments) && event.segments.length ? event.segments : [event];
  // Stop applying the exception if the detector replaces either corridor.
  if (!segments.some((segment) =>
    passesNear(segment.skippedSegmentPolyline, 44.394809, -79.660687) &&
    passesNear(segment.likelyDetourPolyline, 44.396167, -79.659512))) return null;
  return {
    reversePathRoles: true,
    routingText: 'Likely active via Puget Street and Shanty Bay Road; Codrington Street section out of service.',
  };
}

module.exports = { getBriefDisplayCorrection };
