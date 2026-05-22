/**
 * Shared trip utility functions
 */

/**
 * Detect if a walk leg is a transfer (between two transit legs).
 * @param {Array} legs - Full itinerary legs array
 * @param {number} index - Index of the leg to check
 * @returns {boolean}
 */
export const isTransferWalk = (legs, index) => {
  const leg = legs[index];
  return leg.mode === 'WALK'
    && index > 0
    && index < legs.length - 1
    && legs[index - 1].mode !== 'WALK'
    && legs[index + 1].mode !== 'WALK';
};

/**
 * Calculate wait duration at a transfer point.
 * @param {number|null} legEndTime - End timestamp of the transfer walk leg (ms)
 * @param {number|null} nextLegStartTime - Start timestamp of the next transit leg (ms)
 * @returns {number|null} Wait duration in seconds, or null if not computable
 */
export const calculateWaitDuration = (legEndTime, nextLegStartTime) =>
  nextLegStartTime && legEndTime
    ? Math.max(0, Math.round((nextLegStartTime - legEndTime) / 1000))
    : null;
