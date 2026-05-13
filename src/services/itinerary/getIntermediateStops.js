export const getIntermediateStops = (
  routingData,
  tripId,
  boardingStopId,
  alightingStopId,
  boardingStopSequence = null,
  alightingStopSequence = null
) => {
  const { stopTimes, stopIndex } = routingData;

  const tripStopTimes = stopTimes
    .filter((stopTime) => stopTime.tripId === tripId)
    .sort((a, b) => a.stopSequence - b.stopSequence);

  const hasBoardingSequence = boardingStopSequence !== null &&
    boardingStopSequence !== undefined &&
    boardingStopSequence !== '' &&
    Number.isFinite(Number(boardingStopSequence));
  const hasAlightingSequence = alightingStopSequence !== null &&
    alightingStopSequence !== undefined &&
    alightingStopSequence !== '' &&
    Number.isFinite(Number(alightingStopSequence));
  const boardingIdx = tripStopTimes.findIndex((stopTime) => (
    stopTime.stopId === boardingStopId &&
    (!hasBoardingSequence || Number(stopTime.stopSequence) === Number(boardingStopSequence))
  ));
  const alightingIdx = tripStopTimes.findIndex((stopTime, idx) => (
    idx > boardingIdx &&
    stopTime.stopId === alightingStopId &&
    (!hasAlightingSequence || Number(stopTime.stopSequence) === Number(alightingStopSequence))
  ));

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
