const { collectMapGeometry } = require('../services/detourBriefMap');
const { enrichEventStopNames } = require('../services/detourEmailMonitor');
const { buildBriefMessage } = require('../services/detourBriefMessage');

const frances = { id: 'internal-272', code: '272', name: 'Frances Street', latitude: 44.38488824, longitude: -79.69991235 };
const eccles = { id: 'internal-270', code: '270', name: 'Eccles Street', latitude: 44.38605848, longitude: -79.69723418 };
const gtfsData = {
  stopsByCode: new Map([[frances.code, frances], [eccles.code, eccles]]),
  stopsById: new Map([[frances.id, frances], [eccles.id, eccles]]),
};

test('resolves code and ID-only skipped stops, deduplicates segments, and aligns map with bullets', () => {
  const event = { routeId: '2A', skippedStopCodes: ['272'], skippedStopIds: ['internal-272'],
    segments: [{ affectedStops: [{ stopCode: '272', detourStopRole: 'skipped' },
      { stopCode: '270', detourStopRole: 'boundary' }] }] };
  const geometry = collectMapGeometry([event], { gtfsData });
  expect(geometry.skippedStops).toEqual([{ latitude: frances.latitude, longitude: frances.longitude, code: '272', name: frances.name }]);
  expect(geometry.servedStops).toEqual([{ latitude: eccles.latitude, longitude: eccles.longitude, code: '270', name: eccles.name }]);
  expect(geometry.unmappedSkippedStops).toHaveLength(0);
  const message = buildBriefMessage(enrichEventStopNames(event, gtfsData), { geometry, buffer: Buffer.from('map') });
  expect(message.text).toContain('Not served (skipped by this route)\n- Frances Street (#272)');
  expect(message.text).toContain('Served at detour boundaries\n- Eccles Street (#270)');
});

test('an affected stop without a role stays uncertain instead of becoming a closed marker', () => {
  const geometry = collectMapGeometry([{ routeId: '2A', affectedStopCodes: ['272'] }], { gtfsData });
  expect(geometry.skippedStops).toHaveLength(0);
  expect(geometry.uncertainStops[0]).toMatchObject({ code: '272', latitude: frances.latitude });
});

test('missing coordinates are reported and never create a marker at zero', () => {
  const geometry = collectMapGeometry([{ skippedStops: [{ code: 'missing', latitude: null, longitude: null }] }]);
  expect(geometry.skippedStops).toHaveLength(0);
  expect(geometry.points).toHaveLength(0);
  expect(geometry.unmappedSkippedStops).toHaveLength(1);
});

test('coordinate-only legacy skipped stops still render', () => {
  const geometry = collectMapGeometry([{ skippedStops: [{ latitude: 44.38, longitude: -79.69 }] }]);
  expect(geometry.skippedStops).toHaveLength(1);
});

test('withheld stop impacts remain withheld after GTFS enrichment', () => {
  const geometry = collectMapGeometry([{ briefStopImpactsPending: true, skippedStopCodes: ['272'] }], { gtfsData });
  expect(geometry.skippedStops).toHaveLength(0);
  expect(geometry.uncertainStops).toHaveLength(0);
});

test('shared routes produce one stop marker using the same skipped priority as the bullet list', () => {
  const geometry = collectMapGeometry([
    { routeId: '2A', skippedStopCodes: ['272'] },
    { routeId: '8A', affectedStops: [{ stopCode: '272', detourStopRole: 'boundary' }] },
  ], { gtfsData });
  expect(geometry.skippedStops).toHaveLength(1);
  expect(geometry.servedStops).toHaveLength(0);
});
