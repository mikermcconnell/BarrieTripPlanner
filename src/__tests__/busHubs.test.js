const {
  BUS_HUBS,
  BUS_HUB_MAJOR_IDS,
  BUS_HUB_MINOR_IDS,
  BUS_HUB_MINOR_LABEL_MIN_ZOOM,
  buildBusHubFeatureCollection,
  getBusHubDisplayLabel,
  getVisibleBusHubLabels,
} = require('../config/busHubs');

describe('bus hub metadata', () => {
  test('defines approved major and minor bus hubs only', () => {
    expect(BUS_HUB_MAJOR_IDS).toEqual([
      'allandale-terminal',
      'downtown-hub',
      'park-place-terminal',
      'georgian-college',
      'barrie-south-go',
    ]);

    expect(BUS_HUB_MINOR_IDS).toEqual([
      'georgian-mall',
      'rvh',
      'east-bayfield-community-centre',
      'peggy-hill-team-community-centre',
    ]);

    const hubText = BUS_HUBS.map((hub) => `${hub.displayName} ${hub.shortName}`).join('\n');
    expect(hubText).not.toMatch(/Bayfield Mall|Kozlov|Cundles|Mapleview|Bryne|Maple at Ross/i);
  });

  test('each hub has a representative coordinate and related stop codes', () => {
    BUS_HUBS.forEach((hub) => {
      expect(Number.isFinite(hub.coordinate.latitude)).toBe(true);
      expect(Number.isFinite(hub.coordinate.longitude)).toBe(true);
      expect(hub.stopCodes.length).toBeGreaterThan(0);
    });
  });

  test('all hub labels are visible at every zoom', () => {
    const lowZoomLabels = getVisibleBusHubLabels(BUS_HUB_MINOR_LABEL_MIN_ZOOM - 0.25);
    expect(lowZoomLabels.map((hub) => hub.id)).toEqual([
      ...BUS_HUB_MAJOR_IDS,
      ...BUS_HUB_MINOR_IDS,
    ]);

    const highZoomLabels = getVisibleBusHubLabels(BUS_HUB_MINOR_LABEL_MIN_ZOOM);
    expect(highZoomLabels.map((hub) => hub.id)).toEqual([
      ...BUS_HUB_MAJOR_IDS,
      ...BUS_HUB_MINOR_IDS,
    ]);
  });

  test('terminal hub labels omit the word terminal', () => {
    const allandale = BUS_HUBS.find((hub) => hub.id === 'allandale-terminal');
    const parkPlace = BUS_HUBS.find((hub) => hub.id === 'park-place-terminal');

    expect(getBusHubDisplayLabel(allandale, 12)).toBe('Barrie Allandale Hub');
    expect(getBusHubDisplayLabel(parkPlace, 12)).toBe('Park Place');

    const labels = buildBusHubFeatureCollection(12).features.map((feature) => feature.properties.label);
    expect(labels).toContain('Barrie Allandale Hub');
    expect(labels).toContain('Park Place');
    expect(labels.join('\n')).not.toMatch(/\bTerminal\b/i);
  });
});
