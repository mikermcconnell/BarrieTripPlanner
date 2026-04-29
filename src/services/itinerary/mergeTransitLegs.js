import { buildTransitLegGeometry } from './buildTransitLegGeometry';
import { calculateLegDistance } from './calculateLegDistance';

export const mergeTransitLegs = (legs, routingData) => {
  if (legs.length <= 1) return legs;

  const merged = [];
  let index = 0;

  while (index < legs.length) {
    const current = legs[index];

    if (current.mode !== 'BUS') {
      if (current.mode === 'WALK' && index > 0 && index < legs.length - 1) {
        const previous = merged[merged.length - 1];
        const next = legs[index + 1];

        if (
          previous?.mode === 'BUS' &&
          next?.mode === 'BUS' &&
          previous.route?.shortName === next.route?.shortName
        ) {
          index += 1;
          continue;
        }
      }

      merged.push(current);
      index += 1;
      continue;
    }

    let mergedLeg = { ...current, intermediateStops: [...(current.intermediateStops || [])] };
    let nextIndex = index + 1;

    while (nextIndex < legs.length) {
      let next = legs[nextIndex];

      if (next.mode === 'WALK' && nextIndex + 1 < legs.length && legs[nextIndex + 1].mode === 'BUS') {
        const nextBus = legs[nextIndex + 1];
        if (nextBus.route?.shortName === mergedLeg.route?.shortName) {
          nextIndex += 1;
          next = legs[nextIndex];
        } else {
          break;
        }
      }

      if (next.mode === 'BUS' && next.route?.shortName === mergedLeg.route?.shortName) {
        mergedLeg.intermediateStops.push({
          name: mergedLeg.to.name,
          lat: mergedLeg.to.lat,
          lon: mergedLeg.to.lon,
          stopId: mergedLeg.to.stopId,
          stopCode: mergedLeg.to.stopCode || mergedLeg.to.stopId || null,
        });

        if (next.intermediateStops) {
          mergedLeg.intermediateStops.push(...next.intermediateStops);
        }

        mergedLeg = {
          ...mergedLeg,
          to: next.to,
          endTime: next.endTime,
          scheduledEndTime: next.scheduledEndTime,
        };
        mergedLeg.duration = Math.round((mergedLeg.endTime - mergedLeg.startTime) / 1000);
        mergedLeg.distance = calculateLegDistance(
          mergedLeg.from,
          mergedLeg.to,
          mergedLeg.intermediateStops
        );
        nextIndex += 1;
      } else {
        break;
      }
    }

    if (nextIndex > index + 1 && routingData) {
      mergedLeg.legGeometry = buildTransitLegGeometry({
        tripId: mergedLeg.tripId,
        tripIndex: routingData.tripIndex,
        shapes: routingData.shapes,
        from: mergedLeg.from,
        to: mergedLeg.to,
        intermediateStops: mergedLeg.intermediateStops,
      });
    }

    merged.push(mergedLeg);
    index = nextIndex;
  }

  return merged;
};

export default mergeTransitLegs;
