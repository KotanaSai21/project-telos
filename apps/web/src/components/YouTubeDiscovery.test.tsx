import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api/client';
import type { ConsentProfile, YouTubeAudit, YouTubeCandidate } from '../api/types';
import { YouTubeDiscovery } from './YouTubeDiscovery';

vi.mock('../api/client', () => ({
  api: { youtubeStatus: vi.fn(), youtubeSearch: vi.fn(), youtubeAnalyse: vi.fn(), youtubeLink: vi.fn() },
}));

const profile: ConsentProfile = {
  id: 'profile', name: 'Learner', context: 'learning',
  avoid: [{ category: 'graphic_injury', intensityThreshold: 'none' }],
  allowContextually: [], interests: ['aviation'], language: 'en', narrate: false,
  version: 1, updatedAt: '2026-10-11T00:00:00Z',
};
const video: YouTubeCandidate = {
  videoId: 'abcdefghijk', title: 'Crosswind basics', channel: 'Learning',
  description: 'An aviation lesson', canonicalUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  durationSec: 30,
};
const result: YouTubeAudit = {
  profileId: profile.id, video,
  audit: {
    evidenceStatus: 'sufficient', baitScore: 0, explanation: 'The promise matches the lesson.',
    summary: 'Pilots align the aircraft with the runway.', confidence: 0.8,
    evidence: [{ startSec: 0, endSec: 30, promised: 'Aviation lesson', observed: 'Aviation lesson', mismatch: false }],
  },
  decision: {
    action: 'allow', profileId: profile.id, assetHash: 'a'.repeat(16),
    affectedRanges: [], reason: 'No declared boundary crossed', confidence: 0.8,
    createdAt: '2026-10-11T00:00:00Z',
  },
  recommendation: 'eligible', analysedBy: 'Live Gemini / test-model',
  analysedAt: '2026-10-11T00:00:00Z', note: 'YouTube playback is not frame-gated by Project Telos.',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.youtubeStatus).mockResolvedValue({
    searchConfigured: true, analysisConfigured: true, model: 'test-model', note: 'Google services',
  });
  vi.mocked(api.youtubeSearch).mockResolvedValue({
    profileId: profile.id, query: 'aviation', videos: [video],
    source: 'YouTube Data API v3', note: 'Candidates only, not safety verdicts.',
  });
  vi.mocked(api.youtubeAnalyse).mockResolvedValue(result);
});

async function approveAndAnalyse() {
  await screen.findByRole('heading', { name: video.title });
  const button = screen.getByRole('button', { name: `Analyse: ${video.title}` });
  expect(button).toBeDisabled();
  await userEvent.click(screen.getByRole('checkbox', { name: /I agree to send/ }));
  await userEvent.click(button);
  await screen.findByRole('button', { name: 'Load YouTube player (not protected)' });
}

describe('YouTube discovery', () => {
  it('searches from the profile and requires separate analysis and playback choices', async () => {
    const { container } = render(<YouTubeDiscovery profile={profile} />);
    await approveAndAnalyse();
    expect(api.youtubeSearch).toHaveBeenCalledWith(profile.id);
    expect(api.youtubeAnalyse).toHaveBeenCalledWith(profile.id, video.videoId);
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Matches your intent')).toBeInTheDocument();
    expect(screen.queryByText(/Bait estimate/)).not.toBeInTheDocument();
    expect(screen.queryByText(result.audit.explanation)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load YouTube player (not protected)' }));
    const frame = screen.getByTitle(`YouTube player: ${video.title}`);
    expect(frame).toHaveAttribute('src', `https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=0&rel=0`);
    await userEvent.click(screen.getByRole('button', { name: 'Unload player' }));
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('requires an explicit override for held content', async () => {
    vi.mocked(api.youtubeAnalyse).mockResolvedValue({
      ...result, recommendation: 'hold', audit: { ...result.audit, baitScore: 90 },
    });

    render(<YouTubeDiscovery profile={profile} />);
    await approveAndAnalyse();
    const play = screen.getByRole('button', { name: 'Load YouTube player (not protected)' });
    expect(play).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /I understand this video/ }));
    expect(play).toBeEnabled();
    expect(screen.getByText('Held for your preferences')).toBeInTheDocument();
  });

  it('shows off-topic live results as filtered without exposing creator diagnosis', async () => {
    vi.mocked(api.youtubeAnalyse).mockResolvedValue({
      ...result, recommendation: 'hold',
      topicMatch: { status: 'off-topic', topics: ['cooking'], matchedInterests: [] },
    });
    render(<YouTubeDiscovery profile={profile} />);
    await approveAndAnalyse();
    expect(screen.getByText('Filtered from your feed')).toBeInTheDocument();
    expect(screen.queryByText(/Bait estimate/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Promise: Aviation lesson/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load YouTube player (not protected)' })).toBeDisabled();
  });

  it('does not turn insufficient evidence into a scored or safe result', async () => {
    vi.mocked(api.youtubeAnalyse).mockResolvedValue({
      ...result, recommendation: 'unverified', decision: null,
      audit: { ...result.audit, evidenceStatus: 'insufficient', baitScore: null, evidence: [] },
    });
    render(<YouTubeDiscovery profile={profile} />);
    await approveAndAnalyse();
    expect(screen.getByText('Unverified / insufficient evidence')).toBeInTheDocument();
    expect(screen.queryByText(result.audit.summary)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load YouTube player (not protected)' })).toBeDisabled();
  });

  it('shows missing setup without fabricating a YouTube feed', async () => {
    vi.mocked(api.youtubeStatus).mockResolvedValue({
      searchConfigured: false, analysisConfigured: false, model: 'test-model', note: 'Not configured',
    });
    render(<YouTubeDiscovery profile={profile} />);
    expect(await screen.findByText(/server-side YOUTUBE_API_KEY/)).toBeInTheDocument();
    expect(api.youtubeSearch).not.toHaveBeenCalled();
    expect(api.youtubeAnalyse).not.toHaveBeenCalled();
  });

  it('surfaces search failure and allows a retry', async () => {
    vi.mocked(api.youtubeSearch).mockRejectedValueOnce(new Error('YouTube quota exceeded'));
    render(<YouTubeDiscovery profile={profile} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('YouTube quota exceeded');
    await userEvent.click(screen.getByRole('button', { name: 'Refresh YouTube search' }));
    expect(await screen.findByRole('heading', { name: video.title })).toBeInTheDocument();
    expect(api.youtubeSearch).toHaveBeenCalledTimes(2);
  });

  it('surfaces model failure without loading a player or returning a fixture', async () => {
    vi.mocked(api.youtubeAnalyse).mockRejectedValue(new Error('Gemini unavailable'));
    const { container } = render(<YouTubeDiscovery profile={profile} />);
    await screen.findByRole('heading', { name: video.title });
    await userEvent.click(screen.getByRole('checkbox', { name: /I agree to send/ }));
    await userEvent.click(screen.getByRole('button', { name: `Analyse: ${video.title}` }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Gemini unavailable');
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByText(/Bait estimate:/)).not.toBeInTheDocument();
  });

  it('ignores a discovery response after the component is unmounted', async () => {
    let resolve: (value: Awaited<ReturnType<typeof api.youtubeSearch>>) => void = () => {};
    vi.mocked(api.youtubeSearch).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const view = render(<YouTubeDiscovery profile={profile} />);
    await waitFor(() => expect(api.youtubeSearch).toHaveBeenCalled());
    view.unmount();
    await act(async () => { resolve({
      profileId: profile.id, query: 'aviation', videos: [video], source: 'YouTube', note: 'Candidates',
    }); });
    expect(screen.queryByRole('heading', { name: video.title })).not.toBeInTheDocument();
  });
  it('adds a pasted link as an unanalysed candidate even without YouTube search configured', async () => {
    vi.mocked(api.youtubeStatus).mockResolvedValue({
      searchConfigured: false, analysisConfigured: true, model: 'test-model', note: 'No search key',
    });
    vi.mocked(api.youtubeLink).mockResolvedValue({ video: { ...video, title: 'Pasted lesson' }, note: 'Added' });
    render(<YouTubeDiscovery profile={profile} />);
    const input = await screen.findByLabelText('Paste a public YouTube link');
    expect(api.youtubeSearch).not.toHaveBeenCalled();
    await userEvent.type(input, 'https://youtu.be/abcdefghijk');
    await userEvent.click(screen.getByRole('button', { name: 'Add to candidates' }));

    expect(api.youtubeLink).toHaveBeenCalledWith(profile.id, 'https://youtu.be/abcdefghijk');
    expect(await screen.findByRole('heading', { name: 'Pasted lesson' })).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(screen.getByText(/Pasted links · YouTube oEmbed/)).toBeInTheDocument();
    expect(api.youtubeAnalyse).not.toHaveBeenCalled();
  });

  it('shows a link error without adding a candidate', async () => {
    vi.mocked(api.youtubeLink).mockRejectedValue(new Error('Not a YouTube video URL'));
    render(<YouTubeDiscovery profile={profile} />);
    await screen.findByRole('heading', { name: video.title });
    await userEvent.click(screen.getByRole('button', { name: 'Keyboard Cat' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not a YouTube video URL');
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });});
