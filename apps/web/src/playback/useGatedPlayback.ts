import { useCallback, useEffect, useRef, useState } from 'react';

import { gateStopTime, nextRangeAfter, rangeAt, resumeTimeAfter, type Range } from './gate';

export type PlaybackState = 'idle' | 'playing' | 'gated' | 'ended';

interface Options {
  durationSec: number;
  flaggedRanges: readonly Range[];
  /** Playback is simulated, so the corpus needs no real media files. */
  tickMs?: number;
}

/**
 * Drives synthetic playback and stops before any flagged range is reached.
 *
 * The gate is evaluated against the look-ahead window, so it engages while the
 * flagged frames are still only in the buffer.
 *
 * Time is held in integer milliseconds. Accumulating fractional seconds drifts
 * -- 0.1 added 290 times is not 29 -- and a drifting clock would make the stop
 * point non-deterministic.
 */
export function useGatedPlayback({ durationSec, flaggedRanges, tickMs = 100 }: Options) {
  const [currentTime, setCurrentTime] = useState(0);
  const [state, setState] = useState<PlaybackState>('idle');
  const [gatedAt, setGatedAt] = useState<number | null>(null);

  const elapsedMs = useRef(0);
  // Consent is per range, not per asset: revealing one section must not open the rest.
  const revealedRef = useRef<Set<number>>(new Set());
  const clear = useRef<() => void>(() => {});

  const seek = useCallback((seconds: number) => {
    elapsedMs.current = Math.round(seconds * 1000);
    setCurrentTime(elapsedMs.current / 1000);
  }, []);

  const stop = useCallback(() => {
    clear.current();
    clear.current = () => {};
  }, []);

  useEffect(() => stop, [stop]);

  const play = useCallback(() => {
    if (state === 'playing') return;
    setState('playing');

    const id = window.setInterval(() => {
      elapsedMs.current += tickMs;
      const next = elapsedMs.current / 1000;

      if (next >= durationSec) {
        window.clearInterval(id);
        seek(durationSec);
        setState('ended');
        return;
      }

      const upcoming = nextRangeAfter(flaggedRanges, next);
      if (upcoming && !revealedRef.current.has(upcoming.startSec)) {
        const stopAt = gateStopTime(flaggedRanges, next);
        if (stopAt !== null && next >= stopAt) {
          window.clearInterval(id);
          seek(stopAt);
          setGatedAt(stopAt);
          setState('gated');
          return;
        }
      }
      setCurrentTime(next);
    }, tickMs);

    clear.current = () => window.clearInterval(id);
  }, [durationSec, flaggedRanges, seek, state, tickMs]);

  const pause = useCallback(() => {
    stop();
    setState('idle');
  }, [stop]);

  /** Reveal the held section. Applies to that range only. */
  const reveal = useCallback(() => {
    const held = nextRangeAfter(flaggedRanges, elapsedMs.current / 1000);
    if (held) revealedRef.current.add(held.startSec);
    setGatedAt(null);
    setState('idle');
  }, [flaggedRanges]);

  /** Skip past the held section and keep the rest of the asset. */
  const skip = useCallback(() => {
    seek(resumeTimeAfter(flaggedRanges, elapsedMs.current / 1000));
    setGatedAt(null);
    setState('idle');
  }, [flaggedRanges, seek]);

  const reset = useCallback(() => {
    stop();
    revealedRef.current = new Set();
    seek(0);
    setGatedAt(null);
    setState('idle');
  }, [seek, stop]);

  return {
    currentTime,
    state,
    gatedAt,
    isInsideFlagged: rangeAt(flaggedRanges, currentTime) !== null,
    progress: durationSec > 0 ? Math.min(1, currentTime / durationSec) : 0,
    play,
    pause,
    reveal,
    skip,
    reset,
  };
}
