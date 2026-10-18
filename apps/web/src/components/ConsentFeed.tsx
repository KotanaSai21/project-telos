import { useEffect, useRef, useState } from 'react';

import type { ProjectTelosFixture, ProjectTelosItem } from '../api/types';
import { ProjectTelosComparison } from './ProjectTelosComparison';

interface Props {
  items: ProjectTelosItem[];
  fixtures: ProjectTelosFixture[];
  busy: boolean;
  hasMore: boolean;
  onNext: () => void;
  onOutcome: (item: ProjectTelosItem, outcome: 'held' | 'reframed') => void;
}

/** Only the visible card runs playback; scrolling requests the next consent-checked item. */
export function ConsentFeed({ items, fixtures, busy, hasMore, onNext, onOutcome }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState(items.at(-1)?.itemId);
  const [compare, setCompare] = useState(false);
  const requested = useRef<string | null>(null);
  const nextRef = useRef(onNext);
  nextRef.current = onNext;

  useEffect(() => {
    const container = root.current;
    if (!container || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
        const id = (entry.target as HTMLElement).dataset.feedItem;
        if (id) setActiveId(id);
        if (entry.target === container.querySelector('[data-feed-next]') && hasMore && !busy) {
          const last = items.at(-1)?.itemId;
          if (last && requested.current !== last) {
            requested.current = last;
            nextRef.current();
          }
        }
      }
    }, { root: container, threshold: 0.5 });
    container.querySelectorAll('[data-feed-item], [data-feed-next]').forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [items, busy, hasMore]);

  useEffect(() => {
    const last = items.at(-1);
    if (!last) return;
    setActiveId(last.itemId);
    root.current?.querySelector<HTMLElement>(`[data-feed-item="${last.itemId}"]`)?.scrollIntoView?.({
      block: 'nearest', behavior: 'instant',
    });
  }, [items.length]);

  return (
    <section className={`consent-feed ${compare ? 'show-comparison' : ''}`}>
      <div className="feed-toolbar">
        <div><strong>Understood before you watch.</strong><span>Every video is checked against your intent first; you decide what plays.</span></div>
        <button type="button" className="project-telos-button secondary" aria-pressed={compare}
          onClick={() => setCompare(!compare)}>{compare ? 'Hide the algorithm feed' : "Compare with today's algorithm feed"}</button>
      </div>
      <div ref={root} className="feed-viewport" tabIndex={0} role="region" aria-label="Consent-protected synthetic feed">
        {items.map((item) => {
          const fixture = fixtures.find((row) => row.id === item.assetId);
          if (!fixture) return null;
          return (
            <article key={item.itemId} data-feed-item={item.itemId} className="feed-card">
              <ProjectTelosComparison fixture={fixture} item={item} busy={busy}
                active={activeId === item.itemId} showBefore={compare}
                onHeld={() => onOutcome(item, 'held')}
                onReframe={() => onOutcome(item, 'reframed')} />
              <p className="feed-card-note">
                Synthetic playback · reviewed timeline · topic relevance and boundaries are checked separately.
              </p>
            </article>
          );
        })}
        {hasMore && (
          <div data-feed-next className="feed-next">
            <p>Project Telos checks the next video against your intent first. Nothing plays until you choose.</p>
            <button type="button" className="project-telos-button" disabled={busy} onClick={onNext}>
              {busy ? 'Checking next video…' : 'Check next video'}
            </button>
            <p>Skipping does not mark an unresolved item as completed.</p>
          </div>
        )}
      </div>
    </section>
  );
}
