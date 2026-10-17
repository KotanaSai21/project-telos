import { describe, expect, it } from 'vitest';

import {
  ACTION_ORDER,
  INTENSITY_ORDER,
  actionRank,
  exceedsThreshold,
  intensityRank,
  leastRestrictive,
  mostRestrictive,
} from '../src/scales.js';

describe('intensity scale', () => {
  it('ranks in ascending order', () => {
    const ranks = INTENSITY_ORDER.map(intensityRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('admits content at the threshold', () => {
    expect(exceedsThreshold('suggestive', 'suggestive')).toBe(false);
  });

  it('admits content below the threshold', () => {
    expect(exceedsThreshold('mild', 'strong')).toBe(false);
  });

  it('flags content above the threshold', () => {
    expect(exceedsThreshold('explicit', 'suggestive')).toBe(true);
  });

  it('treats a none threshold as admitting only none', () => {
    expect(exceedsThreshold('none', 'none')).toBe(false);
    expect(exceedsThreshold('mild', 'none')).toBe(true);
  });
});

describe('action scale', () => {
  it('ranks allow as least restrictive and quarantine as most', () => {
    expect(actionRank('allow')).toBe(0);
    expect(actionRank('quarantine')).toBe(ACTION_ORDER.length - 1);
  });

  it('picks the least restrictive candidate', () => {
    expect(leastRestrictive(['hold', 'soften', 'quarantine'])).toBe('soften');
  });

  it('picks the most restrictive candidate', () => {
    expect(mostRestrictive(['soften', 'hold', 'summarize'])).toBe('hold');
  });

  it('defaults to allow when there is nothing to restrict', () => {
    expect(leastRestrictive([])).toBe('allow');
    expect(mostRestrictive([])).toBe('allow');
  });

  it('does not mutate the input', () => {
    const input: Array<'hold' | 'soften'> = ['hold', 'soften'];
    leastRestrictive(input);
    expect(input).toEqual(['hold', 'soften']);
  });
});
