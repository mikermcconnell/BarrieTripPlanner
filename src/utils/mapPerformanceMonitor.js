const DEFAULT_SAMPLE_WINDOW_MS = 15_000;
const SLOW_FRAME_THRESHOLD_MS = 32;

const percentile = (values, ratio) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
};

const roundMetric = (value) => (
  Number.isFinite(value) ? Math.round(value * 10) / 10 : null
);

export const createMapPerformanceMonitor = ({
  now = () => globalThis?.performance?.now?.() || Date.now(),
  sampleWindowMs = DEFAULT_SAMPLE_WINDOW_MS,
  onSample,
} = {}) => {
  let sampleStartedAt = now();
  let frameStartedAt = null;
  let gestureStartedAt = null;
  let frameDurations = [];
  let interactionLatencies = [];

  const getSnapshot = () => ({
    sampleDurationMs: Math.max(0, now() - sampleStartedAt),
    renderedFrames: frameDurations.length,
    slowFrames: frameDurations.filter((duration) => duration > SLOW_FRAME_THRESHOLD_MS).length,
    slowFrameRatio: frameDurations.length > 0
      ? frameDurations.filter((duration) => duration > SLOW_FRAME_THRESHOLD_MS).length / frameDurations.length
      : 0,
    frameP50Ms: roundMetric(percentile(frameDurations, 0.5)),
    frameP90Ms: roundMetric(percentile(frameDurations, 0.9)),
    interactionP90Ms: roundMetric(percentile(interactionLatencies, 0.9)),
    interactionSamples: interactionLatencies.length,
  });

  const reset = () => {
    sampleStartedAt = now();
    frameStartedAt = null;
    gestureStartedAt = null;
    frameDurations = [];
    interactionLatencies = [];
  };

  const flushIfReady = () => {
    if (now() - sampleStartedAt < sampleWindowMs) return null;
    const snapshot = getSnapshot();
    onSample?.(snapshot);
    reset();
    return snapshot;
  };

  return {
    onFrameStart() {
      frameStartedAt = now();
    },
    onFrameEnd() {
      if (frameStartedAt != null) {
        frameDurations.push(Math.max(0, now() - frameStartedAt));
        frameStartedAt = null;
      }
      return flushIfReady();
    },
    onGestureStart() {
      if (gestureStartedAt == null) gestureStartedAt = now();
    },
    onRegionChanging() {
      if (gestureStartedAt != null) {
        interactionLatencies.push(Math.max(0, now() - gestureStartedAt));
        gestureStartedAt = null;
      }
    },
    getSnapshot,
    reset,
  };
};

export const MAP_PERFORMANCE_TARGETS = Object.freeze({
  interactionP90Ms: 50,
  frameP90Ms: 32,
  slowFrameRatio: 0.03,
});

