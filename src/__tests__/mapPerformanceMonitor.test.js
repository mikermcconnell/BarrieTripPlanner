import {
  createMapPerformanceMonitor,
  MAP_PERFORMANCE_TARGETS,
} from '../utils/mapPerformanceMonitor';

describe('map performance monitor', () => {
  test('summarizes frame and interaction responsiveness without React state', () => {
    let timestamp = 0;
    const samples = [];
    const monitor = createMapPerformanceMonitor({
      now: () => timestamp,
      sampleWindowMs: 100,
      onSample: (sample) => samples.push(sample),
    });

    monitor.onGestureStart();
    timestamp = 24;
    monitor.onRegionChanging();

    monitor.onFrameStart();
    timestamp = 40;
    monitor.onFrameEnd();
    monitor.onFrameStart();
    timestamp = 80;
    monitor.onFrameEnd();
    monitor.onFrameStart();
    timestamp = 120;
    const flushed = monitor.onFrameEnd();

    expect(flushed).toEqual(expect.objectContaining({
      renderedFrames: 3,
      slowFrames: 2,
      frameP50Ms: 40,
      frameP90Ms: 40,
      interactionP90Ms: 24,
      interactionSamples: 1,
    }));
    expect(samples).toEqual([flushed]);
  });

  test('publishes the rider-facing performance targets', () => {
    expect(MAP_PERFORMANCE_TARGETS).toEqual({
      interactionP90Ms: 50,
      frameP90Ms: 32,
      slowFrameRatio: 0.03,
    });
  });
});

