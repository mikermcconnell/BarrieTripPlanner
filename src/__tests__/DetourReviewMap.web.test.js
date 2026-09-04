import React from 'react';
import { act, create } from 'react-test-renderer';

const mockFitToCoordinates = jest.fn();

jest.mock('react-native', () => ({
  StyleSheet: { create: (styles) => styles },
  View: 'View',
}));

jest.mock('../components/WebMapView', () => {
  const ReactActual = require('react');
  return ReactActual.forwardRef((props, ref) => {
    ReactActual.useImperativeHandle(ref, () => ({ fitToCoordinates: mockFitToCoordinates }));
    return ReactActual.createElement('WebMapView', props, props.children);
  });
});

jest.mock('../components/DetourOverlay', () => 'DetourOverlay');

const DetourReviewMap = require('../components/DetourReviewMap.web').default;

const reviewCase = {
  caseId: 'review-case-1',
  routeId: '8A',
  snapshot: {
    skippedSegmentPolyline: [
      { latitude: 44.39, longitude: -79.69 },
      { latitude: 44.4, longitude: -79.68 },
    ],
  },
};

describe('DetourReviewMap web camera ownership', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockFitToCoordinates.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('fits a review case only once even if its background geometry changes', () => {
    let renderer;
    act(() => {
      renderer = create(<DetourReviewMap reviewCase={reviewCase} />);
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    act(() => {
      renderer.update(<DetourReviewMap reviewCase={{
        ...reviewCase,
        snapshot: {
          ...reviewCase.snapshot,
          skippedSegmentPolyline: [
            ...reviewCase.snapshot.skippedSegmentPolyline,
            { latitude: 44.41, longitude: -79.67 },
          ],
        },
      }} />);
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(mockFitToCoordinates).toHaveBeenCalledTimes(1);
  });

  test('does not fit after the rider interacts before the delayed focus', () => {
    let renderer;
    act(() => {
      renderer = create(<DetourReviewMap reviewCase={reviewCase} />);
    });
    act(() => {
      renderer.root.findByType('WebMapView').props.onUserInteraction();
      jest.advanceTimersByTime(200);
    });

    expect(mockFitToCoordinates).not.toHaveBeenCalled();
  });

  test('allows one fit for another explicitly selected review case', () => {
    let renderer;
    act(() => {
      renderer = create(<DetourReviewMap reviewCase={reviewCase} />);
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    act(() => {
      renderer.update(<DetourReviewMap reviewCase={{
        ...reviewCase,
        caseId: 'review-case-2',
      }} />);
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(mockFitToCoordinates).toHaveBeenCalledTimes(2);
  });
});
