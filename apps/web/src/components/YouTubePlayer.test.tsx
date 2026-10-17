import { act, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { YouTubePlayer, type YouTubePlayerHandle } from './YouTubePlayer';

type Options = {
  videoId: string; host?: string; playerVars?: Record<string, string | number>;
  events?: { onReady?: () => void; onError?: (event: { data: number }) => void };
};

function installFakeApi() {
  const created: Options[] = [];
  const instance = {
    playVideo: vi.fn(), pauseVideo: vi.fn(), seekTo: vi.fn(), getCurrentTime: vi.fn(() => 12),
    mute: vi.fn(), destroy: vi.fn(),
  };
  window.YT = {
    Player: vi.fn(function Player(_element: HTMLElement, options: Options) {
      created.push(options);
      return instance;
    }) as unknown as NonNullable<typeof window.YT>['Player'],
  };
  return { created, instance };
}

afterEach(() => { delete window.YT; });

describe('YouTubePlayer', () => {
  it('embeds the privacy-enhanced player for the clip and exposes seek and play', async () => {
    const { created, instance } = installFakeApi();
    const ref = createRef<YouTubePlayerHandle>();
    const onReady = vi.fn();
    render(<YouTubePlayer ref={ref} videoId="abcdefghijk" title="Clip" start={15} end={35} muted
      controls={false} onReady={onReady} />);

    await vi.waitFor(() => expect(created).toHaveLength(1));
    const options = created[0]!;
    expect(options.videoId).toBe('abcdefghijk');
    expect(options.host).toBe('https://www.youtube-nocookie.com');
    expect(options.playerVars).toMatchObject({ start: 15, end: 35, mute: 1, controls: 0, rel: 0 });

    // Calls before the player is ready are ignored rather than thrown.
    ref.current?.play();
    expect(instance.playVideo).not.toHaveBeenCalled();
    act(() => options.events?.onReady?.());
    expect(onReady).toHaveBeenCalledOnce();
    expect(instance.mute).toHaveBeenCalled();

    ref.current?.seek(42);
    ref.current?.play();
    expect(instance.seekTo).toHaveBeenCalledWith(42, true);
    expect(instance.playVideo).toHaveBeenCalledOnce();
    expect(ref.current?.currentTime()).toBe(12);
  });

  it('explains when the owner blocks embedding and links to YouTube', async () => {
    const { created } = installFakeApi();
    render(<YouTubePlayer videoId="abcdefghijk" title="Clip" />);
    await vi.waitFor(() => expect(created).toHaveLength(1));
    act(() => created[0]!.events?.onError?.({ data: 150 }));
    expect(screen.getByRole('alert')).toHaveTextContent('does not allow this video to be embedded');
    expect(screen.getByRole('link', { name: 'Open on YouTube' }))
      .toHaveAttribute('href', 'https://www.youtube.com/watch?v=abcdefghijk');
  });
});
