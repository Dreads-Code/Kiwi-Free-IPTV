import { Programme } from "../types";

/**
 * Finds the index of the currently airing programme using binary search.
 * Assumes the programmes array is sorted by start time.
 * @param programmes List of programmes to search
 * @param now Current time (defaults to now)
 * @returns Index of the current programme or -1 if not found
 */
export const findCurrentProgrammeIndex = (
  programmes: Programme[] | undefined,
  now: Date = new Date(),
): number => {
  if (!programmes || programmes.length === 0) return -1;
  const nowMs = now.getTime();

  let left = 0;
  let right = programmes.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const p = programmes[mid];

    // Check if current time falls within this programme's range
    if (nowMs >= p.startMs && nowMs < p.stopMs) {
      return mid;
    }

    if (nowMs < p.startMs) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return -1;
};

/**
 * Finds the currently airing programme for a channel.
 * @param programmes List of programmes to search
 * @param now Current time (defaults to now)
 * @returns The current programme or null if not found
 */
export const findCurrentProgramme = (
  programmes: Programme[] | undefined,
  now: Date = new Date(),
): Programme | null => {
  const index = findCurrentProgrammeIndex(programmes, now);
  return index === -1 ? null : (programmes as Programme[])[index];
};

/**
 * Finds the index of the first programme that ends after the given time using binary search.
 * @param programmes List of programmes
 * @param timeMs Time in milliseconds
 */
export const findFirstVisibleProgrammeIndex = (
  programmes: Programme[],
  timeMs: number,
): number => {
  let left = 0;
  let right = programmes.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (programmes[mid].stopMs > timeMs) {
      result = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  return result;
};

/**
 * Finds the index of the first programme that starts at or after the given time using binary search.
 */
export const findFirstProgrammeStartingAfter = (
  programmes: Programme[],
  timeMs: number,
): number => {
  let left = 0;
  let right = programmes.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (programmes[mid].startMs >= timeMs) {
      result = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  return result;
};
