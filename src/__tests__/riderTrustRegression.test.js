const path = require('path');
const src = p => path.join(process.cwd(), 'src', p);
jest.doMock(src('utils/logger'), () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn()
  }
}));
jest.doMock(src('services/tripService'), () => ({
  formatMinutes: n => `${n} min`
}));
jest.doMock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {})
  }
}));
jest.doMock(src('services/proxyAuth'), () => ({
  getApiProxyRequestOptions: jest.fn(async () => ({}))
}));
jest.doMock(src('utils/fetchWithCORS'), () => ({
  fetchWithCORS: jest.fn()
}));
const {
  planTripLocal
} = require(src('services/localRouter'));
const {
  buildRoutingData
} = require(src('services/routingDataService'));
const {
  applyDelaysToItinerary
} = require(src('services/tripDelayService'));
const {
  recalculateItineraryAfterWalkingEnrichment
} = require(src('services/walkingService'));
const {
  getItineraryNavigationBlock
} = require(src('utils/tripNavigationSafety'));
const {
  fetchTripUpdates
} = require(src('services/arrivalService'));
const {
  fetchWithCORS
} = require(src('utils/fetchWithCORS'));
const at = (day, h, m = 0) => new Date(2026, 8, day, h, m).getTime();
const bus = (tripId, from, to, start, end) => ({
  mode: 'BUS',
  tripId,
  route: {
    id: tripId,
    shortName: tripId
  },
  from: {
    stopId: from
  },
  to: {
    stopId: to
  },
  startTime: start,
  endTime: end,
  scheduledStartTime: start,
  scheduledEndTime: end,
  duration: (end - start) / 1000
});
const itinerary = (legs, extra = {}) => ({
  legs,
  startTime: legs[0].startTime,
  endTime: legs.at(-1).endTime,
  duration: (legs.at(-1).endTime - legs[0].startTime) / 1000,
  walkDistance: 0,
  walkTime: 0,
  transfers: legs.filter(l => l.mode === 'BUS').length - 1,
  ...extra
});
const update = (tripId, stopTimeUpdates, extra = {}) => ({
  tripUpdate: {
    tripId,
    stopTimeUpdates,
    timestamp: Date.now() / 1000,
    startDate: '20260920',
    ...extra
  }
});
beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(at(20, 8)));
afterEach(() => jest.restoreAllMocks());
test('control: same-day boarding delay shifts a bus by 5 minutes', async () => {
  const i = itinerary([bus('A', 'O', 'D', at(20, 9), at(20, 9, 20))]);
  const r = await applyDelaysToItinerary(i, [update('A', [{
    stopId: 'O',
    departure: {
      delay: 300
    }
  }])]);
  expect(r.legs[0].startTime).toBe(at(20, 9, 5));
});
test('previous-service-day bus retains its actual calendar date', async () => {
  const stops = [{
    id: 'O',
    latitude: 44.389,
    longitude: -79.700,
    name: 'Origin'
  }, {
    id: 'D',
    latitude: 44.400,
    longitude: -79.680,
    name: 'Destination'
  }];
  const trips = [{
    tripId: 'night',
    routeId: '1',
    directionId: 0,
    serviceId: 'night'
  }];
  const stopTimes = [{
    tripId: 'night',
    stopId: 'O',
    arrivalTime: 89280,
    departureTime: 89280,
    stopSequence: 1,
    pickupType: 0,
    dropOffType: 0
  }, {
    tripId: 'night',
    stopId: 'D',
    arrivalTime: 90000,
    departureTime: 90000,
    stopSequence: 2,
    pickupType: 0,
    dropOffType: 0
  }];
  const routingData = buildRoutingData({
    stops,
    trips,
    stopTimes,
    calendar: [],
    calendarDates: []
  });
  routingData.serviceCalendar = {
    '20260919': new Set(['night']),
    '20260920': new Set()
  };
  const r = await planTripLocal({
    fromLat: 44.389,
    fromLon: -79.700,
    toLat: 44.400,
    toLon: -79.680,
    date: new Date(2026, 8, 20),
    time: new Date(2026, 8, 20, 0, 30),
    routingData
  });
  const ride = r.itineraries[0].legs.find(l => l.mode === 'BUS');
  expect(ride.startTime - at(20, 0, 48)).toBe(0);
});
test('rejects wrong-day predictions for future trips', async () => {
  const i = itinerary([bus('A', 'O', 'D', at(21, 9), at(21, 9, 20))]);
  const r = await applyDelaysToItinerary(i, [update('A', [{
    stopId: 'O',
    departure: {
      delay: 600,
      time: at(19, 9, 10) / 1000
    }
  }], {
    startDate: '20260919',
    timestamp: at(19, 9) / 1000
  })]);
  expect(r.legs[0].startTime).toBe(at(21, 9));
  expect(r.legs[0].isRealtime).toBe(false);
  expect(r.hasMissedDeparture).toBe(false);
});
test('rejects two-hour-old predictions', async () => {
  const i = itinerary([bus('A', 'O', 'D', at(20, 9), at(20, 9, 20))]);
  const r = await applyDelaysToItinerary(i, [update('A', [{
    stopId: 'O',
    departure: {
      delay: 600
    }
  }], {
    startDate: '20260920',
    timestamp: at(20, 6) / 1000
  })]);
  expect(r.legs[0].isRealtime).toBe(false);
  expect(r.legs[0].startTime).toBe(at(20, 9));
});
test('uses timestamp-only predictions', async () => {
  const i = itinerary([bus('A', 'O', 'D', at(20, 9), at(20, 9, 20))]);
  const r = await applyDelaysToItinerary(i, [update('A', [{
    stopId: 'O',
    departure: {
      time: at(20, 9, 10) / 1000,
      delay: null
    }
  }])]);
  expect(r.legs[0].startTime).toBe(at(20, 9, 10));
  expect(r.legs[0].delaySeconds).toBe(600);
  expect(r.legs[0].isRealtime).toBe(true);
});
test('blocks a transfer made impossible by the alighting-stop prediction', async () => {
  const i = itinerary([bus('A', 'O', 'X', at(20, 9), at(20, 9, 20)), bus('B', 'X', 'D', at(20, 9, 30), at(20, 9, 45))]);
  const r = await applyDelaysToItinerary(i, [update('A', [{
    stopId: 'O',
    departure: {
      delay: 0
    }
  }, {
    stopId: 'X',
    arrival: {
      delay: 900,
      time: at(20, 9, 35) / 1000
    }
  }])]);
  expect(r.legs[0].endTime).toBe(at(20, 9, 35));
  expect(r.hasMissedTransfer).toBe(true);
  expect(r.transferRisk.status).toBe('missed');
  expect(getItineraryNavigationBlock(r).code).toBe('MISSED_TRANSFER');
});
test('navigation rejects walking that violates the requested time', () => {
  const walk = (start, end) => ({
    mode: 'WALK',
    startTime: start,
    endTime: end,
    duration: 600,
    distance: 600,
    from: {
      lat: 44.389,
      lon: -79.7
    },
    to: {
      lat: 44.39,
      lon: -79.69
    }
  });
  const depart = itinerary([walk(at(20, 8), at(20, 8, 5)), bus('A', 'O', 'D', at(20, 8, 5), at(20, 8, 20))], {
    requestedTimeMs: at(20, 8)
  });
  const d = recalculateItineraryAfterWalkingEnrichment(depart);
  expect(d.startTime).toBe(at(20, 7, 55));
  expect(getItineraryNavigationBlock(d).code).toBe('DEPARTS_TOO_EARLY');
  const arrive = itinerary([bus('A', 'O', 'D', at(20, 8, 30), at(20, 8, 55)), walk(at(20, 8, 55), at(20, 9))], {
    arriveBy: true,
    requestedTimeMs: at(20, 9)
  });
  const a = recalculateItineraryAfterWalkingEnrichment(arrive);
  expect(a.endTime).toBe(at(20, 9, 5));
  expect(getItineraryNavigationBlock(a).code).toBe('ARRIVES_TOO_LATE');
});

// Encode a small, valid GTFS-RT protobuf to exercise the real feed parser.
const vi = n => {
  const b = [];
  while (n > 127) {
    b.push(n % 128 | 128);
    n = Math.floor(n / 128);
  }
  b.push(n);
  return b;
};
const scalar = (f, n) => [...vi(f * 8), ...vi(n)];
const bytes = (f, b) => [...vi(f * 8 + 2), ...vi(b.length), ...b];
const str = (f, s) => bytes(f, Array.from(Buffer.from(s)));
test('parser preserves service date, cancellation, skipped stops and timestamps', async () => {
  const header = [...str(1, '2.0'), ...scalar(3, at(19, 9) / 1000)];
  const descriptor = [...str(1, 'A'), ...str(3, '20260919'), ...scalar(4, 3), ...str(5, '1')];
  const st = [...str(4, 'O'), ...bytes(3, scalar(2, at(19, 9, 10) / 1000)), ...scalar(5, 1)];
  const tu = [...bytes(1, descriptor), ...bytes(2, st), ...scalar(4, at(19, 9) / 1000)];
  const entity = [...str(1, 'entity'), ...bytes(3, tu)];
  const payload = Uint8Array.from([...bytes(1, header), ...bytes(2, entity)]);
  fetchWithCORS.mockResolvedValue({
    ok: true,
    arrayBuffer: async () => payload.buffer
  });
  const parsed = await fetchTripUpdates();
  expect(parsed[0].tripUpdate).toEqual({
    tripId: 'A',
    routeId: '1',
    startDate: '20260919',
    startTime: null,
    scheduleRelationship: 3,
    timestamp: at(19, 9) / 1000,
    feedTimestamp: at(19, 9) / 1000,
    stopTimeUpdates: [{
      stopSequence: null,
      stopId: 'O',
      scheduleRelationship: 1,
      arrival: null,
      departure: {
        delay: null,
        time: at(19, 9, 10) / 1000
      }
    }]
  });
});
test('walking enrichment removes impossible departure and offers a later bus', async () => {
  const storage = require('@react-native-async-storage/async-storage').default;
  storage.getItem.mockResolvedValue(JSON.stringify({
    timestamp: at(20, 8),
    data: {
      duration: 600,
      distance: 600,
      geometry: 'abc',
      steps: [{
        instruction: 'Walk',
        distance: 600,
        duration: 600
      }],
      source: 'locationiq'
    }
  }));
  const {
    enrichTripPlanWithWalking
  } = require(src('services/walkingService'));
  const walk = {
    mode: 'WALK',
    startTime: at(20, 8),
    endTime: at(20, 8, 5),
    duration: 300,
    distance: 300,
    from: {
      lat: 44.389,
      lon: -79.700
    },
    to: {
      lat: 44.390,
      lon: -79.699
    }
  };
  const i = itinerary([walk, bus('A', 'O', 'D', at(20, 8, 5), at(20, 8, 20))], {
    requestedTimeMs: at(20, 8)
  });
  const later = itinerary([{
    ...walk,
    startTime: at(20, 8, 10),
    endTime: at(20, 8, 15)
  }, bus('B', 'O', 'D', at(20, 8, 15), at(20, 8, 30))], {
    requestedTimeMs: at(20, 8)
  });
  const result = await enrichTripPlanWithWalking({
    itineraries: [i, later]
  });
  expect(result.itineraries).toHaveLength(1);
  const enriched = result.itineraries[0];
  expect(enriched.startTime).toBe(at(20, 8, 5));
  expect(enriched.isRecommended).toBe(true);
  const withLive = await applyDelaysToItinerary(enriched, []);
  expect(withLive.hasMissedDeparture).toBe(false);
  expect(getItineraryNavigationBlock(withLive)).toBeNull();
});
test.each([['missing timestamp', {
  timestamp: null
}], ['future timestamp', {
  timestamp: at(20, 8, 5) / 1000
}], ['fresh wrong service date', {
  startDate: '20260919'
}]])('falls back to schedule for %s', async (_label, extra) => {
  const i = itinerary([bus('A', 'O', 'D', at(20, 9), at(20, 9, 20))]);
  const r = await applyDelaysToItinerary(i, [update('A', [{
    stopId: 'O',
    departure: {
      delay: 600
    }
  }], extra)]);
  expect(r.legs[0].startTime).toBe(at(20, 9));
  expect(r.legs[0].isRealtime).toBe(false);
});
test('matches the correct date even when another instance follows it in the feed', async () => {
  const i = itinerary([bus('A', 'O', 'D', at(20, 9), at(20, 9, 20))]);
  const r = await applyDelaysToItinerary(i, [update('A', [{
    stopId: 'O',
    departure: {
      delay: 60
    }
  }]), update('A', [{
    stopId: 'O',
    departure: {
      delay: 600
    }
  }], {
    startDate: '20260921'
  })]);
  expect(r.legs[0].startTime).toBe(at(20, 9, 1));
});
test('uses service date rather than calendar departure date after midnight', async () => {
  const ride = {
    ...bus('A', 'O', 'D', at(20, 0, 30), at(20, 0, 50)),
    serviceDate: '20260919'
  };
  const r = await applyDelaysToItinerary(itinerary([ride]), [update('A', [{
    stopId: 'O',
    departure: {
      delay: 60
    }
  }], {
    startDate: '20260919'
  })]);
  expect(r.legs[0].startTime).toBe(at(20, 0, 31));
});
test('ignores undated vehicle evidence for a future trip', async () => {
  const ride = {
    ...bus('A', 'O', 'D', at(21, 9), at(21, 9, 20)),
    boardingStopSequence: 2
  };
  const r = await applyDelaysToItinerary(itinerary([ride]), [], {
    vehicles: [{
      tripId: 'A',
      currentStopSequence: 4,
      timestamp: at(20, 8) / 1000
    }]
  });
  expect(r.hasMissedDeparture).toBe(false);
});
test('absolute event time takes precedence over conflicting delay', async () => {
  const i = itinerary([bus('A', 'O', 'D', at(20, 9), at(20, 9, 20))]);
  const r = await applyDelaysToItinerary(i, [update('A', [{
    stopId: 'O',
    departure: {
      time: at(20, 9, 5) / 1000,
      delay: 600
    }
  }])]);
  expect(r.legs[0].startTime).toBe(at(20, 9, 5));
});
test('repeated stop visits use sequence and do not reuse the wrong visit', async () => {
  const ride = {
    ...bus('A', 'loop', 'loop', at(20, 9), at(20, 9, 20)),
    boardingStopSequence: 2,
    alightingStopSequence: 8
  };
  const r = await applyDelaysToItinerary(itinerary([ride]), [update('A', [{
    stopId: 'loop',
    stopSequence: 2,
    departure: {
      delay: 60
    }
  }, {
    stopId: 'loop',
    stopSequence: 8,
    arrival: {
      delay: 600
    }
  }])]);
  expect(r.legs[0].startTime).toBe(at(20, 9, 1));
  expect(r.legs[0].endTime).toBe(at(20, 9, 30));
  const wrong = await applyDelaysToItinerary(itinerary([ride]), [update('A', [{
    stopId: 'loop',
    stopSequence: 5,
    departure: {
      delay: 900
    }
  }])]);
  expect(wrong.legs[0].isRealtime).toBe(false);
});
test.each([['cancelled bus', [], {
  scheduleRelationship: 3
}], ['skipped boarding stop', [{
  stopId: 'O',
  scheduleRelationship: 1
}], {}], ['skipped exit stop', [{
  stopId: 'D',
  scheduleRelationship: 1
}], {}]])('blocks navigation for %s', async (_label, stops, extra) => {
  const i = itinerary([bus('A', 'O', 'D', at(20, 9), at(20, 9, 20))]);
  const r = await applyDelaysToItinerary(i, [update('A', stops, extra)]);
  expect(getItineraryNavigationBlock(r).code).toBe('SERVICE_UNAVAILABLE');
});
test('explicit NO_DATA does not propagate boarding delay to the exit', async () => {
  const r = await applyDelaysToItinerary(itinerary([bus('A', 'O', 'D', at(20, 9), at(20, 9, 20))]), [update('A', [{
    stopId: 'O',
    departure: {
      delay: 300
    }
  }, {
    stopId: 'D',
    scheduleRelationship: 2
  }])]);
  expect(r.legs[0].endTime).toBe(at(20, 9, 20));
});
test('refreshing with stale data restores schedule instead of retaining old live times', async () => {
  const i = itinerary([bus('A', 'O', 'D', at(20, 9), at(20, 9, 20))]);
  const live = await applyDelaysToItinerary(i, [update('A', [{
    stopId: 'O',
    departure: {
      delay: 600
    }
  }])]);
  const r = await applyDelaysToItinerary(live, [update('A', [{
    stopId: 'O',
    departure: {
      delay: 600
    }
  }], {
    timestamp: at(20, 6) / 1000
  })]);
  expect(r.legs[0].startTime).toBe(at(20, 9));
  expect(r.legs[0].isRealtime).toBe(false);
});
test('through-service uses the final trip update for alighting', async () => {
  const ride = {
    ...bus('A', 'O', 'D', at(20, 9), at(20, 9, 20)),
    alightingTripId: 'B',
    alightingServiceDate: '20260920'
  };
  const r = await applyDelaysToItinerary(itinerary([ride]), [update('A', [{
    stopId: 'O',
    departure: {
      delay: 0
    }
  }]), update('B', [{
    stopId: 'D',
    arrival: {
      delay: 600
    }
  }])]);
  expect(r.legs[0].endTime).toBe(at(20, 9, 30));
});

test('rejects an out-of-bounds feed header', async () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const payload = Uint8Array.from([10, 127, 1]);
  fetchWithCORS.mockResolvedValue({ ok: true, arrayBuffer: async () => payload.buffer });
  await expect(fetchTripUpdates()).rejects.toThrow('Invalid GTFS-RT header length');
  errorSpy.mockRestore();
});

// Follow-up review regressions: preview ageing, DST, and endpoint-specific status.
test.each([[2, 8], [10, 1]])('DST service date %s/%s preserves scheduled wall time', async (month, day) => {
  const stops = [{id:'O',latitude:44.389,longitude:-79.7},{id:'D',latitude:44.43,longitude:-79.68}];
  const routingData = buildRoutingData({stops,trips:[{tripId:'dst',routeId:'1',directionId:0,serviceId:'s'}],stopTimes:[
    {tripId:'dst',stopId:'O',stopSequence:1,arrivalTime:35100,departureTime:35100,pickupType:0},
    {tripId:'dst',stopId:'D',stopSequence:2,arrivalTime:36000,departureTime:36000,pickupType:0},
  ],calendar:[],calendarDates:[]});
  const requested = new Date(2026,month,day,9,30);
  const {formatGTFSDate} = require(src('services/calendarService'));
  routingData.serviceCalendar = {[formatGTFSDate(requested)]:new Set(['s'])};
  const result = await planTripLocal({fromLat:44.389,fromLon:-79.7,toLat:44.43,toLon:-79.68,date:requested,time:requested,routingData});
  const ride = result.itineraries[0].legs.find(l=>l.mode==='BUS');
  expect(ride.startTime).toBe(new Date(2026,month,day,9,45).getTime());
  const {isItineraryFeasible} = require(src('utils/itineraryFeasibility'));
  expect(isItineraryFeasible({...result.itineraries[0],requestedTimeMs:requested.getTime()})).toBe(true);
});

test('navigation start refresh blocks a bus that departed while the preview was open', async () => {
  jest.spyOn(require(src('services/arrivalService')), 'fetchTripUpdates').mockResolvedValue([]);
  const {prepareItineraryForNavigation} = require(src('services/navigationRecalculationService'));
  const selected = itinerary([bus('A','O','D',at(20,8,5),at(20,8,25))],{requestedTimeMs:at(20,8)});
  Date.now.mockReturnValue(at(20,8,15));
  // Preview/request checks alone are intentionally not a journey-start check.
  expect(getItineraryNavigationBlock(selected)).toBeNull();
  expect(getItineraryNavigationBlock(await prepareItineraryForNavigation(selected)).code).toBe('MISSED_DEPARTURE');
});

test('navigation start uses fresh delay and checks the remaining access walk', async () => {
  const fetch = jest.spyOn(require(src('services/arrivalService')), 'fetchTripUpdates');
  const {prepareItineraryForNavigation} = require(src('services/navigationRecalculationService'));
  const walk = {mode:'WALK',startTime:at(20,7,55),endTime:at(20,8,5),duration:600,legGeometry:{points:'ready'},steps:[{instruction:'Walk'}]};
  const selected = itinerary([walk,bus('A','O','D',at(20,8,5),at(20,8,25))]);
  Date.now.mockReturnValue(at(20,8,15));
  fetch.mockResolvedValue([update('A',[{stopId:'O',departure:{delay:1800}}])]);
  expect(getItineraryNavigationBlock(await prepareItineraryForNavigation(selected))).toBeNull();
  fetch.mockResolvedValue([update('A',[{stopId:'O',departure:{delay:900}}])]);
  expect(getItineraryNavigationBlock(await prepareItineraryForNavigation(selected)).code).toBe('CANNOT_REACH_DEPARTURE');
});

test('failed navigation refresh discards the old live prediction', async () => {
  const selected = await applyDelaysToItinerary(itinerary([bus('A','O','D',at(20,8,5),at(20,8,25))]),[update('A',[{stopId:'O',departure:{delay:1800}}])]);
  jest.spyOn(require(src('services/arrivalService')), 'fetchTripUpdates').mockRejectedValue(new Error('offline'));
  Date.now.mockReturnValue(at(20,8,15));
  const {prepareItineraryForNavigation} = require(src('services/navigationRecalculationService'));
  const prepared = await prepareItineraryForNavigation(selected);
  expect(prepared.legs[0].isRealtime).toBe(false);
  expect(getItineraryNavigationBlock(prepared).code).toBe('MISSED_DEPARTURE');
});

test('arrival-only prediction labels the arrival rather than claiming on-time departure', async () => {
  const r = await applyDelaysToItinerary(itinerary([bus('A','O','D',at(20,9),at(20,9,20))]),[update('A',[{stopId:'D',arrival:{delay:900}}])]);
  const {getItineraryDelayBadgeProps} = require(src('utils/tripDelayBadge'));
  expect(r.legs[0].boardingRealtime).toBe(false);
  expect(getItineraryDelayBadgeProps(r)).toEqual({isRealtime:true,delaySeconds:900,label:'Arrival'});
  const scheduled = await applyDelaysToItinerary(r, []);
  expect(getItineraryDelayBadgeProps(scheduled).isRealtime).toBe(false);
});

test('on-time departure does not conceal a late arrival', async () => {
  const r = await applyDelaysToItinerary(itinerary([bus('A','O','D',at(20,9),at(20,9,20))]),[update('A',[
    {stopId:'O',departure:{delay:0}}, {stopId:'D',arrival:{delay:900}},
  ])]);
  const {getItineraryDelayBadgeProps} = require(src('utils/tripDelayBadge'));
  expect(getItineraryDelayBadgeProps(r)).toEqual({isRealtime:true,delaySeconds:900,label:'Arrival'});
});

test('start checks leave walking and flexible on-demand journeys usable', () => {
  const {getItineraryBoardingIssue} = require(src('utils/itineraryFeasibility'));
  const flexible = {mode:'BUS',isOnDemand:true,startTime:at(20,7),duration:600};
  expect(getItineraryBoardingIssue(itinerary([flexible]),at(20,8))).toBeNull();
  expect(getItineraryBoardingIssue({legs:[{mode:'WALK',duration:600}]},at(20,8))).toBeNull();
  expect(getItineraryBoardingIssue(itinerary([flexible,bus('A','O','D',at(20,8,5),at(20,8,25))]),at(20,8)))
    .toBe('CANNOT_REACH_DEPARTURE');
});
