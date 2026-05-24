'use strict';

function normalizeStopId(value) {
  return value == null ? null : String(value).trim();
}

function uniqueStopIds(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(normalizeStopId)
      .filter(Boolean)
  )];
}

function isNonClosureSelfLoopSegment(segment) {
  const entryStopId = normalizeStopId(segment?.entryStopId);
  const exitStopId = normalizeStopId(segment?.exitStopId);
  if (!entryStopId || !exitStopId || entryStopId !== exitStopId) return false;

  const skippedStopIds = uniqueStopIds(segment?.skippedStopIds);
  const affectedStopIds = uniqueStopIds(segment?.affectedStopIds);
  const impactedStopIds = uniqueStopIds([...skippedStopIds, ...affectedStopIds]);

  return (
    impactedStopIds.length <= 1 &&
    (impactedStopIds.length === 0 || impactedStopIds[0] === entryStopId)
  );
}

function filterNonClosureSelfLoopSegments(segments) {
  return (Array.isArray(segments) ? segments : [])
    .filter((segment) => !isNonClosureSelfLoopSegment(segment));
}

module.exports = {
  isNonClosureSelfLoopSegment,
  filterNonClosureSelfLoopSegments,
};
