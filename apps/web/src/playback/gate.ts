/**
 * Look-ahead gating.
 *
 * The rule that makes pre-exposure protection possible: decide against the
 * buffer, not the playhead. A player already prefetches several seconds ahead,
 * so the verdict for 0:14 exists while the viewer is still at 0:09.
 *
 * Every function here is pure, so the timing guarantee is unit-testable rather
 * than something you have to watch for on screen.
 */

export interface Range {
  startSec: number;
  endSec: number;
}

/** Seconds of buffer a player is assumed to hold ahead of the playhead. */
export const DEFAULT_LOOKAHEAD_SEC = 5;

/** Ranges sorted by start, with overlaps merged. */
export function normaliseRanges(ranges: readonly Range[]): Range[] {
  const sorted = [...ranges]
    .filter((range) => range.endSec > range.startSec)
    .sort((a, b) => a.startSec - b.startSec);

  const merged: Range[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.startSec <= last.endSec) {
      last.endSec = Math.max(last.endSec, range.endSec);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** The range containing this instant, if any. */
export function rangeAt(ranges: readonly Range[], timeSec: number): Range | null {
  return (
    normaliseRanges(ranges).find(
      (range) => timeSec >= range.startSec && timeSec < range.endSec,
    ) ?? null
  );
}

/** The next range starting at or after the given time. */
export function nextRangeAfter(ranges: readonly Range[], timeSec: number): Range | null {
  return normaliseRanges(ranges).find((range) => range.startSec >= timeSec) ?? null;
}

/**
 * True when a flagged range falls inside the buffer the player already holds.
 * This is what fires *before* the frame is reached.
 */
export function isApproaching(
  ranges: readonly Range[],
  timeSec: number,
  lookaheadSec = DEFAULT_LOOKAHEAD_SEC,
): boolean {
  const next = nextRangeAfter(ranges, timeSec);
  return next !== null && next.startSec - timeSec <= lookaheadSec;
}

/**
 * Where playback must stop so no flagged frame is ever rendered.
 *
 * Returns null when nothing is approaching. Never returns a time inside a
 * flagged range, which is the property the gate depends on.
 */
export function gateStopTime(
  ranges: readonly Range[],
  timeSec: number,
  lookaheadSec = DEFAULT_LOOKAHEAD_SEC,
): number | null {
  const next = nextRangeAfter(ranges, timeSec);
  if (next === null || next.startSec - timeSec > lookaheadSec) return null;
  // One second before onset, and never behind where we already are.
  return Math.max(timeSec, Math.max(0, next.startSec - 1));
}

/** The time to resume at when a viewer skips the flagged section. */
export function resumeTimeAfter(ranges: readonly Range[], timeSec: number): number {
  const containing = rangeAt(ranges, timeSec) ?? nextRangeAfter(ranges, timeSec);
  return containing ? containing.endSec : timeSec;
}

/** Total flagged seconds, used to decide whether skipping is still sensible. */
export function flaggedDuration(ranges: readonly Range[]): number {
  return normaliseRanges(ranges).reduce(
    (total, range) => total + (range.endSec - range.startSec),
    0,
  );
}

/** Share of the asset that is flagged, from 0 to 1. */
export function flaggedCoverage(ranges: readonly Range[], durationSec: number): number {
  if (durationSec <= 0) return ranges.length > 0 ? 1 : 0;
  return Math.min(1, flaggedDuration(ranges) / durationSec);
}

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}
