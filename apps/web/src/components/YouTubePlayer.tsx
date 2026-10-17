import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/** The subset of the YouTube IFrame Player API used here. */
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  mute(): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (element: HTMLElement, options: {
    videoId: string;
    host?: string;
    playerVars?: Record<string, string | number>;
    events?: { onReady?: () => void; onError?: (event: { data: number }) => void };
  }) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads https://www.youtube.com/iframe_api once for the whole page. */
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT) resolve(window.YT);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => { apiPromise = null; reject(new Error('YouTube player could not load')); };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

export interface YouTubePlayerHandle {
  play(): void;
  pause(): void;
  /** Seconds from the start of the video, not of the clip. */
  seek(seconds: number): void;
  currentTime(): number | null;
}

interface Props {
  videoId: string;
  title: string;
  /** Clip window inside the video, in seconds. */
  start?: number;
  end?: number;
  autoplay?: boolean;
  muted?: boolean;
  /** Hide YouTube's own controls when the page drives playback. */
  controls?: boolean;
  className?: string;
  onReady?: () => void;
}

const ERRORS: Record<number, string> = {
  2: 'This YouTube link is not valid.',
  5: 'This video cannot play in the embedded player.',
  100: 'This video was removed or is private.',
  101: 'The owner does not allow this video to be embedded.',
  150: 'The owner does not allow this video to be embedded.',
};

/** Privacy-enhanced YouTube embed that the page can play, pause, and seek. */
export const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(function YouTubePlayer(
  { videoId, title, start, end, autoplay = false, muted = false, controls = true, className, onReady }, ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const ready = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    play: () => { if (ready.current) player.current?.playVideo(); },
    pause: () => { if (ready.current) player.current?.pauseVideo(); },
    seek: (seconds) => { if (ready.current) player.current?.seekTo(seconds, true); },
    currentTime: () => (ready.current ? player.current?.getCurrentTime() ?? null : null),
  }), []);

  useEffect(() => {
    let disposed = false;
    setError(null);
    ready.current = false;
    loadYouTubeApi().then((YT) => {
      if (disposed || !host.current) return;
      const mount = document.createElement('div');
      host.current.replaceChildren(mount);
      player.current = new YT.Player(mount, {
        videoId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: autoplay ? 1 : 0, mute: muted ? 1 : 0, controls: controls ? 1 : 0,
          rel: 0, playsinline: 1, modestbranding: 1, origin: window.location.origin,
          ...(start !== undefined ? { start: Math.floor(start) } : {}),
          ...(end !== undefined ? { end: Math.ceil(end) } : {}),
        },
        events: {
          onReady: () => {
            if (disposed) return;
            ready.current = true;
            if (muted) player.current?.mute();
            onReadyRef.current?.();
          },
          onError: (event) => { if (!disposed) setError(ERRORS[event.data] ?? 'This video cannot be played here.'); },
        },
      });
    }).catch((cause: unknown) => {
      if (!disposed) setError(cause instanceof Error ? cause.message : 'YouTube player could not load');
    });
    return () => {
      disposed = true;
      ready.current = false;
      player.current?.destroy();
      player.current = null;
    };
  }, [videoId, start, end, autoplay, muted, controls]);

  return (
    <div className={`yt-player ${className ?? ''}`} role="region" aria-label={`YouTube player: ${title}`}>
      <div ref={host} className="yt-player-frame" />
      {error && (
        <p className="yt-player-error" role="alert">
          {error} <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">Open on YouTube</a>
        </p>
      )}
    </div>
  );
});
