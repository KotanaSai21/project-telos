import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';

import { DEMO_CLIPS, type DemoClip } from '../api/samples';
import type { ProjectTelosFixture, ProjectTelosItem } from '../api/types';
import { formatTimecode } from '../playback/gate';
import { useGatedPlayback, type PlaybackState } from '../playback/useGatedPlayback';
import { YouTubePlayer, type YouTubePlayerHandle } from './YouTubePlayer';

const MAX_DRIFT_SEC = 1.5;

/**
 * The simulated playhead stays the source of truth (it decides the hold); the real clip
 * follows it: plays while it plays, pauses when it stops, and is re-seeked if it drifts.
 */
function useClipFollower(
  player: RefObject<YouTubePlayerHandle | null>, clip: DemoClip | undefined,
  state: PlaybackState, currentTime: number,
) {
  const latest = useRef({ state, currentTime });
  latest.current = { state, currentTime };

  const sync = useCallback(() => {
    const handle = player.current;
    if (!clip || !handle) return;
    const target = clip.start + latest.current.currentTime;
    const actual = handle.currentTime();
    if (actual !== null && Math.abs(actual - target) > MAX_DRIFT_SEC) handle.seek(target);
    if (latest.current.state === 'playing') handle.play();
    else handle.pause();
  }, [clip, player]);

  useEffect(sync, [state, sync]);
  // Check for drift every two seconds of playback.
  const tick = Math.floor(currentTime / 2);
  useEffect(() => {
    if (latest.current.state === 'playing') sync();
  }, [tick, sync]);
  return sync;
}

interface Props {
  fixture: ProjectTelosFixture;
  item: ProjectTelosItem;
  busy: boolean;
  active?: boolean;
  onHeld: () => void;
  onReframe: () => void;
}

/** Paired synthetic playheads isolate the intervention from feed selection. */
export function ProjectTelosComparison({ fixture, item, busy, active = true, onHeld, onReframe }: Props) {
  const ranges = useMemo(() => {
    if (item.status === 'allowed') return [];
    return [{ startSec: item.holdAtSec > 0 ? item.holdAtSec + 1 : 0, endSec: fixture.durationSec }];
  }, [fixture.durationSec, item.holdAtSec, item.status === 'allowed']);
  const before = useGatedPlayback({ durationSec: fixture.durationSec, flaggedRanges: [] });
  const after = useGatedPlayback({ durationSec: fixture.durationSec, flaggedRanges: ranges });
  const clip = DEMO_CLIPS[fixture.id];
  const beforePlayer = useRef<YouTubePlayerHandle>(null);
  const afterPlayer = useRef<YouTubePlayerHandle>(null);
  const syncBefore = useClipFollower(beforePlayer, clip, before.state, before.currentTime);
  const syncAfter = useClipFollower(afterPlayer, clip, after.state, after.currentTime);
  const reported = useRef(false);
  const onHeldRef = useRef(onHeld);
  onHeldRef.current = onHeld;
  const held = after.gatedAt !== null || item.status === 'held' || item.status === 'reframed';
  const playback = useRef({ before, after, item, held });
  playback.current = { before, after, item, held };

  useEffect(() => {
    if (!active) return;
    // Delay startup so StrictMode's setup/cleanup replay cannot kill the active timers.
    const timer = window.setTimeout(() => {
      const current = playback.current;
      if (current.before.state !== 'ended') current.before.play();
      if (current.after.state !== 'ended' && (current.item.status === 'allowed' ||
        (current.item.status === 'protected' && current.item.holdAtSec > 0 && !current.held))) {
        current.after.play();
      } else if (current.item.status === 'protected' && current.item.holdAtSec === 0 && !reported.current) {
        reported.current = true;
        onHeldRef.current();
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      playback.current.before.pause();
      playback.current.after.pause();
    };
  }, [active]);

  useEffect(() => {
    if (after.state === 'gated' && !reported.current) {
      reported.current = true;
      onHeldRef.current();
    }
  }, [after.state]);

  const switched = item.bait.evidence.some(
    (row) => before.currentTime >= row.startSec && before.currentTime < row.endSec,
  );
  const waitingAtStart = item.status === 'protected' && item.holdAtSec === 0;
  const showHold = held || waitingAtStart;

  const holdCard = (
    <div role="status">
      <p className="text-sm font-semibold text-amber-200">
        {item.topicMatch?.status === 'off-topic' ? 'Filtered from your feed' : 'Held for your preferences'}
      </p>
      <p data-testid="hold-time" className="mt-2 text-2xl font-semibold">Holding frame at {formatTimecode(item.holdAtSec)}</p>
      <p className="mt-3 text-xs leading-6 text-slate-300">
        {item.topicMatch?.status === 'off-topic'
          ? 'This item is outside the topics you selected.'
          : 'This part does not fit your declared preferences. You can request a clean summary instead.'}
      </p>
      <button type="button" className="project-telos-button mt-4" disabled={busy}
        onClick={item.status === 'protected' ? onHeld : onReframe}>
        {busy ? 'Saving / generating...' : item.status === 'protected' ? 'Retry saving hold' : 'Summarize & Reframe'}
      </button>
    </div>
  );
  const player = (ref: RefObject<YouTubePlayerHandle | null>, onReady: () => void) => clip && (
    <YouTubePlayer ref={ref} videoId={clip.videoId} title={fixture.title} start={clip.start}
      end={clip.start + fixture.durationSec} muted controls={false} onReady={onReady} />
  );

  return (
    <div className="comparison-layout grid gap-5 lg:grid-cols-2">
      <article className="project-telos-panel before-panel">
        <header className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-slate-300">Before / attention feed</h3>
          <span className="project-telos-pill text-amber-300">No interception</span>
        </header>
        <h4 className="mt-5 text-xl font-medium">{fixture.title}</h4>
        <p className="mt-2 text-xs text-slate-400">{fixture.hook}</p>
        <div data-testid="before-scene" data-switched={switched}
          className={`project-telos-scene mt-5 ${clip ? 'has-video' : ''} ${switched ? 'project-telos-scene-switched' : ''}`}>
          {clip ? <>
            {player(beforePlayer, syncBefore)}
            {switched && <div className="scene-overlay is-switch">
              <span className="text-4xl" aria-hidden="true">!</span>
              <p className="mt-3 text-lg">Unrelated incident placeholder</p>
              <p className="mt-2 text-xs text-slate-300">Simulated cut-away · the unfiltered feed keeps playing</p>
            </div>}
          </> : <>
            <span className="text-5xl" aria-hidden="true">{switched ? '!' : '+'}</span>
            <p className="mt-4 text-lg">{switched ? 'Unrelated incident placeholder' : fixture.promiseTopics.join(' / ')}</p>
            <p className="mt-2 text-xs text-slate-300">{switched ? 'Unfiltered synthetic playback' : 'Synthetic scene / autoplay simulation'}</p>
          </>}
        </div>
        {clip && <p className="scene-credit">Footage: {clip.credit} (YouTube, muted)</p>}
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>Unprotected playhead</span>
          <span data-testid="before-time" className="font-mono">{formatTimecode(before.currentTime)}</span>
        </div>
        <div className="mt-3 h-1 rounded bg-slate-800"><div className="h-1 rounded bg-amber-300" style={{ width: `${before.progress * 100}%` }} /></div>
      </article>

      <article className="project-telos-panel project-telos-panel-protected">
        <header className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-teal-200">After / PROJECT TELOS feed</h3>
          <span className="project-telos-pill text-teal-300">
            {item.status === 'reframed' ? 'Reframed'
              : item.topicMatch?.status === 'off-topic' ? 'Filtered from your feed'
              : item.status === 'allowed' ? 'Matches your intent' : showHold ? 'Held' : 'Protected preview'}
          </span>
        </header>
        <h4 className="mt-5 text-xl font-medium">{fixture.title}</h4>
        <p className="mt-2 text-xs text-slate-400">{fixture.hook}</p>
        <div data-testid="project-telos-scene" data-held={showHold}
          className={`project-telos-scene mt-5 ${clip && item.status !== 'reframed' ? 'has-video' : ''}`}>
          {item.status === 'reframed' ? (
            <div className="w-full text-left">
              <img src={item.illustration} alt="Neutral abstract illustration accompanying the summary"
                className="mb-3 h-24 w-full rounded-lg object-cover" />
              <h5 className="text-sm font-semibold text-teal-200">The information, without the ambush.</h5>
              <p className="mt-2 text-sm leading-6 text-slate-200">{item.summary}</p>
              <p className="mt-3 text-[10px] text-slate-400">{item.summaryBy} · {item.illustrationBy}</p>
            </div>
          ) : clip ? <>
            {player(afterPlayer, syncAfter)}
            {showHold && <div className="scene-overlay is-hold">{holdCard}</div>}
          </> : showHold ? holdCard : (
            <div>
              <span className="text-5xl text-teal-300" aria-hidden="true">+</span>
              <p className="mt-4 text-lg">{fixture.promiseTopics.join(' / ')}</p>
              <p className="mt-2 text-xs text-slate-300">Synthetic scene / consent-aware simulation</p>
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>{showHold ? 'Protected playhead / held' : 'Protected playhead'}</span>
          <span data-testid="after-time" className="font-mono">{formatTimecode(showHold ? item.holdAtSec : after.currentTime)}</span>
        </div>
        <div className="mt-3 h-1 rounded bg-slate-800"><div className="h-1 rounded bg-teal-300"
          style={{ width: `${(showHold ? item.holdAtSec / fixture.durationSec : after.progress) * 100}%` }} /></div>
      </article>
    </div>
  );
}
