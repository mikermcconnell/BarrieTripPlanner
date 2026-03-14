export function diffDetourRouteIds({ detourMap, prevIds, hasSeenInitialSnapshot }) {
  const nextIds = Object.keys(detourMap || {});
  if (!hasSeenInitialSnapshot) {
    return {
      nextIds,
      newRouteIds: [],
    };
  }

  const previousIds = prevIds instanceof Set ? prevIds : new Set(prevIds || []);

  return {
    nextIds,
    newRouteIds: nextIds.filter((routeId) => !previousIds.has(routeId)),
  };
}
