const {
  placeDetourLabels,
} = require('../utils/detourLabelPlacement');

const makeLabel = (overrides) => ({
  id: overrides.id,
  kind: overrides.kind || 'entry',
  point: overrides.point || { latitude: 44.389, longitude: -79.69 },
  label: overrides.label || 'DETOUR PATH',
  priority: overrides.priority ?? 40,
  width: overrides.width ?? 104,
  height: overrides.height ?? 32,
  lockToAnchor: overrides.lockToAnchor,
});

describe('detourLabelPlacement', () => {
  test('moves lower-priority labels away from a higher-priority detour badge', () => {
    const labels = placeDetourLabels([
      makeLabel({ id: 'detour', kind: 'detour', label: '11 DETOUR', priority: 100, width: 96, height: 28 }),
      makeLabel({ id: 'exit', kind: 'exit', label: 'ROUTE RESUMES', priority: 70, width: 104, height: 32 }),
    ], { zoom: 16 });

    const detour = labels.find((label) => label.id === 'detour');
    const exit = labels.find((label) => label.id === 'exit');

    expect(detour.visible).toBe(true);
    expect(exit.visible).toBe(true);
    expect(exit.offset).not.toEqual(detour.offset);
    expect(exit.box).toEqual(expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) }));
    expect(boxesOverlap(detour.box, exit.box)).toBe(false);
  });

  test('hides least-important labels when nearby anchors leave no clean placement', () => {
    const labels = placeDetourLabels([
      makeLabel({ id: 'detour', kind: 'detour', priority: 100, width: 136, height: 28 }),
      makeLabel({ id: 'closed', kind: 'closed', priority: 80, width: 136, height: 32 }),
      makeLabel({ id: 'exit', kind: 'exit', priority: 70, width: 136, height: 32 }),
      makeLabel({ id: 'entry', kind: 'entry', priority: 20, width: 220, height: 160 }),
    ], { zoom: 13 });

    expect(labels.find((label) => label.id === 'detour').visible).toBe(true);
    expect(labels.find((label) => label.id === 'entry').visible).toBe(false);
  });

  test('keeps distant labels at their preferred positions', () => {
    const labels = placeDetourLabels([
      makeLabel({ id: 'detour', kind: 'detour', priority: 100, point: { latitude: 44.389, longitude: -79.69 } }),
      makeLabel({ id: 'closed', kind: 'closed', priority: 80, point: { latitude: 44.399, longitude: -79.68 } }),
    ], { zoom: 16 });

    expect(labels.every((label) => label.visible)).toBe(true);
    expect(labels.find((label) => label.id === 'detour').offset).toEqual([0, 0]);
    expect(labels.find((label) => label.id === 'closed').offset).toEqual([0, 0]);
  });

  test('keeps entry and exit labels over their anchors when there is room', () => {
    const labels = placeDetourLabels([
      makeLabel({ id: 'entry', kind: 'entry', priority: 70, point: { latitude: 44.389, longitude: -79.69 } }),
      makeLabel({ id: 'exit', kind: 'exit', priority: 60, point: { latitude: 44.399, longitude: -79.68 } }),
    ], { zoom: 16 });

    expect(labels.every((label) => label.visible)).toBe(true);
    expect(labels.find((label) => label.id === 'entry').offset).toEqual([0, 0]);
    expect(labels.find((label) => label.id === 'exit').offset).toEqual([0, 0]);
  });

  test('can lock line labels directly over their route lines', () => {
    const labels = placeDetourLabels([
      makeLabel({ id: 'detour', kind: 'detour', lockToAnchor: true, priority: 100 }),
      makeLabel({ id: 'closed', kind: 'closed', lockToAnchor: true, priority: 80 }),
    ], { zoom: 16 });

    expect(labels.find((label) => label.id === 'detour')).toEqual(expect.objectContaining({
      visible: true,
      offset: [0, 0],
    }));
    expect(labels.find((label) => label.id === 'closed')).toEqual(expect.objectContaining({
      visible: true,
      offset: [0, 0],
    }));
  });
});

const boxesOverlap = (a, b) => !(
  a.right <= b.left ||
  a.left >= b.right ||
  a.bottom <= b.top ||
  a.top >= b.bottom
);
