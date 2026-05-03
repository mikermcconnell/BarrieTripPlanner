export const getIntermediateStops = (routingData, tripId, boardingStopId, alightingStopId) => {
  const { stopTimes, stopIndex } = routingData;

  const tripStopTimes = stopTimes
    .filter((stopTime) => stopTime.tripId === tripId)
    .sort((a, b) => a.stopSequence - b.stopSequence);

  let boardingIdx = -1;
  let alightingIdx = -1;

  tripStopTimes.forEach((stopTime, idx) => {
    if (stopTime.stopId === boardingStopId && boardingIdx === -1) {
      boardingIdx = idx;
    }
    if (stopTime.stopId === alightingStopId) {
      alightingIdx = idx;
    }
  });

  if (boardingIdx === -1 || alightingIdx === -1 || alightingIdx <= boardingIdx) {
    return [];
  }

  const intermediateStops = [];
  for (let idx = boardingIdx + 1; idx < alightingIdx; idx += 1) {
    const stopTime = tripStopTimes[idx];
    const stop = stopIndex[stopTime.stopId];

    if (stop) {
      intermediateStops.push({
        name: stop.name,
        lat: stop.latitude,
        lon: stop.longitude,
        stopId: stop.id,
        stopCode: stop.code || stop.id,
      });
    }
  }

  return intermediateStops;
};

export default getIntermediateStops;
