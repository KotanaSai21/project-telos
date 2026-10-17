import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProjectTelosItem } from '../api/types';
import { ConsentFeed } from './ConsentFeed';

vi.mock('./ProjectTelosComparison', () => ({
  ProjectTelosComparison: ({ item, active }: { item: ProjectTelosItem; active: boolean }) => (
    <div data-testid={item.itemId} data-active={active}>{item.assetId}</div>
  ),
}));

const item: ProjectTelosItem = {
  sessionId: 'demo', profileId: 'profile', itemId: 'push-1', assetId: 'aviation',
  status: 'allowed', holdAtSec: 0, analysisBy: 'Reviewed fixture',
  bait: { index: 0, switchSec: null, mismatchShare: 0, evidence: [], method: 'Reviewed' },
  decision: {
    profileId: 'profile', assetHash: 'a'.repeat(64), action: 'allow',
    affectedRanges: [], reason: 'Allowed', confidence: 1, createdAt: '2026-10-11T00:00:00Z',
  },
};
const fixtures = [{ id: 'aviation', title: 'Aviation', hook: 'Learn', promiseTopics: ['aviation'], durationSec: 28 }];

afterEach(() => vi.unstubAllGlobals());

describe('ConsentFeed scrolling', () => {
  it('requests the next checked item once when its loading card becomes visible', () => {
    let callback: IntersectionObserverCallback | undefined;
    vi.stubGlobal('IntersectionObserver', vi.fn(function (cb: IntersectionObserverCallback) {
      callback = cb;
      return { observe: vi.fn(), disconnect: vi.fn() };
    }));
    const onNext = vi.fn();
    const { container } = render(<ConsentFeed items={[item]} fixtures={fixtures}
      busy={false} hasMore onNext={onNext} onOutcome={vi.fn()} />);
    const target = container.querySelector('[data-feed-next]');
    if (!target || !callback) throw new Error('Expected a next-card observer');
    const entries = [{ target, isIntersecting: true, intersectionRatio: 1 }] as IntersectionObserverEntry[];
    act(() => {
      callback?.(entries, {} as IntersectionObserver);
      callback?.(entries, {} as IntersectionObserver);
    });
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('provides keyboard-accessible loading and comparison without requiring an observer', async () => {
    const onNext = vi.fn();
    render(<ConsentFeed items={[item]} fixtures={fixtures} busy={false} hasMore
      onNext={onNext} onOutcome={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Consent-protected synthetic feed' })).toHaveAttribute('tabindex', '0');
    const compare = screen.getByRole('button', { name: 'Compare without Project Telos' });
    expect(compare).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(compare);
    expect(screen.getByRole('button', { name: 'Show my feed' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Load next video' }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});
