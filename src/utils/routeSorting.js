/**
 * Sort routes by number (largest to smallest), with non-numeric routes sorted alphabetically.
 */
export const sortRoutesByNumber = (routes) => {
  if (!routes?.length) return [];
  return [...routes].sort((a, b) => {
    const labelA = String(a?.shortName ?? a?.id ?? '');
    const labelB = String(b?.shortName ?? b?.id ?? '');
    const numA = parseInt(labelA, 10);
    const numB = parseInt(labelB, 10);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numB - numA;
    }
    return labelB.localeCompare(labelA);
  });
};
