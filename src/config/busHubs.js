export const BUS_HUB_TYPES = {
  MAJOR: 'major',
  MINOR: 'minor',
};

export const BUS_HUB_MINOR_LABEL_MIN_ZOOM = 14.25;

export const BUS_HUBS = [
  {
    id: 'allandale-terminal',
    type: BUS_HUB_TYPES.MAJOR,
    displayName: 'Barrie Allandale Transit Terminal',
    shortName: 'Barrie Allandale Hub',
    coordinate: { latitude: 44.374049, longitude: -79.689864 },
    stopCodes: ['9003', '9004', '9005', '9006', '9009', '9012', '9013'],
  },
  {
    id: 'downtown-hub',
    type: BUS_HUB_TYPES.MAJOR,
    displayName: 'Downtown Hub',
    shortName: 'Downtown Hub',
    coordinate: { latitude: 44.38767, longitude: -79.690304 },
    stopCodes: ['1', '2', '10', '11'],
  },
  {
    id: 'park-place-terminal',
    type: BUS_HUB_TYPES.MAJOR,
    displayName: 'Park Place Terminal',
    shortName: 'Park Place',
    coordinate: { latitude: 44.3403906345005, longitude: -79.6803262502088 },
    stopCodes: ['777'],
  },
  {
    id: 'georgian-college',
    type: BUS_HUB_TYPES.MAJOR,
    displayName: 'Georgian College',
    shortName: 'Georgian College',
    coordinate: { latitude: 44.411502, longitude: -79.670117 },
    stopCodes: ['327', '328', '329', '330', '331', '335', '110'],
  },
  {
    id: 'barrie-south-go',
    type: BUS_HUB_TYPES.MAJOR,
    displayName: 'Barrie South GO',
    shortName: 'Barrie South GO',
    coordinate: { latitude: 44.35185862, longitude: -79.62838858 },
    stopCodes: ['725'],
  },
  {
    id: 'georgian-mall',
    type: BUS_HUB_TYPES.MINOR,
    displayName: 'Georgian Mall',
    shortName: 'Georgian Mall',
    coordinate: { latitude: 44.41121, longitude: -79.706722 },
    stopCodes: ['440', '441', '76'],
  },
  {
    id: 'rvh',
    type: BUS_HUB_TYPES.MINOR,
    displayName: 'RVH',
    shortName: 'RVH',
    coordinate: { latitude: 44.41442, longitude: -79.663457 },
    stopCodes: ['559', '569'],
  },
  {
    id: 'east-bayfield-community-centre',
    type: BUS_HUB_TYPES.MINOR,
    displayName: 'East Bayfield Community Centre',
    shortName: 'East Bayfield CC',
    coordinate: { latitude: 44.41430522, longitude: -79.70283155 },
    stopCodes: ['447'],
  },
  {
    id: 'peggy-hill-team-community-centre',
    type: BUS_HUB_TYPES.MINOR,
    displayName: 'Peggy Hill Team Community Centre',
    shortName: 'Peggy Hill Team CC',
    coordinate: { latitude: 44.33987811, longitude: -79.71668472 },
    stopCodes: ['488'],
  },
];

export const getBusHubDisplayLabel = (hub, currentZoom) => {
  if (!shouldShowBusHubLabel(hub, currentZoom)) return '';
  const label = hub?.shortName || hub?.displayName;
  return String(label || '').replace(/\s+Terminal\b/gi, '').trim();
};

export const BUS_HUB_MAJOR_IDS = BUS_HUBS
  .filter((hub) => hub.type === BUS_HUB_TYPES.MAJOR)
  .map((hub) => hub.id);

export const BUS_HUB_MINOR_IDS = BUS_HUBS
  .filter((hub) => hub.type === BUS_HUB_TYPES.MINOR)
  .map((hub) => hub.id);

export const shouldShowBusHubLabel = (hub, currentZoom) => {
  return Boolean(hub);
};

export const getVisibleBusHubLabels = (currentZoom) => (
  BUS_HUBS.filter((hub) => shouldShowBusHubLabel(hub, currentZoom))
);

export const buildBusHubFeatureCollection = (currentZoom) => ({
  type: 'FeatureCollection',
  features: BUS_HUBS
    .filter((hub) => (
      Number.isFinite(hub?.coordinate?.latitude) &&
      Number.isFinite(hub?.coordinate?.longitude)
    ))
    .map((hub) => {
      const showLabel = shouldShowBusHubLabel(hub, currentZoom);
      return {
        type: 'Feature',
        id: hub.id,
        properties: {
          id: hub.id,
          hubType: hub.type,
          label: showLabel ? getBusHubDisplayLabel(hub, currentZoom) : '',
          showLabel,
          sortKey: hub.type === BUS_HUB_TYPES.MAJOR ? 0 : 10,
        },
        geometry: {
          type: 'Point',
          coordinates: [hub.coordinate.longitude, hub.coordinate.latitude],
        },
      };
    }),
});
