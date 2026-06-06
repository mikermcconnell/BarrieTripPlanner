'use strict';

const { filterNonClosureSelfLoopSegments } = require('./geometry/segmentValidity');

function collectVisibilitySources(detour = {}, geometry = null) {
  const sources = [];
  if (geometry && typeof geometry === 'object') sources.push(geometry);
  if (detour.geometry && detour.geometry !== geometry) sources.push(detour.geometry);
  if (detour && typeof detour === 'object') sources.push(detour);
  if (detour.detourZone) sources.push(detour.detourZone);
  if (detour.eventWindow) sources.push(detour.eventWindow);

  for (const source of [...sources]) {
    if (Array.isArray(source?.segments)) {
      for (const segment of source.segments) {
        if (segment && typeof segment === 'object') sources.push(segment);
      }
    }
  }
  return sources;
}

function collectSegments(detour = {}, geometry = null) {
  const segments = [];
  for (const source of collectVisibilitySources(detour, geometry)) {
    if (Array.isArray(source?.segments)) {
      for (const segment of source.segments) {
        if (segment && typeof segment === 'object') segments.push(segment);
      }
    }
  }
  return segments;
}

function shouldSuppressInvalidGeometryDetour(detour = {}, geometry = null) {
  const segments = collectSegments(detour, geometry);
  if (segments.length === 0) return false;
  return filterNonClosureSelfLoopSegments(segments).length === 0;
}

function applyRiderVisibilityGuard(detour = {}, geometry = null) {
  if (detour.riderVisible === false) {
    return detour;
  }
  if (shouldSuppressInvalidGeometryDetour(detour, geometry)) {
    detour.riderVisible = false;
    detour.riderVisibilityReason = 'suppressed-invalid-geometry';
    detour.staleForReview = true;
    return detour;
  }
  return detour;
}

module.exports = {
  applyRiderVisibilityGuard,
  shouldSuppressInvalidGeometryDetour,
};
