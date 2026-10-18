import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectTelosFixture, ProjectTelosItem } from '../api/types';
import { ProjectTelosComparison } from './ProjectTelosComparison';

const fixture: ProjectTelosFixture = {
  id: 'diy-switch', title: 'Easy Weekend DIY', hook: 'Organize your desk',
  promiseTopics: ['diy'], durationSec: 28,
};
const item: ProjectTelosItem = {
  sessionId: 'demo', profileId: 'profile', itemId: 'push-3', assetId: 'diy-switch',
  status: 'protected', holdAtSec: 13, analysisBy: 'Reviewed fixtures',
  decision: {
    assetHash: 'a'.repeat(64), profileId: 'profile', action: 'hold', affectedRanges: [],
    reason: 'Boundary', confidence: 1, createdAt: '2026-10-11T00:00:00Z',
  },
  bait: {
    index: 100, switchSec: 14, mismatchShare: 0.25, method: 'Reviewed topic mismatch',
    evidence: [{ startSec: 14, endSec: 21, topics: ['incident'], mismatch: 1 }],
  },
};

/** The viewer's explicit choice to start playback after seeing the pre-check. */
function watch() {
  act(() => { screen.getByRole('button', { name: /^Watch/ }).click(); });
}

describe('ProjectTelosComparison', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the pre-check verdict and loads no video until the viewer chooses to watch', async () => {
    const { container } = render(<ProjectTelosComparison fixture={fixture} item={item} busy={false} showBefore
      onHeld={vi.fn()} onReframe={vi.fn()} />);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('✓ Checked before you watch')).toBeInTheDocument();
    expect(screen.getByText('The first 0:13 fits your intent')).toBeInTheDocument();
    expect(screen.getByText('Checked · not playing')).toBeInTheDocument();
    expect(screen.getByTestId('after-time')).toHaveTextContent('0:00');
    expect(screen.getByTestId('before-time')).toHaveTextContent('0:00');
    expect(container.querySelector('[data-testid="youtube-player"], iframe')).toBeNull();
    expect(container.querySelector('.has-video')).toBeNull();

    watch();
    await act(async () => { vi.advanceTimersByTime(1); });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(screen.getByTestId('after-time')).toHaveTextContent('0:02');
  });

  it('renders no Before side at all unless the comparison is requested', () => {
    render(<ProjectTelosComparison fixture={fixture} item={item} busy={false} onHeld={vi.fn()} onReframe={vi.fn()} />);
    expect(screen.queryByTestId('before-scene')).not.toBeInTheDocument();
  });

  it('survives StrictMode, holds exactly at 13, and lets Before reach the switch', async () => {
    const onHeld = vi.fn();
    render(<StrictMode><ProjectTelosComparison fixture={fixture} item={item} busy={false} showBefore
      onHeld={onHeld} onReframe={vi.fn()} /></StrictMode>);
    watch();
    await act(async () => { vi.advanceTimersByTime(1); });
    await act(async () => { vi.advanceTimersByTime(14_000); });
    expect(screen.getByTestId('before-time')).toHaveTextContent('0:14');
    expect(screen.getByTestId('after-time')).toHaveTextContent('0:13');
    expect(screen.getByTestId('before-scene')).toHaveAttribute('data-switched', 'true');
    expect(screen.getByText('⏸ Paused at 0:13, one second before the switch')).toBeInTheDocument();
    expect(screen.getByText('This video stops being what it promised')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('It promised diy. From 0:14 it turns to incident');
    expect(screen.getByText('Hidden 0:14–0:21')).toBeInTheDocument();
    expect(screen.getByText('Nothing after 0:13 was shown to you.')).toBeInTheDocument();
    expect(screen.queryByText(/Bait Index/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Promise:.*Body:/)).not.toBeInTheDocument();
    expect(onHeld).toHaveBeenCalledOnce();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByTestId('after-time')).toHaveTextContent('0:13');
    expect(onHeld).toHaveBeenCalledOnce();
    expect(screen.getByTestId('before-scene')).toHaveAttribute('data-switched', 'false');
  });

  it('lets a safe fixture play on both sides without a hold', async () => {
    const onHeld = vi.fn();
    render(<ProjectTelosComparison fixture={fixture}
      item={{ ...item, status: 'allowed', bait: { ...item.bait, index: 0, switchSec: null, evidence: [] } }}
      busy={false} onHeld={onHeld} onReframe={vi.fn()} />);
    expect(screen.getByText('Matches your intent')).toBeInTheDocument();
    watch();
    await act(async () => { vi.advanceTimersByTime(1); });
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(screen.getByTestId('after-time')).toHaveTextContent('0:15');
    expect(screen.getByText('Matches your intent')).toBeInTheDocument();
    expect(onHeld).not.toHaveBeenCalled();
  });

  it('filters off-topic content before playback even when the safety decision allows it', async () => {
    const onHeld = vi.fn();
    render(<ProjectTelosComparison fixture={fixture} item={{
      ...item, holdAtSec: 0,
      topicMatch: { status: 'off-topic', topics: ['diy'], matchedInterests: [] },
      decision: { ...item.decision, action: 'allow' },
    }} busy={false} onHeld={onHeld} onReframe={vi.fn()} />);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(screen.getByTestId('after-time')).toHaveTextContent('0:00');
    expect(screen.getAllByText('Filtered from your feed').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Watch/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Bait Index/)).not.toBeInTheDocument();
    expect(onHeld).toHaveBeenCalledOnce();
  });

  it('pauses off-screen playback and resumes without restarting the playhead', async () => {
    const props = {
      fixture, item: { ...item, status: 'allowed' as const },
      busy: false, onHeld: vi.fn(), onReframe: vi.fn(),
    };
    const { rerender } = render(<ProjectTelosComparison {...props} active />);
    watch();
    await act(async () => { vi.advanceTimersByTime(1); });
    await act(async () => { vi.advanceTimersByTime(3000); });
    rerender(<ProjectTelosComparison {...props} active={false} />);
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByTestId('after-time')).toHaveTextContent('0:03');
    rerender(<ProjectTelosComparison {...props} active />);
    await act(async () => { vi.advanceTimersByTime(1); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId('after-time')).toHaveTextContent('0:04');
  });

  it('requires a saved hold before requesting the reframe and reports the provider', () => {
    const onHeld = vi.fn();
    const onReframe = vi.fn();
    const onSkip = vi.fn();
    const { rerender } = render(<ProjectTelosComparison fixture={fixture}
      item={{ ...item, status: 'held' }} busy={false} onHeld={onHeld} onReframe={onReframe} onSkip={onSkip} />);
    screen.getByRole('button', { name: 'Get the clean summary instead' }).click();
    expect(onReframe).toHaveBeenCalledOnce();
    screen.getByRole('button', { name: 'Skip to next video' }).click();
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onHeld).not.toHaveBeenCalled();
    rerender(<ProjectTelosComparison fixture={fixture} item={{
      ...item, status: 'reframed', summary: 'Clean approved source text.',
      summaryBy: 'Reviewed fixture summary (offline)', illustrationBy: 'Local neutral illustration',
      illustration: 'data:image/svg+xml;base64,PHN2Zy8+',
    }} busy={false} onHeld={onHeld} onReframe={onReframe} />);
    expect(screen.getByText('Clean approved source text.')).toBeInTheDocument();
    expect(screen.getByText(/Reviewed fixture summary \(offline\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Get the clean summary instead' })).not.toBeInTheDocument();
  });

  it('records a hold at 0:00 only once the feed is idle, and offers skipping first', async () => {
    const onHeld = vi.fn();
    const filtered = {
      ...item, holdAtSec: 0,
      topicMatch: { status: 'off-topic' as const, topics: ['cooking'], matchedInterests: [] },
    };
    const props = { fixture, onHeld, onReframe: vi.fn(), onSkip: vi.fn() };
    const { rerender } = render(<ProjectTelosComparison {...props} item={filtered} busy />);
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(onHeld).not.toHaveBeenCalled();
    rerender(<ProjectTelosComparison {...props} item={filtered} busy={false} />);
    expect(onHeld).toHaveBeenCalledOnce();
    rerender(<ProjectTelosComparison {...props} item={{ ...filtered, status: 'held' }} busy={false} />);
    expect(screen.getByText('Not one of your topics')).toBeInTheDocument();
    expect(screen.getByText("It's about cooking. Nothing was played.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip to next video' })).not.toHaveClass('secondary');
    expect(screen.getByRole('button', { name: 'Read a summary anyway' })).toHaveClass('secondary');
    expect(onHeld).toHaveBeenCalledOnce();
  });
});
