import { useEffect, useState } from 'react';

const toTimestamp = (value) => {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.getTime();
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const getGpsRefreshCountdownDisplay = (nextRefreshAt, now = Date.now()) => {
  const nextRefreshTimestamp = toTimestamp(nextRefreshAt);
  if (nextRefreshTimestamp == null) return null;

  const seconds = Math.max(0, Math.ceil((nextRefreshTimestamp - now) / 1000));
  return {
    seconds,
    label: seconds > 0 ? `GPS ${seconds}s` : 'GPS NOW',
    accessibilityLabel: seconds > 0
      ? `Next GPS refresh in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
      : 'Refreshing GPS bus locations now',
  };
};

export const getGpsRefreshCountdownTickDelay = (nextRefreshAt, now = Date.now()) => {
  const nextRefreshTimestamp = toTimestamp(nextRefreshAt);
  if (nextRefreshTimestamp == null) return null;

  const remainingMs = nextRefreshTimestamp - now;
  if (remainingMs <= 0) return null;

  const seconds = Math.ceil(remainingMs / 1000);
  const delayUntilNextSecond = remainingMs - Math.max(0, seconds - 1) * 1000;
  return Math.max(16, Math.min(1000, Math.ceil(delayUntilNextSecond)));
};

export const useGpsRefreshCountdown = (nextRefreshAt) => {
  const nextRefreshTimestamp = toTimestamp(nextRefreshAt);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (nextRefreshTimestamp == null) return undefined;

    const delay = getGpsRefreshCountdownTickDelay(nextRefreshTimestamp);
    if (delay == null) return undefined;

    // Align each update to the next wall-clock second boundary. A delayed
    // callback therefore catches up immediately instead of accumulating drift.
    const timer = setTimeout(() => setTick((value) => value + 1), delay);
    return () => clearTimeout(timer);
  }, [nextRefreshTimestamp, tick]);

  // Read the clock during every render so a new refresh deadline never renders
  // once with the previous cycle's stale clock value (the former 16s flash).
  return getGpsRefreshCountdownDisplay(nextRefreshTimestamp, Date.now());
};
