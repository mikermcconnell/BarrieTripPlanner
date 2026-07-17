'use strict';

// Refined rider-map fields only. Detector lifecycle boundaries deliberately
// remain outside this contract.

const DISPLAY_GEOMETRY_FIELDS = [
  'displayBoundaryRefined',
  'displayBoundaryReason',
  'displayEntryPoint',
  'displayExitPoint',
  'displaySkippedSegmentPolyline',
  'displaySkippedStops',
  'displaySkippedStopIds',
  'displaySkippedStopCodes',
  'displaySeparatedRunMeters',
  'displayPrefixTrimmedMeters',
  'displaySuffixTrimmedMeters',
  'displayBoundaryProjectionConstrained',
  'displayBoundaryProjectionWindowStartMeters',
  'displayBoundaryProjectionWindowEndMeters',
];

function clearDisplayGeometry(target) {
  Object.assign(target, {
    displayBoundaryRefined: false,
    displayBoundaryReason: null,
    displayEntryPoint: null,
    displayExitPoint: null,
    displaySkippedSegmentPolyline: null,
    displaySkippedStops: [],
    displaySkippedStopIds: [],
    displaySkippedStopCodes: [],
    displaySeparatedRunMeters: null,
    displayPrefixTrimmedMeters: null,
    displaySuffixTrimmedMeters: null,
    displayBoundaryProjectionConstrained: false,
    displayBoundaryProjectionWindowStartMeters: null,
    displayBoundaryProjectionWindowEndMeters: null,
  });
  return target;
}

function deleteDisplayGeometry(target) {
  for (const field of DISPLAY_GEOMETRY_FIELDS) {
    delete target[field];
  }
  return target;
}

function copyRefinedDisplayGeometry(target, source) {
  clearDisplayGeometry(target);
  if (source?.displayBoundaryRefined !== true) return target;

  Object.assign(target, {
    displayBoundaryRefined: true,
    displayBoundaryReason: source.displayBoundaryReason || null,
    displayEntryPoint: source.displayEntryPoint || null,
    displayExitPoint: source.displayExitPoint || null,
    displaySkippedSegmentPolyline: source.displaySkippedSegmentPolyline || null,
    displaySkippedStops: Array.isArray(source.displaySkippedStops)
      ? source.displaySkippedStops
      : [],
    displaySkippedStopIds: Array.isArray(source.displaySkippedStopIds)
      ? source.displaySkippedStopIds
      : [],
    displaySkippedStopCodes: Array.isArray(source.displaySkippedStopCodes)
      ? source.displaySkippedStopCodes
      : [],
    displaySeparatedRunMeters: source.displaySeparatedRunMeters ?? null,
    displayPrefixTrimmedMeters: source.displayPrefixTrimmedMeters ?? null,
    displaySuffixTrimmedMeters: source.displaySuffixTrimmedMeters ?? null,
    displayBoundaryProjectionConstrained:
      source.displayBoundaryProjectionConstrained === true,
    displayBoundaryProjectionWindowStartMeters:
      source.displayBoundaryProjectionWindowStartMeters ?? null,
    displayBoundaryProjectionWindowEndMeters:
      source.displayBoundaryProjectionWindowEndMeters ?? null,
  });
  return target;
}

module.exports = {
  DISPLAY_GEOMETRY_FIELDS,
  clearDisplayGeometry,
  copyRefinedDisplayGeometry,
  deleteDisplayGeometry,
};
