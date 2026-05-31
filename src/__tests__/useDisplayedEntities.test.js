import React from 'react';
import { create, act } from 'react-test-renderer';
import { useDisplayedEntities } from '../hooks/useDisplayedEntities';

const makePath = (points) =>
  points.map(([latitude, longitude]) => ({ latitude, longitude }));

const Harness = ({ props, onResult }) => {
  const result = useDisplayedEntities(props);
  onResult(result);
  return null;
};

const baseProps = {
  selectedRouteIds: new Set(),
  vehicles: [],
  routes: [
    { id: '7A', shortName: '7A', color: 'F58220' },
    { id: '7B', shortName: '7B', color: 'F58220' },
  ],
  trips: [],
  shapes: {},
  processedShapes: {},
  routeShapeMapping: {},
  routeStopsMapping: {},
  stops: [],
  showRoutes: true,
  showStops: false,
  mapRegion: {
    latitude: 44.38,
    longitude: -79.69,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  },
};

const renderHookResult = (props) => {
  let latest;
  act(() => {
    create(React.createElement(Harness, {
      props,
      onResult: (value) => {
        latest = value;
      },
    }));
  });
  return latest;
};

describe('useDisplayedEntities', () => {
  test('selected Route 7 branches render one regular shape per branch', () => {
    const shapes = {
      '7a-regular': makePath([
        [44.34, -79.68],
        [44.36, -79.69],
        [44.38, -79.7],
        [44.41, -79.67],
      ]),
      '7a-short-turn': makePath([
        [44.34, -79.68],
        [44.36, -79.69],
      ]),
      '7b-regular': makePath([
        [44.41, -79.67],
        [44.38, -79.7],
        [44.36, -79.69],
        [44.34, -79.68],
      ]),
      '7b-short-turn': makePath([
        [44.41, -79.67],
        [44.39, -79.69],
      ]),
    };

    const result = renderHookResult({
      ...baseProps,
      selectedRouteIds: new Set(['7A', '7B']),
      shapes,
      routeShapeMapping: {
        '7A': ['7a-regular', '7a-short-turn'],
        '7B': ['7b-regular', '7b-short-turn'],
      },
      trips: [
        { routeId: '7A', shapeId: '7a-regular', directionId: 0 },
        { routeId: '7A', shapeId: '7a-short-turn', directionId: 0 },
        { routeId: '7B', shapeId: '7b-regular', directionId: 0 },
        { routeId: '7B', shapeId: '7b-short-turn', directionId: 0 },
      ],
    });

    expect(result.displayedShapes.map((shape) => shape.shapeId).sort()).toEqual([
      '7a-regular',
      '7b-regular',
    ]);
  });
});
