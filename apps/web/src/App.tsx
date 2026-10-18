import { useEffect, useRef, useState } from 'react';

import { api } from './api/client';
import type { ConsentProfile, Health, ProjectTelosFixture, ProjectTelosItem, ProjectTelosReceipt, YouTubeStatus } from './api/types';
import { VIEWER_GOALS, type ViewerGoal } from './api/types';
import { ConsentStudio, DEFAULT_DECLARATION } from './components/ConsentStudio';
import { ConsentFeed } from './components/ConsentFeed';
import { ThumbnailTruth } from './components/ThumbnailTruth';
import { YouTubeDiscovery } from './components/YouTubeDiscovery';
import { type Theme, useTheme } from './theme';

const ORDER = ['aviation', 'cooking', 'diy-switch', 'aviation'];
const STORAGE_KEY = 'project-telos-demo-session';
type Page = 'intent' | 'review' | 'experience' | 'receipt' | 'creator';

const INTEGRATION_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  imagen: 'Imagen',
  youtubeDataApi: 'YouTube Data API',
  bigquery: 'BigQuery',
  translation: 'Cloud Translation',
  cloudRun: 'Cloud Run',
};

function assetAt(index: number): string {
  const asset = ORDER[index];
  if (!asset) throw new Error('The demo item is outside the four-item stream.');
  return asset;
}

interface Session {
  sessionId: string;
  profileId: string;
  index: number;
}

function restoreSession(): Session | null {
  const saved = sessionStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  const value: unknown = JSON.parse(saved);
  if (
    typeof value !== 'object' || value === null ||
    !('sessionId' in value) || typeof value.sessionId !== 'string' ||
    !('profileId' in value) || typeof value.profileId !== 'string' ||
    !('index' in value) || typeof value.index !== 'number' ||
    !Number.isInteger(value.index) || value.index < 0 || value.index >= ORDER.length
  ) throw new Error('Saved demo session is invalid. Clear it to start again.');
  return { sessionId: value.sessionId, profileId: value.profileId, index: value.index };
}

function JourneyHeader({
  page,
  index,
  itemsPushed,
  theme,
  busy,
  onBack,
  onEditIntent,
  onMode,
  onToggleTheme,
}: {
  page: Page;
  index: number;
  itemsPushed: number;
  theme: Theme;
  busy: boolean;
  onBack: () => void;
  onEditIntent: () => void;
  onMode: (mode: 'creator' | 'viewer') => void;
  onToggleTheme: () => void;
}) {
  const steps = [
    { label: 'Declare', number: '01' },
    { label: 'Review', number: '02' },
    { label: 'Experience', number: '03' },
    { label: 'Receipt', number: '04' },
  ];
  const creator = page === 'creator';
  const stepKey: Record<Exclude<Page, 'creator'>, string> = {
    intent: 'declare', review: 'review', experience: 'experience', receipt: 'receipt',
  };

  return (
    <header className="journey-header">
      <div className="journey-topbar">
        <a className="brand-lockup" href="#top" aria-label="Project Telos home">
          <span className="brand-mark" aria-hidden="true">PT</span>
          <span>project telos<span className="brand-period">.</span></span>
        </a>
        <nav className="mode-switch" aria-label="Choose experience">
          <button type="button" aria-pressed={creator} className={creator ? 'is-selected' : ''}
            onClick={() => onMode('creator')}>
            <span aria-hidden="true">◎</span> Creator Studio
            <small>For creators</small>
          </button>
          <button type="button" aria-pressed={!creator} className={!creator ? 'is-selected' : ''}
            onClick={() => onMode('viewer')}>
            <span aria-hidden="true">▷</span> Viewer feed
            <small>For viewers</small>
          </button>
        </nav>
        <div className="journey-actions">
          {page === 'experience' && (
            <span className="journey-count">{String(index + 1).padStart(2, '0')} <span>/ 04</span></span>
          )}
          {page === 'receipt' && (
            <span className="journey-count">{String(itemsPushed).padStart(2, '0')} <span>items</span></span>
          )}
          <button type="button" className="theme-toggle" onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            <span className={`theme-toggle-knob ${theme}`} aria-hidden="true">{theme === 'dark' ? '☾' : '☀'}</span>
          </button>
        </div>
      </div>
      {!creator && (
        <div className="journey-subbar">
          <nav aria-label="Demo journey" className="journey-steps">
            {steps.map((step, stepIndex) => {
              const active = step.label.toLowerCase() === stepKey[page];
              const completed = stepIndex === 0 && page !== 'intent' ||
                stepIndex === 1 && (page === 'experience' || page === 'receipt') ||
                stepIndex === 2 && page === 'receipt';
              return (
                <div key={step.label} aria-current={active ? 'step' : undefined} className={`journey-step ${active ? 'is-active' : ''} ${completed ? 'is-complete' : ''}`}>
                  <span className="journey-step-number">{completed ? '✓' : step.number}</span>
                  <span>{step.label}</span>
                  {stepIndex < steps.length - 1 && <span className="journey-step-line" aria-hidden="true" />}
                </div>
              );
            })}
          </nav>
          {page !== 'intent' && (
            <div className="viewer-step-actions">
              <button className="quiet-link" type="button" disabled={busy} onClick={onBack}>
                <span aria-hidden="true">← </span>
                Back to {page === 'review' ? 'intent' : page === 'experience' ? 'review' : 'experience'}
              </button>
              <button className="quiet-link" type="button" disabled={busy} onClick={onEditIntent}>Edit intent</button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

/** A story-led, animated demo: intention becomes a visible intervention. */
export function App() {
  const [fixtures, setFixtures] = useState<ProjectTelosFixture[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [profile, setProfile] = useState<ConsentProfile | null>(null);
  const [draftIntent, setDraftIntent] = useState(DEFAULT_DECLARATION);
  const [draftContext, setDraftContext] = useState('learning');
  const [goal, setGoal] = useState<ViewerGoal>('learn');
  const [draftTopics, setDraftTopics] = useState('aviation, cooking, diy');
  const [session, setSession] = useState<Session | null>(null);
  const [item, setItem] = useState<ProjectTelosItem | null>(null);
  const [feedItems, setFeedItems] = useState<ProjectTelosItem[]>([]);
  const [receipt, setReceipt] = useState<ProjectTelosReceipt | null>(null);
  const [page, setPage] = useState<Page>('creator');
  const [youtube, setYoutube] = useState<YouTubeStatus | null>(null);
  const [theme, toggleTheme] = useTheme();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionPending = useRef(false);
  const previousPage = useRef<Page>(page);
  const viewerPage = useRef<Page>('intent');
  const creator = page === 'creator';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catalog, status] = await Promise.all([api.projectTelosFixtures(), api.health()]);
        if (cancelled) return;
        setFixtures(catalog);
        setHealth(status);
        const saved = restoreSession();
        if (saved) {
          const restored = await api.profile(saved.profileId);
          const preferences = await api.viewerPreferences(saved.profileId);
          const current = await api.projectTelosPush(
            saved.profileId, assetAt(saved.index), saved.sessionId, `push-${saved.index + 1}`,
          );
          const totals = await api.projectTelosReceipt(saved.sessionId);
          if (cancelled) return;
          setProfile(restored);
          setGoal(preferences.goal);
          setDraftTopics(restored.interests.join(', '));
          if (preferences.utterance) setDraftIntent(preferences.utterance);
          setDraftContext(preferences.context ?? restored.context);
          setSession(saved);
          setItem(current);
          setFeedItems([current]);
          setReceipt(totals);
          // The creator check stays the landing page; the viewer session resumes when opened.
          viewerPage.current = 'experience';
          setPage((current) => current === 'creator' ? current : 'experience');
        }
        setReady(true);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load Project Telos');
      }
    })();
    // Capability probe only: a missing key must not block the controlled demo.
    api.youtubeStatus()
      .then((status) => { if (!cancelled) setYoutube(status); })
      .catch(() => { if (!cancelled) setYoutube(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (previousPage.current !== page) {
      document.querySelector<HTMLElement>('.journey-page h1')?.focus();
      previousPage.current = page;
    }
  }, [page]);

  async function push(active: ConsentProfile, next: Session) {
    const result = await api.projectTelosPush(
      active.id, assetAt(next.index), next.sessionId, `push-${next.index + 1}`,
    );
    setProfile(active);
    setSession(next);
    setItem(result);
    setFeedItems((rows) => [...rows.filter((row) => row.itemId !== result.itemId), result]);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setReceipt(await api.projectTelosReceipt(next.sessionId));
  }

  async function perform(action: () => Promise<void>) {
    if (actionPending.current) {
      setError('Another action is still running. The frame remains protected; retry when it completes.');
      return;
    }
    actionPending.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed; Project Telos remains protected');
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }

  async function recordOutcome(target: ProjectTelosItem, outcome: 'held' | 'reframed') {
    if (!session) return;
    await perform(async () => {
      const result = await api.projectTelosOutcome(session.sessionId, target.itemId, outcome);
      setItem((current) => current?.itemId === result.itemId ? result : current);
      setFeedItems((rows) => rows.map((row) => row.itemId === result.itemId ? result : row));
      setReceipt(await api.projectTelosReceipt(session.sessionId));
    });
  }

  const canAdvance = item?.status === 'allowed' || item?.status === 'reframed';
  const trapReady = item?.status === 'held' || item?.status === 'reframed';

  function startOver() {
    sessionStorage.removeItem(STORAGE_KEY);
    setProfile(null);
    setSession(null);
    setItem(null);
    setFeedItems([]);
    setReceipt(null);
    setPage('intent');
    setFeedItems([]);
    setDraftIntent(DEFAULT_DECLARATION);
    setDraftContext('learning');
    setGoal('learn');
    setDraftTopics('aviation, cooking, diy');
  }

  function startExperience() {
    if (!profile) return;
    if (session && item) {
      setPage('experience');
      return;
    }
    void perform(async () => {
      sessionStorage.removeItem(STORAGE_KEY);
      await push(profile, {
        sessionId: `project-telos-${crypto.randomUUID()}`,
        profileId: profile.id,
        index: 0,
      });
      setPage('experience');
    });
  }

  function switchMode(mode: 'creator' | 'viewer') {
    if (mode === 'creator') {
      if (page !== 'creator') viewerPage.current = page;
      setPage('creator');
    } else if (page === 'creator') {
      setPage(viewerPage.current);
    }
  }

  return (
    <main id="top" className="project-telos-shell">
      <JourneyHeader
        page={page}
        index={session?.index ?? 0}
        itemsPushed={receipt?.itemsPushed ?? 0}
        theme={theme}
        busy={busy}
        onBack={() => setPage(page === 'receipt' ? 'experience' : page === 'experience' ? 'review' : 'intent')}
        onEditIntent={() => setPage('intent')}
        onMode={switchMode}
        onToggleTheme={toggleTheme}
      />

      {error && (
        <div role="alert" className="journey-error">
          <span aria-hidden="true">!</span>
          {error}
          {!ready && (
            <button type="button" className="quiet-link" onClick={() => {
              sessionStorage.removeItem(STORAGE_KEY);
              location.reload();
            }}>Clear saved demo and retry</button>
          )}
        </div>
      )}

      {page === 'intent' && (
        <section key="intent" className="journey-page intent-page" aria-labelledby="intent-title">
          <div className="intent-copy page-enter">
            <p className="eyebrow"><span className="eyebrow-dot" /> YOUR ATTENTION, ON YOUR TERMS</p>
            <h1 id="intent-title" tabIndex={-1}>What are you<br /><span>here for?</span></h1>
            <p className="intent-lede">
              Today's feeds decide for you, and the video is already playing before you can say no.
              Project Telos starts with what you say you want, and checks every video before it reaches you.
            </p>
            <div className="feed-contrast" aria-label="How Project Telos differs from today's feeds">
              <section className="feed-contrast-side is-today">
                <span className="feed-contrast-label">TODAY'S ALGORITHM FEED</span>
                <strong>Decided by signals you never chose</strong>
                <ul>
                  <li>Your watch history and past clicks</li>
                  <li>How long people linger (dwell time)</li>
                  <li>What keeps everyone else watching</li>
                  <li>Trends and paid promotion</li>
                </ul>
                <p className="feed-contrast-outcome"><b>▶</b> It plays first. You can only avoid it after you've seen it.</p>
              </section>
              <section className="feed-contrast-side is-telos">
                <span className="feed-contrast-label">PROJECT TELOS</span>
                <strong>Decided by what you say you're here for</strong>
                <ul>
                  <li>Your goal and topics, declared, not inferred</li>
                  <li>Your boundaries, checked separately</li>
                  <li>Every video is understood before it is shown</li>
                  <li>Nothing plays until you choose</li>
                </ul>
                <p className="feed-contrast-outcome"><b>✓</b> It checks first. You decide what reaches you.</p>
              </section>
            </div>
            <div className="honest-labels">
              <span><b /> Synthetic playback demo</span>
              <span><b /> Reviewed timeline evidence</span>
            </div>
          </div>

          <div className="intent-form-wrap page-enter page-enter-delay">
            <div className="intent-form-heading">
              <span className="form-step">01 — YOUR INTENT</span>
              <span className="form-step-note">Takes one sentence</span>
            </div>
            <ConsentStudio
              profile={null}
              presets={[]}
              utterance={draftIntent}
              context={draftContext}
              goal={goal}
              topics={draftTopics}
              onGoalChange={setGoal}
              onTopicsChange={setDraftTopics}
              busy={busy || !ready}
              onDraftChange={(utterance, context) => {
                setDraftIntent(utterance);
                setDraftContext(context);
              }}
              onSelectPreset={() => {}}
              onDeclare={() => void perform(async () => {
                const created = await api.declare(draftIntent, draftContext, {
                  goal, topics: draftTopics.split(',').map((value) => value.trim()).filter(Boolean),
                });
                setProfile(created);
                setSession(null);
                setItem(null);
                setFeedItems([]);
                setReceipt(null);
                sessionStorage.removeItem(STORAGE_KEY);
                setPage('review');
              })}
            />
            <div className="privacy-footnote">
              <span aria-hidden="true">✳</span>
              Your declared boundaries stay yours. Project Telos never infers them from watch history.
            </div>
          </div>
        </section>
      )}

      {page === 'review' && profile && (
        <section key="review" className="journey-page review-page page-enter" aria-labelledby="review-title">
          <div className="review-intro">
            <p className="eyebrow"><span className="eyebrow-dot" /> 02 — CHECK WHAT PROJECT TELOS HEARD</p>
            <h1 id="review-title" tabIndex={-1}>Your intent,<br /><span>made explicit.</span></h1>
            <p>
              Review the profile created from your declaration. Nothing enters the demo feed until you continue.
              Topic relevance and personal safety are separate checks.
            </p>
          </div>
          <div className="review-card">
            <div className="review-card-heading">
              <div>
                <span className="review-label">YOUR CONSENT PROFILE</span>
                <h2>{profile.name}</h2>
              </div>
              <span className="review-context">{profile.context}</span>
            </div>
            <div className="review-groups">
              <section>
                <span className="review-label">MY GOAL</span>
                <div className="review-chips interest-chips"><span>{VIEWER_GOALS[goal]}</span></div>
              </section>
              <section>
                <span className="review-label">I WANT TO SEE</span>
                <div className="review-chips interest-chips">
                  {profile.interests.length
                    ? profile.interests.map((interest) => <span key={interest}>{interest}</span>)
                    : <span className="review-empty">No interests identified from this declaration.</span>}
                </div>
              </section>
              <section>
                <span className="review-label">KEEP OUT / LIMIT</span>
                <div className="review-chips boundary-chips">
                  {profile.avoid.length
                    ? profile.avoid.map((boundary) => (
                      <span key={boundary.category}>
                        {boundary.category.replace(/_/g, ' ')}
                        <small>through {boundary.intensityThreshold}</small>
                      </span>
                    ))
                    : <span className="review-empty">No exclusions identified.</span>}
                </div>
              </section>
              <section>
                <span className="review-label">ALLOW IN CONTEXT</span>
                <div className="review-chips context-chips">
                  {profile.allowContextually.length
                    ? profile.allowContextually.map((category) => <span key={category}>{category.replace(/_/g, ' ')}</span>)
                    : <span className="review-empty">No contextual exceptions.</span>}
                </div>
              </section>
            </div>
            <div className="review-note">
              <span aria-hidden="true">i</span>
              The profile reflects your declaration; it is not inferred from clicks or viewing history.
              Unrelated topics are filtered even when they are safe. Goals describe your session, not a learned ranking model.
            </div>
            <div className="review-actions">
              <button type="button" className="quiet-link" onClick={() => setPage('intent')}>← Edit declaration</button>
              <button type="button" className="project-telos-button journey-cta" disabled={busy}
                onClick={startExperience}>
                {busy ? 'Preparing your feed…' : session && item ? 'Resume protected session' : 'Start protected session'}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          </div>
          <p className="review-provider">
            Profile interpretation: {health?.uses_model_calls ? 'Gemini-backed service' : 'local phrase matching'}.
            {' '}{youtube?.searchConfigured
              ? 'Your session shows the demo videos plus live YouTube results searched from your declared interests only.'
              : 'You get the demo videos plus a paste-a-link YouTube panel; live search needs YOUTUBE_API_KEY.'}
          </p>
        </section>
      )}

      {page === 'experience' && profile && session && item && (
        <section className="journey-page experience-page page-enter" aria-labelledby="experience-title">
          <div className="experience-heading">
            <div>
              <p className="eyebrow"><span className="eyebrow-dot" /> YOUR SESSION · {health?.uses_model_calls ? 'GEMINI PROFILE' : 'LOCAL PROFILE'}</p>
              <h1 id="experience-title" tabIndex={-1}>One intent. Every video.</h1>
              <p className="experience-subtitle">
                Scroll the controlled demo feed, then search live YouTube below with the same consent profile.
              </p>
            </div>
            <div className="intent-stamp">
              <span>YOUR INTENT</span>
              <strong>
                {VIEWER_GOALS[goal]} · {profile.interests.length ? profile.interests.join(' · ') : 'Any topic'}
                {profile.avoid.length > 0 && ` · avoiding ${profile.avoid.map(({ category }) => category.replace(/_/g, ' ')).join(', ')}`}
              </strong>
              <button type="button" onClick={() => setPage('intent')}>Edit declaration</button>
            </div>
          </div>

          <nav className="experience-tabs" aria-label="Jump to feed source">
            <a href="#controlled-demo">
              <span>01</span> Demo videos
              <small>Reviewed synthetic clips</small>
            </a>
            <a href="#live-youtube">
              <span>02</span> Live YouTube search
              <small>{youtube?.searchConfigured
                ? `YouTube Data API${youtube.analysisConfigured ? ' + Gemini audit' : ' · audit not configured'}`
                : 'Paste a link · search needs YOUTUBE_API_KEY'}</small>
            </a>
          </nav>

          <div id="controlled-demo" className="journey-panel page-enter">
              <div className="story-ribbon">
                <div className="story-ribbon-copy">
                  <span className="story-ribbon-kicker">THE CONTROLLED DEMO</span>
                  <strong>
                    A feed shaped by your intent.
                  </strong>
                  <span>
                    Relevant items can play; unrelated topics are filtered and boundary violations held.
                  </span>
                </div>
                <div className="story-ribbon-progress" aria-label={`Item ${session.index + 1} of ${ORDER.length}`}>
                  {ORDER.map((_, index) => (
                    <span key={index} className={index < session.index ? 'is-done' : index === session.index ? 'is-current' : ''}>
                      {index < session.index ? '✓' : `0${index + 1}`}
                    </span>
                  ))}
                </div>
              </div>

              <ConsentFeed items={feedItems} fixtures={fixtures} busy={busy}
                hasMore={session.index < ORDER.length - 1}
                onNext={() => {
                  if (!busy && !actionPending.current) {
                    void perform(() => push(profile, { ...session, index: session.index + 1 }));
                  }
                }}
                onOutcome={(target, outcome) => void recordOutcome(target, outcome)} />

              <div className="story-actions">
                <div className="story-disclosure">
                  <span className="disclosure-icon" aria-hidden="true">i</span>
                  <span>
                    {item.status === 'reframed'
                      ? `${item.summaryBy ?? 'Reviewed fixture summary'} · synthetic scene, not decoded video`
                      : 'Reviewed fixture timeline · simulated playback · no real shock footage'}
                  </span>
                </div>
                {session.index < ORDER.length - 1 ? (
                  <div className="feed-navigation">
                  {!canAdvance && <button type="button" className="project-telos-button secondary" disabled={busy}
                    onClick={() => void perform(() => push(profile, { ...session, index: session.index + 1 }))}>
                    Skip video
                  </button>}
                  <button type="button" className="project-telos-button journey-cta" disabled={busy || !canAdvance}
                    onClick={() => void perform(() => push(profile, { ...session, index: session.index + 1 }))}>
                    {busy
                      ? 'Preparing next scene…'
                      : item.status === 'held'
                        ? 'Reframe to continue'
                        : trapReady ? 'Continue the story' : 'Next scene'}
                    <span aria-hidden="true">↗</span>
                  </button>
                  </div>
                ) : (
                  <button type="button" className="project-telos-button journey-cta" disabled={busy}
                    onClick={() => void perform(async () => {
                      setReceipt(await api.projectTelosReceipt(session.sessionId));
                      setPage('receipt');
                    })}>
                    Open my receipt <span aria-hidden="true">↗</span>
                  </button>
                )}
              </div>
            </div>

          <div id="live-youtube" className="journey-panel page-enter">
            <YouTubeDiscovery key={profile.id} profile={profile} />
          </div>
        </section>
      )}

      {page === 'receipt' && receipt && (
        <section key="receipt" className="journey-page receipt-page page-enter" aria-labelledby="receipt-heading">
          <div className="receipt-orbit" aria-hidden="true">
            <span className="receipt-orbit-core">✓</span>
            <span className="receipt-spark receipt-spark-one">✳</span>
            <span className="receipt-spark receipt-spark-two">✦</span>
          </div>
          <p className="eyebrow"><span className="eyebrow-dot" /> YOUR SESSION, MADE VISIBLE</p>
          <h1 id="receipt-heading" tabIndex={-1}>Your attention.<br /><span>Your receipt.</span></h1>
          <p className="receipt-lede">Here’s what Project Telos did with the boundaries you set.</p>

          <div className="receipt-ticket">
            <div className="receipt-ticket-head">
              <span>PROJECT TELOS <i>·</i> SESSION SUMMARY</span>
              <span>{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <dl className="receipt-metrics">
              <div><dt>Items pushed</dt><dd>{receipt.itemsPushed}</dd></div>
              <div className="metric-highlight"><dt>Reframed</dt><dd>{receipt.reframed}</dd></div>
              <div><dt>Demo policy rate</dt><dd>{receipt.consentRate === null ? 'N/A' : `${receipt.consentRate}%`}</dd></div>
            </dl>
            <div className="receipt-ticket-footer">
              <span>{receipt.reframed} reframed</span>
              <span>{receipt.pending} holds pending</span>
            </div>
            <div className="receipt-ticket-perforation" aria-hidden="true" />
          </div>

          <p className="receipt-caveat">
            Demo policy rate counts completed outcomes out of items pushed. Pending holds remain pending;
            this is not audience approval or measured exposure safety.
          </p>
          <div className="receipt-actions">
            <button type="button" className="project-telos-button journey-cta" onClick={() => setPage('experience')}>
              Back to experience <span aria-hidden="true">↗</span>
            </button>
            <button type="button" className="quiet-link" onClick={startOver}>Start a new session</button>
          </div>
        </section>
      )}

      {page === 'creator' && (
        <section key="creator" className="journey-page creator-page page-enter" aria-labelledby="creator-title">
          <div className="creator-hero">
            <div className="creator-hero-copy">
              <p className="eyebrow"><span className="eyebrow-dot" /> CREATOR STUDIO · BEFORE YOU PUBLISH</p>
              <h1 id="creator-title" tabIndex={-1}>Does your thumbnail<br /><span>keep its promise?</span></h1>
              <p className="creator-why">
                <strong>Why it matters:</strong> viewers who feel tricked by a thumbnail click away and stop
                trusting the channel. Catch the mismatch before you publish, not after.
              </p>
              <dl className="creator-diff" aria-label="How this is different">
                <div>
                  <dt>Thumbnail tools today</dt>
                  <dd>Help you win the click: A/B tests and click-through predictions.</dd>
                </div>
                <div className="is-ours">
                  <dt>Project Telos</dt>
                  <dd>Checks you keep the promise: Gemini compares the feeling, objects, and topic on your
                    thumbnail with evidence from the video, then shows you what to change.</dd>
                </div>
              </dl>
            </div>
            <ol className="creator-pipeline" aria-label="How the check works">
              <li><b>01</b><span>See an example</span><small>One click, no upload needed</small></li>
              <li><b>02</b><span>Check your own</span><small>Thumbnail + video, or a YouTube link</small></li>
              <li><b>03</b><span>Fix and recheck</span><small>Honest title and an Imagen thumbnail</small></li>
            </ol>
          </div>
          <ThumbnailTruth />
        </section>
      )}

      <footer className="journey-footer">
        <span>PROJECT TELOS <i>·</i> {creator ? 'MAKE THE THUMBNAIL MATCH THE VIDEO' : 'KEEP THE PROMISE, BEFORE AND AFTER UPLOAD'}</span>
        {!creator && (
          <span>
            {health?.uses_model_calls ? 'Gemini profile configured' : 'Offline phrase matching'}
            {' · '}YouTube search: {youtube?.searchConfigured ? 'live' : 'paste links only'}
            {' · '}Controlled story: reviewed fixtures
          </span>
        )}
        {health?.integrations && (
          <span className="footer-integrations" aria-label="Google Cloud integrations">
            {Object.entries(INTEGRATION_LABELS).map(([key, label]) => (
              <span key={key} className={health.integrations?.[key] === true ? 'is-on' : ''}>
                {health.integrations?.[key] === true ? '●' : '○'} {label}
              </span>
            ))}
            <span className={health.integrations.storage === 'firestore' ? 'is-on' : ''}>
              {health.integrations.storage === 'firestore' ? '● Firestore' : '○ Firestore (local JSON)'}
            </span>
          </span>
        )}
      </footer>
    </main>
  );
}
