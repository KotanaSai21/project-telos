import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { api } from './api/client';
import type { ConsentProfile, ProjectTelosItem } from './api/types';

vi.mock('./api/client', () => ({
  api: {
    health: vi.fn(), projectTelosFixtures: vi.fn(), declare: vi.fn(), profile: vi.fn(),
    projectTelosPush: vi.fn(), projectTelosOutcome: vi.fn(), projectTelosReceipt: vi.fn(),
    youtubeStatus: vi.fn(), youtubeSearch: vi.fn(), youtubeAnalyse: vi.fn(), youtubeLink: vi.fn(),
    thumbnailTruthStatus: vi.fn(), thumbnailTruthSamples: vi.fn(), thumbnailTruthAnalyse: vi.fn(),
    thumbnailTruthAnalyseYoutube: vi.fn(), thumbnailTruthRedesign: vi.fn(), thumbnailTruthYoutubePreview: vi.fn(),
    thumbnailTruthHistory: vi.fn(), thumbnailTruthForgetHistory: vi.fn(),
    viewerPreferences: vi.fn(),
  },
}));

vi.mock('./components/ProjectTelosComparison', () => ({
  ProjectTelosComparison: ({ item, busy, onHeld, onReframe }: {
    item: ProjectTelosItem; busy: boolean; onHeld: () => void; onReframe: () => void;
  }) => <div>
    <span>{item.assetId}</span>
    {item.status === 'protected' && <button disabled={busy} onClick={onHeld}>Simulate hold</button>}
    {item.status === 'held' && <button disabled={busy} onClick={onReframe}>Summarize & Reframe</button>}
    {item.summary && <p>{item.summary}</p>}
  </div>,
}));

const profile: ConsentProfile = {
  id: 'profile-1', name: 'Learning', context: 'learning',
  avoid: [{ category: 'graphic_injury', intensityThreshold: 'none' }],
  interests: ['aviation'], allowContextually: [], language: 'en', narrate: false,
  version: 1, updatedAt: '2026-10-11T00:00:00Z',
};
const records = new Map<string, ProjectTelosItem>();

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true, value: function (this: HTMLDialogElement) { this.open = true; },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true, value: function (this: HTMLDialogElement) { this.open = false; },
  });
});

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  records.clear();
  vi.mocked(api.health).mockResolvedValue({
    provider: 'local', uses_model_calls: false, offline_fallback: false,
  });
  vi.mocked(api.youtubeStatus).mockResolvedValue({
    searchConfigured: false, analysisConfigured: false, model: 'test-model', note: 'Not configured',
  });
  vi.mocked(api.thumbnailTruthStatus).mockResolvedValue({
    liveConfigured: false, model: 'test-model', maxThumbnailBytes: 1, maxVideoBytes: 1, note: 'Offline',
  });
  vi.mocked(api.thumbnailTruthHistory).mockResolvedValue([]);
  vi.mocked(api.thumbnailTruthSamples).mockResolvedValue([]);
  vi.mocked(api.projectTelosFixtures).mockResolvedValue(
    ['aviation', 'cooking', 'diy-switch'].map((id) => ({
      id, title: id, hook: id, promiseTopics: [id], durationSec: 28,
    })),
  );
  vi.mocked(api.declare).mockResolvedValue(profile);
  vi.mocked(api.profile).mockResolvedValue(profile);
  vi.mocked(api.viewerPreferences).mockResolvedValue({ profileId: profile.id, goal: 'learn' });
  vi.mocked(api.projectTelosPush).mockImplementation(async (profileId, assetId, sessionId, itemId) => {
    const key = `${sessionId}:${itemId}`;
    const saved = records.get(key);
    if (saved) return saved;
    const trap = assetId === 'diy-switch';
    const record: ProjectTelosItem = {
      profileId, assetId, sessionId, itemId, status: trap ? 'protected' : 'allowed',
      holdAtSec: trap ? 13 : 0, analysisBy: 'Reviewed fixtures',
      bait: {
        index: trap ? 100 : 0, switchSec: trap ? 14 : null, mismatchShare: trap ? 0.25 : 0,
        evidence: [], method: 'Reviewed mismatch',
      },
      decision: {
        assetHash: 'a'.repeat(64), profileId, action: trap ? 'hold' : 'allow',
        affectedRanges: [], reason: 'Reviewed policy', confidence: 1,
        createdAt: '2026-10-11T00:00:00Z',
      },
    };
    records.set(key, record);
    return record;
  });
  vi.mocked(api.projectTelosOutcome).mockImplementation(async (sessionId, itemId, status) => {
    const key = `${sessionId}:${itemId}`;
    const saved = records.get(key);
    if (!saved) throw new Error('Missing test item');
    const record = { ...saved, status, summary: status === 'reframed' ? 'Clean source summary.' : undefined };
    records.set(key, record);
    return record;
  });
  vi.mocked(api.projectTelosReceipt).mockImplementation(async (sessionId) => {
    const rows = [...records.values()].filter((row) => row.sessionId === sessionId);
    const pending = rows.filter((row) => row.status === 'protected').length;
    return {
      sessionId, itemsPushed: rows.length, pending,
      baitTrapsNeutralized: rows.filter((row) => row.bait.index >= 50 && row.status !== 'protected').length,
      reframed: rows.filter((row) => row.status === 'reframed').length,
      consentRate: rows.length ? (rows.length - pending) / rows.length * 100 : null,
      note: 'Demo policy compliance, not audience approval.',
    };
  });
});

/** ThumbnailTruth is the landing page; viewer journeys start from the header mode switch. */
async function renderViewer() {
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: /Viewer feed/ }));
}

async function declare() {
  const button = await screen.findByRole('button', { name: 'Declare' });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  await screen.findByRole('heading', { name: /Your intent/ });
  expect(api.projectTelosPush).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Start protected session' }));
  await screen.findByRole('button', { name: 'Next scene' });
}

async function reachTrap() {
  await declare();
  await userEvent.click(screen.getByRole('button', { name: 'Next scene' }));
  await screen.findByText('cooking', { selector: 'span' });
  await userEvent.click(screen.getByRole('button', { name: 'Next scene' }));
  await screen.findByRole('button', { name: 'Simulate hold' });
}

describe('Project Telos journey', () => {
  it('returns to intent from review without losing the draft choices', async () => {
    await renderViewer();
    await userEvent.click(await screen.findByRole('radio', { name: 'Get inspired' }));
    await userEvent.click(screen.getByRole('button', { name: 'Declare' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Back to intent' }));
    expect(screen.getByRole('radio', { name: 'Get inspired' })).toBeChecked();
    expect(screen.getByLabelText('Topics (separate with commas)')).toHaveValue('aviation, cooking, diy');
    expect(api.projectTelosPush).not.toHaveBeenCalled();
  });

  it('goes back from the feed to review and resumes the same scene and session', async () => {
    await renderViewer();
    await declare();
    await userEvent.click(screen.getByRole('button', { name: 'Next scene' }));
    await screen.findByText('cooking', { selector: 'span' });
    const savedSession = sessionStorage.getItem('project-telos-demo-session');
    await userEvent.click(screen.getByRole('button', { name: 'Back to review' }));
    expect(await screen.findByRole('heading', { name: /Your intent/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resume protected session' }));
    expect(await screen.findByText('cooking', { selector: 'span' })).toBeInTheDocument();
    expect(sessionStorage.getItem('project-telos-demo-session')).toBe(savedSession);
    expect(api.projectTelosPush).toHaveBeenCalledTimes(2);
    expect(api.declare).toHaveBeenCalledTimes(1);
  });

  it('returns from the receipt to the current experience without pushing another item', async () => {
    await renderViewer();
    await reachTrap();
    await userEvent.click(screen.getByRole('button', { name: 'Skip video' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Open my receipt' }));
    const pushes = vi.mocked(api.projectTelosPush).mock.calls.length;
    await userEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Back to experience' }));
    expect(await screen.findByRole('heading', { name: /One intent. Every video/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open my receipt' })).toBeInTheDocument();
    expect(api.projectTelosPush).toHaveBeenCalledTimes(pushes);
  });

  it('sends the chosen goal and edited topics without replacing the consent-profile contract', async () => {
    await renderViewer();
    await userEvent.click(await screen.findByRole('radio', { name: 'Get inspired' }));
    const topics = screen.getByLabelText('Topics (separate with commas)');
    await userEvent.clear(topics);
    await userEvent.type(topics, 'aviation, music');
    await userEvent.click(screen.getByRole('button', { name: 'Declare' }));
    expect(api.declare).toHaveBeenCalledWith(expect.any(String), 'learning', {
      goal: 'inspiration', topics: ['aviation', 'music'],
    });
    expect(await screen.findByText('Get inspired')).toBeInTheDocument();
  });

  it('shows the interpreted consent profile before starting the feed', async () => {
    await renderViewer();
    const button = await screen.findByRole('button', { name: 'Declare' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(await screen.findByText('graphic injury')).toBeInTheDocument();
    expect(screen.getByText('aviation')).toBeInTheDocument();
    expect(api.projectTelosPush).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Start protected session' }));
    expect(await screen.findByRole('heading', { name: /One intent. Every video/ })).toBeInTheDocument();
    expect(api.projectTelosPush).toHaveBeenCalledTimes(1);
  });

  it('preserves a custom declaration when returning from profile review to edit it', async () => {
    await renderViewer();
    const input = await screen.findByRole('textbox', { name: 'Describe your boundaries and interests' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Declare' })).toBeEnabled());
    await userEvent.clear(input);
    await userEvent.type(input, 'Teach me about flight planning, avoid graphic material.');
    await userEvent.click(screen.getByRole('button', { name: 'Declare' }));
    await screen.findByRole('heading', { name: /Your intent/ });
    await userEvent.click(screen.getByRole('button', { name: 'Edit intent' }));
    expect(screen.getByRole('textbox', { name: 'Describe your boundaries and interests' }))
      .toHaveValue('Teach me about flight planning, avoid graphic material.');
  });

  it('shows the demo videos and live YouTube search together once search is configured', async () => {
    vi.mocked(api.youtubeStatus).mockResolvedValue({
      searchConfigured: true, analysisConfigured: false, model: 'test-model', note: 'Search configured',
    });
    vi.mocked(api.youtubeSearch).mockResolvedValue({
      profileId: profile.id, query: 'aviation', source: 'YouTube Data API v3', note: 'Unanalysed',
      videos: [{
        videoId: 'abcdefghijk', title: 'Aviation from YouTube', channel: 'Learning',
        description: 'Lesson', canonicalUrl: 'https://www.youtube.com/watch?v=abcdefghijk', durationSec: null,
      }],
    });
    await renderViewer();
    const button = await screen.findByRole('button', { name: 'Declare' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await screen.findByText(/live YouTube results searched from your declared interests/);
    expect(api.youtubeSearch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Start protected session' }));
    expect(await screen.findByRole('heading', { name: 'Aviation from YouTube' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next scene' })).toBeInTheDocument();
    expect(api.youtubeSearch).toHaveBeenCalledWith(profile.id);
    expect(api.youtubeAnalyse).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Live YouTube search/ })).toHaveAttribute('href', '#live-youtube');
  });

  it('offers paste-a-link with sample videos when YouTube search is not configured', async () => {
    vi.mocked(api.youtubeLink).mockResolvedValue({
      note: 'Added',
      video: {
        videoId: 'jNQXAC9IVRw', title: 'Me at the zoo', channel: 'jawed', description: '',
        canonicalUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', durationSec: null,
      },
    });
    await renderViewer();
    await declare();
    expect(screen.getByText('Paste a link · search needs YOUTUBE_API_KEY')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next scene' })).toBeInTheDocument();
    expect(api.youtubeSearch).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'Me at the zoo (0:19)' }));
    expect(api.youtubeLink).toHaveBeenCalledWith(profile.id, 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
    expect(await screen.findByRole('heading', { name: 'Me at the zoo' })).toBeInTheDocument();
  });

  it('declares, pushes four items, requires the trap action, and opens an honest receipt', async () => {
    await renderViewer();
    await reachTrap();
    expect(api.declare).toHaveBeenCalledWith(
      "I'm here to learn about aviation, cooking, and DIY. Keep it clean; avoid graphic content.", 'learning',
      { goal: 'learn', topics: ['aviation', 'cooking', 'diy'] },
    );
    expect(screen.queryByRole('button', { name: 'Next scene' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip video' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Simulate hold' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Summarize & Reframe' }));
    await screen.findByText('Clean source summary.');
    await userEvent.click(screen.getByRole('button', { name: 'Continue the story' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Open my receipt' }));
    expect(await screen.findByRole('heading', { name: /Your attention/ })).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('1 reframed')).toBeInTheDocument();
    expect(screen.getByText('0 holds pending')).toBeInTheDocument();
    expect(api.projectTelosPush).toHaveBeenCalledTimes(4);
    expect(vi.mocked(api.projectTelosPush).mock.calls.map((call) => call[3])).toEqual([
      'push-1', 'push-2', 'push-3', 'push-4',
    ]);
    expect(sessionStorage.getItem('project-telos-demo-session')).toContain('"index":3');
    await userEvent.click(screen.getByRole('button', { name: 'Start a new session' }));
    expect(await screen.findByRole('heading', { name: /What are you/, level: 1 })).toBeInTheDocument();
    expect(sessionStorage.getItem('project-telos-demo-session')).toBeNull();
  });

  it('keeps the trap held and retryable when summary generation fails', async () => {
    await renderViewer();
    await reachTrap();
    await userEvent.click(screen.getByRole('button', { name: 'Simulate hold' }));
    vi.mocked(api.projectTelosOutcome).mockRejectedValueOnce(new Error('Summary failed; frame remains held.'));
    await userEvent.click(await screen.findByRole('button', { name: 'Summarize & Reframe' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('frame remains held');
    expect(screen.queryByRole('button', { name: /Continue the story|Next scene/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Summarize & Reframe' }));
    expect(await screen.findByText('Clean source summary.')).toBeInTheDocument();
  });

  it('allows skipping a trap without crediting an unresolved item as completed', async () => {
    await renderViewer();
    await reachTrap();
    await userEvent.click(screen.getByRole('button', { name: 'Skip video' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Open my receipt' }));
    expect(await screen.findByText('75%')).toBeInTheDocument();
    expect(screen.getByText('1 holds pending')).toBeInTheDocument();
    expect(api.projectTelosOutcome).not.toHaveBeenCalled();
  });

  it('restores the same session and item identity on refresh', async () => {
    vi.mocked(api.viewerPreferences).mockResolvedValue({
      profileId: profile.id, goal: 'informed', utterance: 'Keep my original boundary.', context: 'personal',
    });
    sessionStorage.setItem('project-telos-demo-session', JSON.stringify({
      sessionId: 'saved-demo', profileId: profile.id, index: 1,
    }));
    await renderViewer();
    expect(await screen.findByText('cooking', { selector: 'span' })).toBeInTheDocument();
    expect(api.profile).toHaveBeenCalledWith(profile.id);
    expect(api.projectTelosPush).toHaveBeenCalledWith(profile.id, 'cooking', 'saved-demo', 'push-2');
    expect(api.declare).not.toHaveBeenCalled();
    expect(screen.getByText(/Stay informed · aviation/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit intent' }));
    expect(screen.getByRole('radio', { name: 'Stay informed' })).toBeChecked();
    expect(screen.getByLabelText('Describe your boundaries and interests')).toHaveValue('Keep my original boundary.');
    expect(screen.getByLabelText('Topics (separate with commas)')).toHaveValue('aviation');
  });

  it('surfaces declaration failures without exposing a feed', async () => {
    vi.mocked(api.declare).mockRejectedValue(new Error('Intent provider unavailable'));
    await renderViewer();
    const button = await screen.findByRole('button', { name: 'Declare' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Intent provider unavailable');
    expect(api.projectTelosPush).not.toHaveBeenCalled();
  });

  it('lands on the creator check and switches to the viewer journey and back', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: /Does your thumbnail/ })).toBeInTheDocument();
    expect(screen.getByTestId('thumbnail-truth')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Creator Studio/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/How is the 0–100 risk score calculated/)).toBeInTheDocument();
    expect(screen.getByText('Why this exists')).toBeInTheDocument();
    expect(screen.getByText('Checks you keep the promise')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Viewer feed.*For viewers/ })).toBeInTheDocument();
    expect(screen.queryByText(/Grounded in/)).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Demo journey' })).not.toBeInTheDocument();
    expect(api.declare).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Viewer feed/ }));
    expect(await screen.findByRole('heading', { name: /What are you/, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Demo journey' })).toBeInTheDocument();
    expect(screen.getByText("TODAY'S ALGORITHM FEED")).toBeInTheDocument();
    expect(screen.getByText(/It plays first\. You can only avoid it after you've seen it\./)).toBeInTheDocument();
    expect(screen.getByText(/It checks first\. You decide what reaches you\./)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Creator Studio/ }));
    expect(await screen.findByRole('heading', { name: /Does your thumbnail/ })).toBeInTheDocument();
  });

  it('toggles and remembers the colour theme', async () => {
    localStorage.removeItem('project-telos-theme');
    render(<App />);
    const toggle = await screen.findByRole('button', { name: /Switch to (light|dark) theme/ });
    const before = document.documentElement.dataset.theme;
    expect(before).toBe('light');
    await userEvent.click(toggle);
    const after = document.documentElement.dataset.theme;
    expect(after).not.toBe(before);
    expect(localStorage.getItem('project-telos-theme')).toBe(after);
    expect(screen.getByRole('button', {
      name: after === 'light' ? 'Switch to dark theme' : 'Switch to light theme',
    })).toBeInTheDocument();
    localStorage.removeItem('project-telos-theme');
  });
});
