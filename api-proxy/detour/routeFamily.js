function normalizeRouteId(routeId) {
  return String(routeId ?? '').trim().toUpperCase();
}

function getRouteFamilyId(routeId) {
  const normalized = normalizeRouteId(routeId);
  const match = normalized.match(/^(\d+)[A-Z]$/);
  return match ? match[1] : normalized;
}

function routeIdsShareFamily(a, b) {
  const left = normalizeRouteId(a);
  const right = normalizeRouteId(b);
  if (!left || !right) return false;
  return left === right || getRouteFamilyId(left) === getRouteFamilyId(right);
}

module.exports = {
  normalizeRouteId,
  getRouteFamilyId,
  routeIdsShareFamily,
};
