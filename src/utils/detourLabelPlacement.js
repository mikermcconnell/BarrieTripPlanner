const TILE_SIZE = 256;
const DEFAULT_ZOOM = 14;
const LABEL_GAP = 8;

const KIND_OFFSETS = {
  detour: [
    [0, 0],
    [0, -38],
    [0, 38],
    [78, 0],
    [-78, 0],
    [78, -38],
    [-78, -38],
  ],
  closed: [
    [0, 0],
    [0, -56],
    [0, 56],
    [-92, -48],
    [92, -48],
    [-92, 48],
    [92, 48],
  ],
  exit: [
    [0, 0],
    [76, -42],
    [-76, -42],
    [0, -50],
    [76, 42],
    [-76, 42],
    [0, 50],
  ],
  entry: [
    [0, 0],
    [-76, 42],
    [76, 42],
    [0, 50],
    [-76, -42],
    [76, -42],
    [0, -50],
  ],
};

const FALLBACK_OFFSETS = [
  [0, 0],
  [0, -42],
  [0, 42],
  [76, -42],
  [-76, -42],
  [76, 42],
  [-76, 42],
];

const isFinitePoint = (point) => (
  Number.isFinite(Number(point?.latitude)) &&
  Number.isFinite(Number(point?.longitude))
);

const projectPoint = (point, zoom) => {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const latitude = Math.max(Math.min(Number(point.latitude), 85.05112878), -85.05112878);
  const longitude = Number(point.longitude);
  const sinLatitude = Math.sin((latitude * Math.PI) / 180);

  return {
    x: ((longitude + 180) / 360) * scale,
    y: (
      0.5 -
      Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)
    ) * scale,
  };
};

const makeBox = ({ x, y, width, height, gap = LABEL_GAP }) => ({
  left: x - (width / 2) - gap,
  right: x + (width / 2) + gap,
  top: y - (height / 2) - gap,
  bottom: y + (height / 2) + gap,
});

const boxesOverlap = (a, b) => !(
  a.right <= b.left ||
  a.left >= b.right ||
  a.bottom <= b.top ||
  a.top >= b.bottom
);

const getCandidateOffsets = (kind) => KIND_OFFSETS[kind] || FALLBACK_OFFSETS;

const hasCollision = (box, placedBoxes) => placedBoxes.some((placedBox) => boxesOverlap(box, placedBox));

const normalizeLabel = (label) => ({
  ...label,
  priority: Number.isFinite(Number(label.priority)) ? Number(label.priority) : 0,
  width: Number.isFinite(Number(label.width)) ? Number(label.width) : 104,
  height: Number.isFinite(Number(label.height)) ? Number(label.height) : 32,
  lockToAnchor: label.lockToAnchor === true,
});

export const placeDetourLabels = (labels, options = {}) => {
  if (!Array.isArray(labels) || labels.length === 0) {
    return [];
  }

  const zoom = Number.isFinite(Number(options.zoom)) ? Number(options.zoom) : DEFAULT_ZOOM;
  const placedBoxes = [];

  return labels
    .map(normalizeLabel)
    .map((label, sourceIndex) => ({ ...label, sourceIndex }))
    .sort((a, b) => b.priority - a.priority || a.sourceIndex - b.sourceIndex)
    .map((label) => {
      if (!isFinitePoint(label.point)) {
        return {
          ...label,
          visible: false,
          offset: [0, 0],
          box: null,
        };
      }

      const projected = projectPoint(label.point, zoom);
      if (label.lockToAnchor) {
        const box = makeBox({
          x: projected.x,
          y: projected.y,
          width: label.width,
          height: label.height,
        });
        placedBoxes.push(box);
        return {
          ...label,
          visible: true,
          offset: [0, 0],
          box,
        };
      }

      const offsets = getCandidateOffsets(label.kind);
      const placement = offsets
        .map((offset) => {
          const [offsetX, offsetY] = offset;
          return {
            offset,
            box: makeBox({
              x: projected.x + offsetX,
              y: projected.y + offsetY,
              width: label.width,
              height: label.height,
            }),
          };
        })
        .find((candidate) => !hasCollision(candidate.box, placedBoxes));

      if (!placement) {
        return {
          ...label,
          visible: false,
          offset: [0, 0],
          box: null,
        };
      }

      placedBoxes.push(placement.box);
      return {
        ...label,
        visible: true,
        offset: placement.offset,
        box: placement.box,
      };
    })
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
};

export default placeDetourLabels;
