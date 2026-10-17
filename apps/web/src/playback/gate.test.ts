import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOOKAHEAD_SEC,
  flaggedCoverage,
  flaggedDuration,
  formatTimecode,
  gateStopTime,
  isApproaching,
  nextRangeAfter,
  normaliseRanges,
  rangeAt,
  resumeTimeAfter,
} from './gate';

/** The flagship clip: cooking, explicit from 0:14 to 0:21, cooking again. */
const COOKING_SWITCH = [{ startSec: 14, endSec: 21 }];

describe('normaliseRanges', () => {
  it('sorts by start time', () => {
    const result = normaliseRanges([
      { startSec: 20, endSec: 25 },
      { startSec: 5, endSec: 8 },
    ]);
    expect(result[0]!.startSec).toBe(5);
  });

  it('merges overlapping ranges', () => {
    expect(
      normaliseRanges([
        { startSec: 10, endSec: 20 },
        { startSec: 15, endSec: 25 },
      ]),
    ).toEqual([{ startSec: 10, endSec: 25 }]);
  });

  it('merges adjacent ranges', () => {
    expect(
      normaliseRanges([
        { startSec: 10, endSec: 20 },
        { startSec: 20, endSec: 30 },
      ]),
    ).toEqual([{ startSec: 10, endSec: 30 }]);
  });

  it('drops zero-length and inverted ranges', () => {
    expect(
      normaliseRanges([
        { startSec: 10, endSec: 10 },
        { startSec: 30, endSec: 20 },
      ]),
    ).toEqual([]);
  });

  it('does not mutate the input', () => {
    const input = [{ startSec: 10, endSec: 20 }];
    normaliseRanges([...input, { startSec: 15, endSec: 25 }]);
    expect(input).toEqual([{ startSec: 10, endSec: 20 }]);
  });
});

describe('rangeAt', () => {
  it('finds the containing range', () => {
    expect(rangeAt(COOKING_SWITCH, 16)).toEqual({ startSec: 14, endSec: 21 });
  });

  it('includes the start instant', () => {
    expect(rangeAt(COOKING_SWITCH, 14)).not.toBeNull();
  });

  it('excludes the end instant, so playback can resume there', () => {
    expect(rangeAt(COOKING_SWITCH, 21)).toBeNull();
  });

  it('returns null outside any range', () => {
    expect(rangeAt(COOKING_SWITCH, 5)).toBeNull();
  });
});

describe('isApproaching', () => {
  it('fires while the flagged range is still in the buffer', () => {
    expect(isApproaching(COOKING_SWITCH, 10)).toBe(true);
  });

  it('stays quiet when the range is beyond the buffer', () => {
    expect(isApproaching(COOKING_SWITCH, 2)).toBe(false);
  });

  it('respects a custom look-ahead window', () => {
    expect(isApproaching(COOKING_SWITCH, 2, 15)).toBe(true);
  });

  it('is false when nothing is flagged', () => {
    expect(isApproaching([], 10)).toBe(false);
  });
});

describe('gateStopTime', () => {
  it('stops at 0:13 for the 0:14 switch', () => {
    expect(gateStopTime(COOKING_SWITCH, 10)).toBe(13);
  });

  it('never returns a time inside a flagged range', () => {
    // The property the whole gate depends on.
    for (let now = 0; now <= 13; now += 0.25) {
      const stop = gateStopTime(COOKING_SWITCH, now);
      if (stop !== null) {
        expect(rangeAt(COOKING_SWITCH, stop)).toBeNull();
      }
    }
  });

  it('never returns a time before the playhead', () => {
    for (let now = 0; now <= 13; now += 0.25) {
      const stop = gateStopTime(COOKING_SWITCH, now);
      if (stop !== null) {
        expect(stop).toBeGreaterThanOrEqual(now);
      }
    }
  });

  it('returns null when nothing is approaching', () => {
    expect(gateStopTime(COOKING_SWITCH, 2)).toBeNull();
  });

  it('returns null once the range is behind us', () => {
    expect(gateStopTime(COOKING_SWITCH, 25)).toBeNull();
  });

  it('clamps to zero for a range at the very start', () => {
    expect(gateStopTime([{ startSec: 0.5, endSec: 3 }], 0)).toBe(0);
  });

  it('handles a late arrival without rewinding', () => {
    expect(gateStopTime(COOKING_SWITCH, 13.5)).toBe(13.5);
  });
});

describe('resumeTimeAfter', () => {
  it('resumes at the end of the flagged range', () => {
    expect(resumeTimeAfter(COOKING_SWITCH, 13)).toBe(21);
  });

  it('resumes from inside a range', () => {
    expect(resumeTimeAfter(COOKING_SWITCH, 16)).toBe(21);
  });

  it('leaves the time alone when nothing is flagged ahead', () => {
    expect(resumeTimeAfter(COOKING_SWITCH, 30)).toBe(30);
  });
});

describe('coverage', () => {
  it('sums flagged seconds', () => {
    expect(flaggedDuration(COOKING_SWITCH)).toBe(7);
  });

  it('computes the share of the asset', () => {
    expect(flaggedCoverage(COOKING_SWITCH, 47)).toBeCloseTo(0.149, 2);
  });

  it('treats a zero-length asset with flags as fully covered', () => {
    expect(flaggedCoverage([{ startSec: 0, endSec: 0.1 }], 0)).toBe(1);
  });

  it('is zero when nothing is flagged', () => {
    expect(flaggedCoverage([], 47)).toBe(0);
  });
});

describe('nextRangeAfter', () => {
  it('finds the upcoming range', () => {
    expect(nextRangeAfter(COOKING_SWITCH, 0)).toEqual({ startSec: 14, endSec: 21 });
  });

  it('returns null when all ranges are behind', () => {
    expect(nextRangeAfter(COOKING_SWITCH, 22)).toBeNull();
  });
});

describe('formatTimecode', () => {
  it.each([
    [0, '0:00'],
    [7, '0:07'],
    [14, '0:14'],
    [61, '1:01'],
    [600, '10:00'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatTimecode(input)).toBe(expected);
  });

  it('clamps negatives to zero', () => {
    expect(formatTimecode(-5)).toBe('0:00');
  });
});

describe('default look-ahead', () => {
  it('is long enough to gate the flagship clip before onset', () => {
    expect(gateStopTime(COOKING_SWITCH, 14 - DEFAULT_LOOKAHEAD_SEC)).not.toBeNull();
  });
});
