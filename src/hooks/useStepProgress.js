/**
 * useStepProgress Hook
 *
 * Manages navigation progress through trip legs.
 * Auto-advances based on location proximity and handles
 * walking -> waiting -> transit -> walking transitions.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// Threshold for considering arrival at a destination (meters)
const ARRIVAL_THRESHOLD = 30;
const WALKING_STEP_THRESHOLD = 20; // Threshold for advancing walking steps

// Haversine distance calculation in meters
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const useStepProgress = (itinerary, userLocation, busProximity) => {
  const [currentLegIndex, setCurrentLegIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [legStatus, setLegStatus] = useState('not_started'); // 'not_started' | 'in_progress' | 'completed'
  const [transitStatus, setTransitStatus] = useState('waiting'); // 'waiting' | 'boarding' | 'on_board'
  const [isNavigationComplete, setIsNavigationComplete] = useState(false);
  const [distanceTraveled, setDistanceTraveled] = useState(0);
  const lastLocationRef = useRef(null);

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

  // Navigation state for UI
  const navigationState = useMemo(() => {
    if (!currentLeg) {
      return { type: 'complete', label: 'Trip Complete' };
    }

    const isWalking = currentLeg.mode === 'WALK';
    const isTransit = currentLeg.mode === 'BUS' || currentLeg.mode === 'TRANSIT';

    if (isWalking) {
      if (legStatus === 'not_started') {
        return { type: 'walking', label: `Walk to ${currentLeg.to.name}` };
      }
      return { type: 'walking', label: `Walking to ${currentLeg.to.name}` };
    }

    if (isTransit) {
      // Check transit sub-status
      if (transitStatus === 'on_board') {
        // User is riding the bus
        const stopsLeft = busProximity?.stopsUntilAlighting;
        if (busProximity?.shouldGetOff) {
          return { type: 'alighting', label: 'Get off now!' };
        }
        if (busProximity?.nearAlightingStop) {
          return { type: 'alighting_soon', label: 'Your stop is next!' };
        }
        return {
          type: 'transit',
          label: `Riding to ${currentLeg.to.name}`,
          stopsRemaining: stopsLeft ?? (currentLeg.intermediateStops?.length || 0),
        };
      }

      if (transitStatus === 'boarding') {
        return { type: 'boarding', label: `Board ${currentLeg.route?.shortName || 'Bus'}` };
      }

      // Waiting for bus
      if (!busProximity?.hasArrived) {
        return { type: 'waiting', label: `Wait for ${currentLeg.route?.shortName || 'Bus'}` };
      }
      return { type: 'boarding', label: `Board ${currentLeg.route?.shortName || 'Bus'}` };
    }

    return { type: 'unknown', label: 'Continue' };
  }, [currentLeg, legStatus, transitStatus, busProximity]);

  // Get instruction text based on current state
  const instructionText = useMemo(() => {
    if (!currentLeg) return 'You have arrived!';

    const isWalking = currentLeg.mode === 'WALK';
    const isTransit = currentLeg.mode === 'BUS' || currentLeg.mode === 'TRANSIT';

    if (isWalking && currentWalkingStep) {
      return currentWalkingStep.instruction || 'Continue walking';
    }

    if (isTransit) {
      // On board the bus
      if (transitStatus === 'on_board') {
        if (busProximity?.shouldGetOff) {
          return `Get off at ${currentLeg.to.name}!`;
        }
        if (busProximity?.nearAlightingStop) {
          return `Next stop: ${currentLeg.to.name}`;
        }
        const stopsLeft = busProximity?.stopsUntilAlighting;
        if (stopsLeft !== null && stopsLeft > 0) {
          return `${stopsLeft} stop${stopsLeft !== 1 ? 's' : ''} until ${currentLeg.to.name}`;
        }
        return `Riding to ${currentLeg.to.name}`;
      }

      // Waiting for bus
      if (!busProximity?.hasArrived) {
        if (busProximity?.stopsAway !== null && busProximity.stopsAway > 0) {
          return `Bus is ${busProximity.stopsAway} stop${busProximity.stopsAway !== 1 ? 's' : ''} away`;
        }
        if (busProximity?.isTracking) {
          return 'Bus is approaching...';
        }
        return 'Waiting for your bus';
      }
      return 'Board your bus now';
    }

    return currentLeg.to?.name ? `Head to ${currentLeg.to.name}` : 'Continue';
  }, [currentLeg, currentWalkingStep, busProximity, transitStatus]);

  // Start navigation (marks first leg as in progress)
  const startNavigation = useCallback(() => {
    setCurrentLegIndex(0);
    setCurrentStepIndex(0);
    setLegStatus('in_progress');
    setTransitStatus('waiting');
    setIsNavigationComplete(false);
    setDistanceTraveled(0);
    lastLocationRef.current = null;
  }, []);

  // Advance to next step within a walking leg
  const advanceStep = useCallback(() => {
    if (!currentLeg || currentLeg.mode !== 'WALK') return;

    const steps = currentLeg.steps || [];
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
      setDistanceTraveled(0); // Reset for new step
    }
  }, [currentLeg, currentStepIndex]);

  // Advance to next leg
  const advanceLeg = useCallback(() => {
    if (currentLegIndex < totalLegs - 1) {
      setCurrentLegIndex(currentLegIndex + 1);
      setCurrentStepIndex(0);
      setLegStatus('in_progress');
      setTransitStatus('waiting');
      setDistanceTraveled(0);
      lastLocationRef.current = null;
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
    setDistanceTraveled(0);
    lastLocationRef.current = null;
  }, []);

  // Auto-advance when arrived at destination (walking legs)
  useEffect(() => {
    if (!currentLeg) return;

    if (currentLeg.mode === 'WALK' && hasArrivedAtDestination) {
      // Wait a moment before auto-advancing
      const timer = setTimeout(() => {
        advanceLeg();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [currentLeg, hasArrivedAtDestination, advanceLeg]);

  // Track distance traveled for walking step advancement
  useEffect(() => {
    if (!userLocation || !currentLeg || currentLeg.mode !== 'WALK') return;

    if (lastLocationRef.current) {
      const dist = calculateDistance(
        lastLocationRef.current.latitude,
        lastLocationRef.current.longitude,
        userLocation.latitude,
        userLocation.longitude
      );
      // Only count significant movements (> 5m) to filter GPS noise
      if (dist > 5) {
        setDistanceTraveled(prev => prev + dist);
        lastLocationRef.current = userLocation;
      }
    } else {
      lastLocationRef.current = userLocation;
    }
  }, [userLocation, currentLeg]);

  // Auto-advance walking steps based on distance traveled
  useEffect(() => {
    if (!currentLeg || currentLeg.mode !== 'WALK') return;

    const steps = currentLeg.steps || [];
    if (steps.length === 0) return;

    const currentStep = steps[currentStepIndex];
    if (currentStep && currentStepIndex < steps.length - 1) {
      // Advance to next step when we've traveled the step's distance
      const stepDistance = currentStep.distance || 50;
      if (distanceTraveled >= stepDistance * 0.8) { // 80% threshold
        setCurrentStepIndex(prev => prev + 1);
        setDistanceTraveled(0);
      }
    }
  }, [currentLeg, currentStepIndex, distanceTraveled]);

  // Auto-update transit status when bus arrives
  useEffect(() => {
    if (!currentLeg) return;
    const isTransit = currentLeg.mode === 'BUS' || currentLeg.mode === 'TRANSIT';

    if (isTransit && transitStatus === 'waiting' && busProximity?.hasArrived) {
      setTransitStatus('boarding');
    }
  }, [currentLeg, transitStatus, busProximity?.hasArrived]);

  // Auto-advance when user should get off the bus
  useEffect(() => {
    if (!currentLeg) return;
    const isTransit = currentLeg.mode === 'BUS' || currentLeg.mode === 'TRANSIT';

    if (isTransit && transitStatus === 'on_board' && busProximity?.shouldGetOff) {
      // Wait a moment then advance
      const timer = setTimeout(() => {
        alightBus();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [currentLeg, transitStatus, busProximity?.shouldGetOff, alightBus]);

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
