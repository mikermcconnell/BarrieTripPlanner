const ROUTE_LABEL_DEBUG = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_ROUTE_LABEL_DEBUG === 'true';

/**
 * Resolve a rider-facing route label for a live vehicle.
 *
 * Priority:
 * 1) trip_id -> static route_id mapping when it adds branch specificity
 * 2) Exact static route ID match
 * 3) Heuristic fallback for feeds that send base route IDs like "7"
 */
export const resolveVehicleRouteLabel = (vehicle, routes = [], tripMapping = {}) => {
  const rawRouteId = vehicle?.routeId ? String(vehicle.routeId).trim() : '';
  const rawTripId = vehicle?.tripId ? String(vehicle.tripId).trim() : '';
  const normalize = (value) => String(value || '').trim().toUpperCase();
  const hasBranchSuffix = (value) => /[A-Z]$/.test(normalize(value));
  const debugRoutes = ROUTE_LABEL_DEBUG && /^(2|2A|2B|7|7A|7B)$/i.test(rawRouteId);

  if (!rawRouteId && !rawTripId) {
    return {
      label: '?',
      source: 'empty',
      rawRouteId,
      rawTripId,
      mappedRouteId: '',
    };
  }

  const findByRouteId = (routeId) => {
    if (!routeId) return null;
    return routes.find((r) => String(r.id).trim() === String(routeId).trim()) || null;
  };

  const pickRouteLabel = (route, fallbackRouteId) => {
    const id = String(route?.id || fallbackRouteId || '').trim();
    const shortName = String(route?.shortName || '').trim();

    // If branch route IDs exist (e.g. 2A/2B), prefer the ID over a branchless short name like "2".
    if (id && shortName && hasBranchSuffix(id) && !hasBranchSuffix(shortName)) {
      const idBase = normalize(id).replace(/[A-Z]$/, '');
      const shortBase = normalize(shortName).replace(/[A-Z]$/, '');
      if (idBase === shortBase) return id;
    }

    return shortName || id || fallbackRouteId;
  };

  const tripInfo = rawTripId ? tripMapping?.[rawTripId] : null;
  const mappedRouteId = tripInfo?.routeId ? String(tripInfo.routeId).trim() : '';
  const tripRoute = findByRouteId(mappedRouteId);

  const exactRoute = findByRouteId(rawRouteId);
  const rawNorm = normalize(rawRouteId);
  const mappedNorm = normalize(mappedRouteId);
  const hasMappedOverride = Boolean(mappedNorm && mappedNorm !== rawNorm);

  if (debugRoutes) {
    console.warn('[route-label-debug] INPUT rawRouteId=%s rawTripId=%s mappedRouteId=%s tripRoute=%s exactRoute=%s routes.length=%d hasMappedOverride=%s',
      rawRouteId, rawTripId?.slice(0,8), mappedRouteId,
      tripRoute ? `{id:${tripRoute.id},short:${tripRoute.shortName}}` : 'null',
      exactRoute ? `{id:${exactRoute.id},short:${exactRoute.shortName}}` : 'null',
      routes.length, hasMappedOverride);
  }

  // Prefer trip mapping when it provides a more specific route branch than the feed route_id.
  if (tripRoute && (hasMappedOverride || (!hasBranchSuffix(rawRouteId) && hasBranchSuffix(mappedRouteId)))) {
    const label = pickRouteLabel(tripRoute, mappedRouteId);
    if (debugRoutes) console.warn('[route-label-debug] PATH=trip-mapping label=%s', label);
    return { label, source: 'trip-mapping', rawRouteId, rawTripId, mappedRouteId };
  }

  if (exactRoute) {
    // If the raw route ID is branchless (e.g. "2") and branch routes exist (e.g. "2A"/"2B"),
    // skip the exact match so the branch heuristic below can pick the correct branch.
    const isBaseThatHasBranches = !hasBranchSuffix(rawRouteId) && routes.some((r) => {
      const rid = normalize(r.id);
      return rid !== rawNorm && rid.startsWith(rawNorm) && hasBranchSuffix(rid);
    });

    if (!isBaseThatHasBranches) {
      const label = pickRouteLabel(exactRoute, rawRouteId);
      if (debugRoutes) console.warn('[route-label-debug] PATH=exact-route-id label=%s pickArgs={id:%s,short:%s,fallback:%s}', label, exactRoute.id, exactRoute.shortName, rawRouteId);
      return { label, source: 'exact-route-id', rawRouteId, rawTripId, mappedRouteId };
    }
    if (debugRoutes) console.warn('[route-label-debug] SKIP exact-match (base has branches)');
  }

  if (tripRoute) {
    return {
      label: pickRouteLabel(tripRoute, mappedRouteId),
      source: 'trip-mapping',
      rawRouteId,
      rawTripId,
      mappedRouteId,
    };
  }

  if (hasMappedOverride) {
    return {
      label: mappedRouteId,
      source: 'trip-mapping-id',
      rawRouteId,
      rawTripId,
      mappedRouteId,
    };
  }

  // Some feeds emit a branchless base route ID ("7") while static GTFS contains "7A"/"7B".
  if (rawRouteId) {
    const base = rawRouteId.toUpperCase();
    const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const branchPattern = new RegExp(`^${escapedBase}[A-Z]$`);
    const branchCandidates = routes.filter((r) => {
      const rid = String(r.id || '').trim().toUpperCase();
      const short = String(r.shortName || '').trim().toUpperCase();
      return branchPattern.test(rid) || branchPattern.test(short);
    });

    if (branchCandidates.length > 0) {
      const aBranch = branchCandidates.find((r) => {
        const rid = String(r.id || '').trim().toUpperCase();
        const short = String(r.shortName || '').trim().toUpperCase();
        return rid === `${base}A` || short === `${base}A`;
      });
      const fallback = aBranch || branchCandidates[0];
      return {
        label: pickRouteLabel(fallback, rawRouteId),
        source: 'branch-heuristic',
        rawRouteId,
        rawTripId,
        mappedRouteId,
      };
    }
  }

  if (debugRoutes) console.warn('[route-label-debug] PATH=raw-fallback label=%s', rawRouteId || mappedRouteId || '?');
  return {
    label: rawRouteId || mappedRouteId || '?',
    source: 'raw-fallback',
    rawRouteId,
    rawTripId,
    mappedRouteId,
  };
};

export const getVehicleRouteLabel = (vehicle, routes = [], tripMapping = {}) =>
  resolveVehicleRouteLabel(vehicle, routes, tripMapping).label;
