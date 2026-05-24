const {
  buildActiveDetourEvents,
  buildDetourEventTitle,
  getActiveDetourEventCount,
} = require('../utils/detourEvents');

describe('detourEvents', () => {
  test('groups route variants into one location-focused detour event', () => {
    const events = buildActiveDetourEvents({
      '12A': {
        routeId: '12A',
        state: 'active',
        confidence: 'high',
        title: 'Saunders/Welham Detour - Route 12',
        description: 'Saunders Road and Welham Road intersection closure.',
        segments: [{
          segmentId: '12a-1',
          likelyDetourRoadNames: ['Welham Road', 'Mapleview Drive East', 'Bayview Drive'],
        }],
      },
      '12B': {
        routeId: '12B',
        state: 'active',
        confidence: 'medium',
        title: 'Saunders/Welham Detour - Route 12',
        description: 'Saunders Road and Welham Road intersection closure.',
        segments: [{
          segmentId: '12b-1',
          likelyDetourRoadNames: ['Bayview Drive', 'Mapleview Drive East', 'Welham Road'],
        }],
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'Saunders & Welham',
      routeIds: ['12A', '12B'],
      primaryRouteId: '12A',
      primarySegmentIndex: 0,
      confidence: 'high',
      state: 'active',
    });
  });

  test('prefers backend detourEventId over opposite-direction road titles', () => {
    const events = buildActiveDetourEvents({
      '12A': {
        routeId: '12A',
        state: 'active',
        confidence: 'high',
        segments: [{
          segmentId: '12a-1',
          detourEventId: 'detour-event-12-saunders-hooper',
          likelyDetourRoadNames: ['Hooper Road', 'Saunders Road'],
        }],
      },
      '12B': {
        routeId: '12B',
        state: 'active',
        confidence: 'high',
        segments: [{
          segmentId: '12b-1',
          detourEventId: 'detour-event-12-saunders-hooper',
          likelyDetourRoadNames: ['Saunders Road', 'Hooper Road'],
        }],
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      routeIds: ['12A', '12B'],
      title: 'Hooper & Saunders',
    });
  });

  test('keeps unrelated detour events separate', () => {
    const events = buildActiveDetourEvents({
      '12A': {
        routeId: '12A',
        state: 'active',
        confidence: 'high',
        title: 'Saunders/Welham Detour - Route 12',
        segments: [{ segmentId: '12a-1' }],
      },
      '8A': {
        routeId: '8A',
        state: 'active',
        confidence: 'high',
        title: 'Sophia Street Detour - Route 8A',
        segments: [{ segmentId: '8a-1' }],
      },
    });

    expect(events.map((event) => event.title)).toEqual(expect.arrayContaining(['Sophia Street', 'Saunders & Welham']));
  });

  test('keeps separate segments on one route as separate events when no shared location exists', () => {
    const events = buildActiveDetourEvents({
      '10': {
        routeId: '10',
        state: 'active',
        confidence: 'high',
        segments: [
          { segmentId: 'west', entryPoint: { latitude: 44.1, longitude: -79.1 }, exitPoint: { latitude: 44.2, longitude: -79.2 } },
          { segmentId: 'east', entryPoint: { latitude: 44.3, longitude: -79.3 }, exitPoint: { latitude: 44.4, longitude: -79.4 } },
        ],
      },
    });

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.primarySegmentIndex)).toEqual([0, 1]);
  });

  test('does not use generic detour labels as event titles', () => {
    expect(buildDetourEventTitle({
      routeId: '10',
      segment: { detourPathLabel: 'Likely detour path' },
      detour: { likelyDetourRoadNames: ['Hooper Road', 'Saunders Road'] },
    })).toBe('Hooper & Saunders');
  });

  test('adds stop codes to generated road-location titles', () => {
    expect(buildDetourEventTitle({
      routeId: '10',
      segment: {
        skippedStopCodes: ['946'],
        likelyDetourRoadNames: ['Mulcaster Street', 'McDonald Street'],
      },
    })).toBe('Mulcaster & McDonald · Stop #946');
  });

  test('uses top-level affected stop references when segment stop codes are absent', () => {
    expect(buildDetourEventTitle({
      routeId: '11',
      detour: {
        affectedStops: ['191', '192', '556'],
        likelyDetourRoadNames: ['Owen Street', 'McDonald Street', 'Mulcaster Street'],
      },
      segment: { detourPathLabel: 'Likely detour path' },
    })).toBe('Owen & McDonald · Stops #191, #192 +1');
  });

  test('does not duplicate stop code text when the title already includes it', () => {
    expect(buildDetourEventTitle({
      routeId: '10',
      detour: {
        title: 'Stop #946 Detour - Route 10',
        affectedStopCodes: ['946'],
      },
    })).toBe('Stop #946');
  });

  test('groups same physical closures across different route families without merging unrelated Route 12 segments', () => {
    const activeDetours = {
      '10': {
        routeId: '10',
        state: 'active',
        confidence: 'high',
        segments: [{
          likelyDetourRoadNames: ['Mulcaster Street', 'McDonald Street', 'Codrington Street', 'Owen Street', 'Worsley Street'],
          entryPoint: { latitude: 44.3928145, longitude: -79.6856857 },
          exitPoint: { latitude: 44.3904780, longitude: -79.6878347 },
        }],
      },
      '11': {
        routeId: '11',
        state: 'active',
        confidence: 'high',
        segments: [{
          likelyDetourRoadNames: ['Collier Street', 'Owen Street', 'Worsley Street'],
          entryPoint: { latitude: 44.3903595, longitude: -79.6880180 },
          exitPoint: { latitude: 44.3915910, longitude: -79.6854855 },
        }],
      },
      '12A': {
        routeId: '12A',
        state: 'active',
        confidence: 'high',
        detourEventId: 'detour-event-12-36tmpc',
        likelyDetourRoadNames: ['Hooper Road', 'Saunders Road'],
        segments: [
          {
            likelyDetourRoadNames: ['Hooper Road', 'Saunders Road'],
            entryPoint: { latitude: 44.3365493, longitude: -79.6693683 },
            exitPoint: { latitude: 44.3328595, longitude: -79.6748271 },
          },
          {
            entryPoint: { latitude: 44.3907684, longitude: -79.6928310 },
            exitPoint: { latitude: 44.3919808, longitude: -79.6925768 },
          },
        ],
      },
      '12B': {
        routeId: '12B',
        state: 'active',
        confidence: 'high',
        detourEventId: 'detour-event-12-36tmpc',
        likelyDetourRoadNames: ['Saunders Road', 'Hooper Road', 'Welham Road'],
        segments: [
          {
            likelyDetourRoadNames: ['Saunders Road', 'Hooper Road', 'Welham Road'],
            entryPoint: { latitude: 44.3330564, longitude: -79.6735477 },
            exitPoint: { latitude: 44.3371705, longitude: -79.6693513 },
          },
          {
            likelyDetourRoadNames: ['Sophia Street West', 'Maple Avenue', 'Ross Street'],
            entryPoint: { latitude: 44.3919967, longitude: -79.6926065 },
            exitPoint: { latitude: 44.3907407, longitude: -79.6928928 },
          },
        ],
      },
      '8A': {
        routeId: '8A',
        state: 'active',
        confidence: 'low',
        segments: [{ likelyDetourRoadNames: ['Maple Avenue', 'Simcoe Street', 'Mulcaster Street'] }],
      },
    };

    const events = buildActiveDetourEvents(activeDetours);

    expect(events).toHaveLength(3);
    expect(getActiveDetourEventCount(activeDetours)).toBe(3);
    expect(events.map((event) => event.title)).toEqual(expect.arrayContaining([
      'Mulcaster & McDonald',
      'Hooper & Saunders',
      'Sophia West & Maple',
    ]));
    expect(events.find((event) => event.title === 'Mulcaster & McDonald').routeIds).toEqual(['10', '11']);
    expect(events.filter((event) => event.routeIds.includes('12A') || event.routeIds.includes('12B'))).toHaveLength(2);
  });
});
