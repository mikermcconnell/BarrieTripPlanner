/**
 * useStepProgress Hook
 *
 * Manages navigation progress through trip legs.
 * Auto-advances based on location proximity and handles
 * walking -> waiting -> transit -> walking transitions.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { safeHaversineDistance as calculateDistance } from '../utils/geometryUtils';

// Threshold for considering arrival at a destination (meters)
const ARRIVAL_THRESHOLD = 30;
const WALK_ARRIVAL_MAX_ACCURACY_METERS = 35;
const WALK_ARRIVAL_REQUIRED_HITS = 2;

const getStopCode = (stop) => stop?.stopCode || stop?.stopId || stop?.code || null;

const getWalkingDestinationLabel = (leg) => {
  const stopCode = getStopCode(leg?.to);
  if (stopCode) return `Stop #${stopCode}`;
  return leg?.to?.name || 'your stop';
};

export const buildStepProgressPresentation = ({
  currentLeg,
  legStatus,
  transitStatus,
  busProximity,
}) => {
  if (!currentLeg) {
    return {
      navigationState: { type: 'complete', label: 'Trip Complete' },
      instructionText: 'You have arrived!',
    };
  }

  const isWalking = currentLeg.mode === 'WALK';
  const isTransit = currentLeg.mode === 'BUS' || currentLeg.mode === 'TRANSIT';
  const destinationName = currentLeg.to?.name || 'your stop';
  const routeName = currentLeg.route?.shortName || 'Bus';

  if (isWalking) {
    const destinationLabel = getWalkingDestinationLabel(currentLeg);
    return {
      navigationState: {
        type: 'walking',
        label: `${legStatus === 'not_started' ? 'Walk' : 'Walking'} to ${destinationLabel}`,
      },
      instructionText: `Walk to ${destinationLabel}`,
    };
  }

  if (isTransit) {
    if (transitStatus === 'on_board') {
      const stopsLeft = busProximity?.stopsUntilAlighting;
      if (busProximity?.shouldGetOff) {
        return {
          navigationState: { type: 'alighting', label: 'Get off now!' },
          instructionText: `Get off at ${destinationName}!`,
        };
      }
      if (busProximity?.nearAlightingStop) {
        return {
          navigationState: { type: 'alighting_soon', label: 'Your stop is next!' },
          instructionText: `Next stop: ${destinationName}`,
        };
      }
      return {
        navigationState: {
          type: 'transit',
          label: `Riding to ${destinationName}`,
          stopsRemaining: stopsLeft ?? (currentLeg.intermediateStops?.length || 0),
        },
        instructionText: typeof stopsLeft === 'number' && stopsLeft > 0
          ? `${stopsLeft} stop${stopsLeft !== 1 ? 's' : ''} until ${destinationName}`
          : `Riding to ${destinationName}`,
      };
    }

    if (transitStatus === 'boarding' || busProximity?.hasArrived) {
      return {
        navigationState: { type: 'boarding', label: `Board ${routeName}` },
        instructionText: 'Board your bus now',
      };
    }

    const stopsAway = busProximity?.stopsAway;
    return {
      navigationState: { type: 'waiting', label: `Wait for ${routeName}` },
      instructionText: typeof stopsAway === 'number' && stopsAway > 0
        ? `Bus is ${stopsAway} stop${stopsAway !== 1 ? 's' : ''} away`
        : busProximity?.isTracking
          ? 'Bus is approaching...'
          : 'Waiting for your bus',
    };
  }

  if (currentLeg.isOnDemand) {
    return {
      navigationState: {
        type: 'on_demand',
        label: `On-demand to ${currentLeg.to?.name || 'hub stop'}`,
      },
      instructionText: `Head to ${destinationName}`,
    };
  }

  return {
    navigationState: { type: 'unknown', label: 'Continue' },
    instructionText: currentLeg.to?.name ? `Head to ${currentLeg.to.name}` : 'Continue',
  };
};

export const useStepProgress = (itinerary, userLocation, busProximity) => {
  const [currentLegIndex, setCurrentLegIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [legStatus, setLegStatus] = useState('not_started'); // 'not_started' | 'in_progress' | 'completed'
  const [transitStatus, setTransitStatus] = useState('waiting'); // 'waiting' | 'boarding' | 'on_board'
  const [isNavigationComplete, setIsNavigationComplete] = useState(false);
  const [walkingArrivalEvidenceHits, setWalkingArrivalEvidenceHits] = useState(0);
  const lastWalkingArrivalSampleRef = useRef(null);
  const walkingArrivalLegIndexRef = useRef(currentLegIndex);

  const legs = itinerary?.legs || [];
  const currentLeg = legs[currentLegIndex];
  const totalLegs = legs.length;

  // Track if user is on board a transit vehicle
  const isUserOnBoard = useMemo(() => {
    if (!currentLeg) return false;
    const isTransit = currentLeg.mode === 'BUS' || currentLeg.mode === 'TRANSIT';
    return isTransit && transitStatus === 'on_board';
  }, [currentLeg, transitStatus]);

  // Get current walking step if on a walking leg
  const currentWalkingStep = useMemo(() => {
    if (!currentLeg || currentLeg.mode !== 'WALK') return null;
    const steps = currentLeg.steps || [];
    return steps[currentStepIndex] || null;
  }, [currentLeg, currentStepIndex]);

  // Get the destination to check for arrival
  const currentDestination = useMemo(() => {
    if (!currentLeg) return null;
    return currentLeg.to;
  }, [currentLeg]);

  // Calculate distance to current destination
  const distanceToDestination = useMemo(() => {
    if (!userLocation || !currentDestination) return null;
    return calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      currentDestination.lat,
      currentDestination.lon
    );
  }, [userLocation, currentDestination]);

  // Check if we've arrived at current leg's destination
  const hasArrivedAtDestination = useMemo(() => {
    return distanceToDestination !== null && distanceToDestination < ARRIVAL_THRESHOLD;
  }, [distanceToDestination]);

  useEffect(() => {
    if (walkingArrivalLegIndexRef.current !== currentLegIndex) {
      walkingArrivalLegIndexRef.current = currentLegIndex;
      lastWalkingArrivalSampleRef.current = null;
      setWalkingArrivalEvidenceHits(0);
      return;
    }

    const accuracy = Number(userLocation?.accuracy);
    const isReliableArrivalFix = (
      currentLeg?.mode === 'WALK' &&
      hasArrivedAtDestination &&
      Number.isFinite(accuracy) &&
      accuracy <= WALK_ARRIVAL_MAX_ACCURACY_METERS
    );

    if (!isReliableArrivalFix) {
      lastWalkingArrivalSampleRef.current = null;
      setWalkingArrivalEvidenceHits(0);
      return;
    }

    const sampleKey = Number.isFinite(Number(userLocation?.timestamp))
      ? Number(userLocation.timestamp)
      : null;
    if (sampleKey == null || sampleKey === lastWalkingArrivalSampleRef.current) return;

    lastWalkingArrivalSampleRef.current = sampleKey;
    setWalkingArrivalEvidenceHits((hits) => Math.min(WALK_ARRIVAL_REQUIRED_HITS, hits + 1));
  }, [
    currentLeg?.mode,
    currentLegIndex,
    hasArrivedAtDestination,
    userLocation?.accuracy,
    userLocation?.latitude,
    userLocation?.longitude,
    userLocation?.timestamp,
  ]);

  const hasReliableWalkingArrival = walkingArrivalEvidenceHits >= WALK_ARRIVAL_REQUIRED_HITS;

  const { navigationState, instructionText } = useMemo(
    () => buildStepProgressPresentation({ currentLeg, legStatus, transitStatus, busProximity }),
    [currentLeg, legStatus, transitStatus, busProximity]
  );

  // Start navigation (marks first leg as in progress)
  const startNavigation = useCallback(() => {
    setCurrentLegIndex(0);
    setCurrentStepIndex(0);
    setLegStatus('in_progress');
    setTransitStatus('waiting');
    setIsNavigationComplete(false);
  }, []);

  // Advance to next step within a walking leg
  const advanceStep = useCallback(() => {
    if (!currentLeg || currentLeg.mode !== 'WALK') return;

    const steps = currentLeg.steps || [];
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  }, [currentLeg, currentStepIndex]);

  // Advance to next leg
  const advanceLeg = useCallback(() => {
    if (currentLegIndex < totalLegs - 1) {
      setCurrentLegIndex(currentLegIndex + 1);
      setCurrentStepIndex(0);
      setLegStatus('in_progress');
      setTransitStatus('waiting');
    } else {
      // Trip complete
      setLegStatus('completed');
      setIsNavigationComplete(true);
    }
  }, [currentLegIndex, totalLegs]);

  // Board the bus (user confirms they're on)
  const boardBus = useCallback(() => {
    if (!currentLeg) return;
    const isTransit = currentLeg.mode === 'BUS' || currentLeg.mode === 'TRANSIT';
    if (isTransit) {
      setTransitStatus('on_board');
    }
  }, [currentLeg]);

  // Get off the bus (manual or auto-triggered)
  const alightBus = useCallback(() => {
    setTransitStatus('waiting');
    advanceLeg();
  }, [advanceLeg]);

  // Manual completion of current leg (user override)
  const completeLeg = useCallback(() => {
    const isTransit = currentLeg?.mode === 'BUS' || currentLeg?.mode === 'TRANSIT';
    if (isTransit && transitStatus !== 'on_board') {
      // User is completing wait/boarding - mark as on board first
      boardBus();
    } else {
      // Complete the leg entirely
      advanceLeg();
    }
  }, [currentLeg, transitStatus, boardBus, advanceLeg]);

  // Reset navigation
  const resetNavigation = useCallback(() => {
    setCurrentLegIndex(0);
    setCurrentStepIndex(0);
    setLegStatus('not_started');
    setTransitStatus('waiting');
    setIsNavigationComplete(false);
  }, []);

  // Auto-advance when arrived at destination (walking legs)
  useEffect(() => {
    if (!currentLeg) return;

    if (currentLeg.mode === 'WALK' && hasReliableWalkingArrival) {
      // Wait a moment before auto-advancing
      const timer = setTimeout(() => {
        advanceLeg();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [currentLeg, hasReliableWalkingArrival, advanceLeg]);

  // Do not auto-advance minor walking maneuvers. GPS drift can make tiny
  // street-level steps noisy; the rider-facing task is simply reaching the
  // marked stop/destination.

  // Auto-update transit status when bus arrives
  useEffect(() => {
    if (!currentLeg) return;
    const isTransit = currentLeg.mode === 'BUS' || currentLeg.mode === 'TRANSIT';

    if (isTransit && transitStatus === 'waiting' && busProximity?.hasArrived) {
      setTransitStatus('boarding');
    }
  }, [currentLeg, transitStatus, busProximity?.hasArrived]);

  // Auto-board only after sustained high-confidence evidence.
  useEffect(() => {
    if (!currentLeg) return;
    const isTransit = currentLeg.mode === 'BUS' || currentLeg.mode === 'TRANSIT';

    if (
      isTransit &&
      (transitStatus === 'waiting' || transitStatus === 'boarding') &&
      busProximity?.autoBoardReady
    ) {
      const timer = setTimeout(() => {
        boardBus();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [currentLeg, transitStatus, busProximity?.autoBoardReady, boardBus]);

  // Auto-advance when user should get off the bus
  useEffect(() => {
    if (!currentLeg) return;
    const isTransit = currentLeg.mode === 'BUS' || currentLeg.mode === 'TRANSIT';

    if (isTransit && transitStatus === 'on_board' && busProximity?.autoAlightReady) {
      // Wait a moment then advance
      const timer = setTimeout(() => {
        alightBus();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [currentLeg, transitStatus, busProximity?.autoAlightReady, alightBus]);

  return {
    // Current state
    currentLegIndex,
    currentLeg,
    currentStepIndex,
    currentWalkingStep,
    legStatus,
    transitStatus,
    totalLegs,
    isUserOnBoard,

    // Derived state
    navigationState,
    instructionText,
    distanceToDestination,
    hasArrivedAtDestination,
    hasReliableWalkingArrival,
    isNavigationComplete,

    // Actions
    startNavigation,
    advanceStep,
    advanceLeg,
    boardBus,
    alightBus,
    completeLeg,
    resetNavigation,
  };
};

export default useStepProgress;
