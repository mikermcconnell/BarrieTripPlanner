import { buildTransitLegGeometry } from './buildTransitLegGeometry';
import { calculateLegDistance } from './calculateLegDistance';
import { decodePolyline, encodePolyline } from '../../utils/polylineUtils';

const appendUniqueCoordinates = (target, coordinates) => {
  coordinates.forEach((coordinate, index) => {
    if (index === 0 && target.length > 0) {
      const previous = target[target.length - 1];
      if (
        Math.abs(previous.latitude - coordinate.latitude) < 0.00001 &&
        Math.abs(previous.longitude - coordinate.longitude) < 0.00001
      ) {
        return;
      }
    }

    target.push(coordinate);
  });
};

const buildMergedGeometryFromSegments = (segments = []) => {
  const coordinates = [];

  if (segments.length < 2) {
    return null;
  }

  for (const segment of segments) {
    const decoded = segment.legGeometry?.points
      ? decodePolyline(segment.legGeometry.points)
      : [];

    if (decoded.length < 2) {
      return null;
    }

    appendUniqueCoordinates(coordinates, decoded);
  }

  if (coordinates.length < 2) {
    return null;
  }

  return {
    points: encodePolyline(coordinates),
    length: coordinates.length,
  };
};

const isSamePhysicalTrip = (previous, next) => (
  Boolean(previous?.tripId && next?.tripId && previous.tripId === next.tripId)
);

const getBlockId = (leg) => String(leg?.blockId || '').trim();

const getDirectionId = (leg) => {
  const rawDirectionId = leg?.directionId;
  if (rawDirectionId === null || rawDirectionId === undefined || rawDirectionId === '') return null;
  const numericDirectionId = Number(rawDirectionId);
  return Number.isFinite(numericDirectionId) ? numericDirectionId : String(rawDirectionId);
};

const endpointsMatch = (previous, next) => (
  Boolean(previous?.to?.stopId && next?.from?.stopId && previous.to.stopId === next.from.stopId)
);

const canMergeTransitLegs = (previous, next) => {
  if (isSamePhysicalTrip(previous, next)) return true;
  if (previous?.route?.shortName !== next?.route?.shortName) return false;
  if (!getBlockId(previous) || getBlockId(previous) !== getBlockId(next)) return false;
  if (!endpointsMatch(previous, next)) return false;

  const previousDirectionId = getDirectionId(previous);
  const nextDirectionId = getDirectionId(next);
  return (
    previousDirectionId === null ||
    nextDirectionId === null ||
    previousDirectionId === nextDirectionId
  );
};

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
          canMergeTransitLegs(previous, next)
        ) {
          index += 1;
          continue;
        }
      }

      merged.push(current);
      index += 1;
      continue;
    }

    const mergedSegments = [current];
    let mergedLeg = {
      ...current,
      intermediateStops: [...(current.intermediateStops || [])],
      tripIds: current.tripId ? [current.tripId] : [],
    };
    let nextIndex = index + 1;

    while (nextIndex < legs.length) {
      let next = legs[nextIndex];

      if (next.mode === 'WALK' && nextIndex + 1 < legs.length && legs[nextIndex + 1].mode === 'BUS') {
        const nextBus = legs[nextIndex + 1];
        if (canMergeTransitLegs(mergedLeg, nextBus)) {
          nextIndex += 1;
          next = legs[nextIndex];
        } else {
          break;
        }
      }

      if (next.mode === 'BUS' && canMergeTransitLegs(mergedLeg, next)) {
        mergedSegments.push(next);
        if (next.tripId && !mergedLeg.tripIds.includes(next.tripId)) {
          mergedLeg.tripIds.push(next.tripId);
        }

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
      mergedLeg.legGeometry = buildMergedGeometryFromSegments(mergedSegments)
        || buildTransitLegGeometry({
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
