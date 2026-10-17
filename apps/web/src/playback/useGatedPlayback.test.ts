import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGatedPlayback } from './useGatedPlayback';

/** Two flagged sections, so consent can be checked per range rather than per asset. */
const TWO_RANGES = [
  { startSec: 10, endSec: 15 },
  { startSec: 30, endSec: 35 },
];

function playFor(seconds: number) {
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

describe('useGatedPlayback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gates before the first flagged range', () => {
    const { result } = renderHook(() =>
      useGatedPlayback({ durationSec: 60, flaggedRanges: TWO_RANGES }),
    );

    act(() => result.current.play());
    playFor(15);

    expect(result.current.state).toBe('gated');
    expect(result.current.gatedAt).toBe(9);
  });

  it('never stops inside a flagged range', () => {
    const { result } = renderHook(() =>
      useGatedPlayback({ durationSec: 60, flaggedRanges: TWO_RANGES }),
    );

    act(() => result.current.play());
    playFor(15);

    expect(result.current.isInsideFlagged).toBe(false);
  });

  describe('consent is scoped to one range', () => {
    it('gates again at the second range after revealing the first', () => {
      const { result } = renderHook(() =>
        useGatedPlayback({ durationSec: 60, flaggedRanges: TWO_RANGES }),
      );

      act(() => result.current.play());
      playFor(15);
      expect(result.current.gatedAt).toBe(9);

      act(() => result.current.reveal());
      act(() => result.current.play());
      playFor(40);

      // Revealing 0:10 must not open 0:30.
      expect(result.current.state).toBe('gated');
      expect(result.current.gatedAt).toBe(29);
    });

    it('does not re-gate the range that was revealed', () => {
      const { result } = renderHook(() =>
        useGatedPlayback({ durationSec: 60, flaggedRanges: TWO_RANGES }),
      );

      act(() => result.current.play());
      playFor(15);
      act(() => result.current.reveal());
      act(() => result.current.play());
      playFor(5);

      expect(result.current.currentTime).toBeGreaterThan(10);
    });
  });

  describe('skip', () => {
    it('resumes after the flagged section', () => {
      const { result } = renderHook(() =>
        useGatedPlayback({ durationSec: 60, flaggedRanges: TWO_RANGES }),
      );

      act(() => result.current.play());
      playFor(15);
      act(() => result.current.skip());

      expect(result.current.currentTime).toBe(15);
    });

    it('still gates the next range after a skip', () => {
      const { result } = renderHook(() =>
        useGatedPlayback({ durationSec: 60, flaggedRanges: TWO_RANGES }),
      );

      act(() => result.current.play());
      playFor(15);
      act(() => result.current.skip());
      act(() => result.current.play());
      playFor(20);

      expect(result.current.state).toBe('gated');
      expect(result.current.gatedAt).toBe(29);
    });
  });

  describe('reset', () => {
    it('clears prior consent', () => {
      const { result } = renderHook(() =>
        useGatedPlayback({ durationSec: 60, flaggedRanges: TWO_RANGES }),
      );

      act(() => result.current.play());
      playFor(15);
      act(() => result.current.reveal());
      act(() => result.current.reset());

      expect(result.current.currentTime).toBe(0);

      act(() => result.current.play());
      playFor(15);
      expect(result.current.state).toBe('gated');
    });
  });

  it('plays an unflagged asset to the end', () => {
    const { result } = renderHook(() =>
      useGatedPlayback({ durationSec: 5, flaggedRanges: [] }),
    );

    act(() => result.current.play());
    playFor(6);

    expect(result.current.state).toBe('ended');
    expect(result.current.currentTime).toBe(5);
  });

  it('pauses without losing position', () => {
    const { result } = renderHook(() =>
      useGatedPlayback({ durationSec: 60, flaggedRanges: [] }),
    );

    act(() => result.current.play());
    playFor(3);
    act(() => result.current.pause());
    const paused = result.current.currentTime;
    playFor(3);

    expect(result.current.currentTime).toBe(paused);
  });
});
