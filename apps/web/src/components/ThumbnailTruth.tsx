import { useEffect, useRef, useState, type DragEvent } from 'react';

import { api } from '../api/client';
import { SAMPLE_YOUTUBE_LINKS } from '../api/samples';
import { formatTimecode } from '../playback/gate';
import { YouTubePlayer, type YouTubePlayerHandle } from './YouTubePlayer';
import type {
  MediaUpload,
  ThumbnailRedesignResult,
  ThumbnailTruthHistoryEntry,
  ThumbnailTruthResult,
  ThumbnailTruthSample,
  ThumbnailTruthStatus,
  ThumbnailTruthYouTubePreview,
} from '../api/types';

type Mode = 'upload' | 'youtube';
/** Seconds from the start of the video to analyse, or the whole video. */
type Clip = number | 'full';

const QUICK_CLIP_SECONDS = 60;
const LONG_CLIP_SECONDS = 300;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const GAUGE_RADIUS = 52;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

const CREATOR_KEY = 'project-telos-creator-id';

/** An anonymous id kept in this browser so a creator can see their own recent checks. Not an account. */
function creatorIdentity(): string | null {
  try {
    const saved = localStorage.getItem(CREATOR_KEY);
    if (saved) return saved;
    const created = `creator-${crypto.randomUUID()}`;
    localStorage.setItem(CREATOR_KEY, created);
    return created;
  } catch {
    return null;
  }
}

/** The score a revision started from, so a fresh check can show the change. */
interface Baseline {
  score: number;
  band: ThumbnailTruthResult['band'];
  title: string;
}

interface PickedFile {
  name: string;
  size: number;
  upload: MediaUpload;
  preview: string;
}

function readFile(file: File): Promise<PickedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve({
        name: file.name,
        size: file.size,
        preview: dataUrl,
        upload: { mimeType: file.type, dataBase64: dataUrl.slice(dataUrl.indexOf(',') + 1) },
      });
    };
    reader.readAsDataURL(file);
  });
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MB`;
}

function DropZone({
  id, label, hint, accept, file, disabled, onFile,
}: {
  id: string;
  label: string;
  hint: string;
  accept: string[];
  file: PickedFile | null;
  disabled: boolean;
  onFile: (file: File | null) => void;
}) {
  const [over, setOver] = useState(false);

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setOver(false);
    if (!disabled) onFile(event.dataTransfer.files[0] ?? null);
  }

  return (
    <label htmlFor={id} className={`tt-drop ${over ? 'is-over' : ''} ${file ? 'has-file' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)} onDrop={drop}>
      <input id={id} type="file" accept={accept.join(',')} className="sr-only" disabled={disabled}
        onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
      {file && accept === IMAGE_TYPES
        ? <img src={file.preview} alt="Selected thumbnail preview" className="tt-drop-preview" />
        : <span className="tt-drop-icon" aria-hidden="true">{accept === IMAGE_TYPES ? '🖼' : '🎬'}</span>}
      <span className="tt-drop-label">{label}</span>
      <span className="tt-drop-hint">{file ? `${file.name} · ${megabytes(file.size)}` : hint}</span>
    </label>
  );
}

function RiskGauge({ result }: { result: ThumbnailTruthResult }) {
  const score = result.riskScore ?? 0;
  return (
    <div className={`tt-gauge band-${result.band}`} role="img"
      aria-label={result.riskScore === null
        ? 'Mismatch risk not scored: insufficient evidence'
        : `Mismatch risk ${result.riskScore} out of 100: ${result.bandLabel}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={GAUGE_RADIUS} className="tt-gauge-track" />
        <circle cx="60" cy="60" r={GAUGE_RADIUS} className="tt-gauge-value"
          strokeDasharray={GAUGE_CIRCUMFERENCE}
          strokeDashoffset={GAUGE_CIRCUMFERENCE * (1 - score / 100)} />
      </svg>
      <div className="tt-gauge-copy">
        <strong>{result.riskScore ?? '—'}</strong>
        <span>{result.riskScore === null ? 'unverified' : '/ 100'}</span>
      </div>
    </div>
  );
}

function SampleThumbnail({ sample }: { sample: ThumbnailTruthSample }) {
  return (
    <div className={`tt-sample-thumb tone-${sample.thumbnailTone}`} role="img"
      aria-label={`Illustrated thumbnail: ${sample.thumbnailCaption}`}>
      <span className="tt-sample-thumb-text">{sample.thumbnailText}</span>
      <span className="tt-sample-thumb-caption">{sample.thumbnailCaption}</span>
    </div>
  );
}

const SCORE_HELP = 'The rounded average of visual and sentiment risk, plus 10 if any ghost entity is found '
  + 'and 5 for each other detected pattern (visual exaggeration, sentiment contradiction, thematic mismatch), '
  + 'capped at 100. 0–30 safe · 31–65 review · 66–100 high risk. A heuristic, not a probability or a platform decision.';

/** The core idea in one picture: the feeling a thumbnail sells vs. the feeling the video delivers. */
function ContradictionExplainer({ onExample }: { onExample: (() => void) | null }) {
  return (
    <section className="tt-explainer" aria-labelledby="tt-explainer-title">
      <div className="tt-explainer-copy">
        <p className="eyebrow"><span className="eyebrow-dot" /> THE IDEA</p>
        <h2 id="tt-explainer-title"><span className="tt-signal-icon" aria-hidden="true">🎭</span>Sentiment contradiction</h2>
        <p>
          Every thumbnail sells a <strong>feeling</strong>. When the video never delivers that feeling (terror on
          the thumbnail, a calm tutorial inside), viewers feel tricked. Keyword filters miss this because the
          topic can match while the emotion is fake. Gemini looks at both and measures the gap.
        </p>
        {onExample && (
          <button type="button" className="project-telos-button journey-cta" onClick={onExample}>
            See the full check on this example <span aria-hidden="true">↓</span>
          </button>
        )}
      </div>

      <div className="tt-explainer-demo">
        <figure className="tt-explainer-side">
          <div className="tt-sample-thumb tone-shock" aria-hidden="true">
            <span className="tt-sample-thumb-text">IT EXPLODED?!</span>
            <span className="tt-sample-thumb-caption">burning supercar · screaming face</span>
          </div>
          <figcaption><small>Thumbnail sells</small><strong>😱 Panic</strong></figcaption>
          <EmotionBar value={95} label="Thumbnail emotional intensity" />
        </figure>
        <div className="tt-explainer-gap" aria-hidden="true"><span>≠</span><small>80-pt gap</small></div>
        <figure className="tt-explainer-side">
          <div className="tt-sample-thumb tone-calm" aria-hidden="true">
            <span className="tt-sample-thumb-text">Car-wash how-to</span>
            <span className="tt-sample-thumb-caption">rinse · foam · dry a hatchback</span>
          </div>
          <figcaption><small>Video delivers</small><strong>😌 Calm</strong></figcaption>
          <EmotionBar value={15} label="Video emotional intensity" />
        </figure>
      </div>

      <div className="tt-explainer-also">
        <span className="tt-muted">Checked in the same pass:</span>
        <ul className="tt-signal-cards">
          <li>
            <span className="tt-signal-icon" aria-hidden="true">👻</span>
            <strong>Ghost entities</strong><small>Shown on the thumbnail, never in the video.</small>
          </li>
          <li>
            <span className="tt-signal-icon" aria-hidden="true">⭕</span>
            <strong>Visual exaggeration</strong><small>Fake arrows, circles, explosions, scale tricks.</small>
          </li>
          <li>
            <span className="tt-signal-icon" aria-hidden="true">🧭</span>
            <strong>Thematic mismatch</strong><small>A different topic or genre than the video delivers.</small>
          </li>
        </ul>
        <details>
          <summary>How is the 0–100 risk score calculated?</summary>
          <p className="tt-muted">{SCORE_HELP}</p>
        </details>
      </div>
    </section>
  );
}

function EmotionBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="tt-emotion-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={value}>
      <span style={{ width: `${value}%` }} />
      <b>{value}</b>
    </div>
  );
}

/** The headline finding: what the thumbnail sells vs. what the video delivers, and the gap between them. */
function EmotionGap({ sentiment }: { sentiment: ThumbnailTruthResult['sentiment'] }) {
  const promised = sentiment.thumbnailIntensity ?? null;
  const delivered = sentiment.videoIntensity ?? null;
  const gap = promised !== null && delivered !== null ? Math.abs(promised - delivered) : null;

  return (
    <article className={`tt-card tt-emotion ${sentiment.contradiction ? 'is-on' : ''}`}>
      <h4>
        Sentiment contradiction
        <span className="tt-emotion-verdict">{sentiment.contradiction ? 'Detected' : 'Not detected'}</span>
      </h4>
      <div className="tt-emotion-rows">
        <div>
          <small>Thumbnail sells</small>
          <strong>{sentiment.thumbnail}</strong>
          {promised !== null && <EmotionBar value={promised} label="Thumbnail emotional intensity" />}
        </div>
        <div className="tt-explainer-gap" aria-hidden="true">
          <span>{sentiment.contradiction ? '≠' : '='}</span>
          {gap !== null && <small>{gap}-pt gap</small>}
        </div>
        <div>
          <small>Video delivers</small>
          <strong>{sentiment.video}</strong>
          {delivered !== null && <EmotionBar value={delivered} label="Video emotional intensity" />}
        </div>
      </div>
      {gap !== null && <p className="sr-only">Emotion gap: {gap} points out of 100.</p>}
      <p className={`tt-flag ${sentiment.thematicMismatch ? 'is-on' : ''}`}>
        Thematic mismatch: {sentiment.thematicMismatch ? 'yes, the topic differs too' : 'no, the topic matches'}
      </p>
    </article>
  );
}

function clipLabel(clip: Clip): string {
  return clip === 'full' ? 'the whole video' : `the first ${formatTimecode(clip)}`;
}

/** What is being analysed and how long it has taken. Steps are typical, not live server state. */
function AnalysisProgress({ mode, clip, onCancel }: { mode: Mode; clip: Clip; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const steps = mode === 'youtube'
    ? ['Fetch the real thumbnail and title', `Gemini watches ${clipLabel(clip)}`, 'Ghost entity scan', 'Sentiment scan']
    : ['Send thumbnail and evidence', 'Ghost entity scan', 'Sentiment scan'];
  const expected = mode === 'youtube' && clip === 'full'
    ? 'Whole videos can take a minute or more.'
    : 'Usually 15–40 seconds.';

  return (
    <div className="tt-progress" role="status" aria-live="polite">
      <div className="tt-progress-head">
        <span className="tt-spinner" aria-hidden="true" />
        <strong>Checking… {elapsed}s</strong>
        <button type="button" className="tt-chip" onClick={onCancel}>Cancel</button>
      </div>
      <div className="tt-progress-bar" aria-hidden="true"><span /></div>
      <ol className="tt-progress-steps">{steps.map((step) => <li key={step}>{step}</li>)}</ol>
      <p className="tt-muted">{expected} Results appear below when the check finishes.</p>
    </div>
  );
}

/** Metadata for the pasted link, and how much of the video to analyse. */
function ClipPicker({ preview, loading, clip, disabled, onClip }: {
  preview: ThumbnailTruthYouTubePreview | null; loading: boolean; clip: Clip; disabled: boolean;
  onClip: (clip: Clip) => void;
}) {
  const [watching, setWatching] = useState(false);
  const videoId = preview?.video.videoId;
  useEffect(() => setWatching(false), [videoId]);
  if (loading) return <p className="tt-wide tt-muted" role="status">Looking up the video…</p>;
  if (!preview) return null;
  const { video, maxFullSeconds } = preview;
  const duration = video.durationSec;
  const tooLong = duration !== null && duration > maxFullSeconds;
  const options: Array<{ clip: Clip; label: string; hint: string }> = [];
  if (duration === null || duration > QUICK_CLIP_SECONDS) {
    options.push({ clip: QUICK_CLIP_SECONDS, label: 'First minute', hint: 'Fastest · recommended' });
  }
  if (duration === null || duration > LONG_CLIP_SECONDS) {
    options.push({ clip: LONG_CLIP_SECONDS, label: 'First 5 minutes', hint: 'Slower, more evidence' });
  }
  options.push({
    clip: 'full', label: 'Whole video',
    hint: tooLong ? `Over the ${formatTimecode(maxFullSeconds)} limit` : 'Slowest, full evidence',
  });

  return (
    <div className="tt-wide tt-clip">
      <div className="tt-clip-video">
        <img src={`https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`} alt="" />
        <div>
          <strong>{video.title}</strong>
          <span className="tt-muted">
            {video.channel}{duration !== null ? ` · ${formatTimecode(duration)}` : ' · length unknown'}
          </span>
          <button type="button" className="tt-chip" aria-pressed={watching} onClick={() => setWatching((on) => !on)}>
            {watching ? 'Hide player' : '▶ Watch here'}
          </button>
        </div>
      </div>
      {watching && <YouTubePlayer videoId={video.videoId} title={video.title} />}
      {options.length > 1 && (
        <div className="tt-mode tt-clip-options" role="group" aria-label="How much of the video to analyse">
          {options.map((option) => (
            <button key={String(option.clip)} type="button" aria-pressed={clip === option.clip}
              disabled={disabled || (option.clip === 'full' && tooLong)} onClick={() => onClip(option.clip)}>
              {option.label}<small>{option.hint}</small>
            </button>
          ))}
        </div>
      )}
      {clip !== 'full' && (
        <p className="tt-muted">
          Only {clipLabel(clip)} is analysed. Anything later in the video is not checked against the thumbnail.
        </p>
      )}
    </div>
  );
}

/** Concrete edits for each finding, so the creator knows exactly what to change. */
function fixesFor(result: ThumbnailTruthResult): string[] {
  if (result.band === 'safe') return [];
  const fixes = result.ghostTracker
    .filter((item) => item.status === 'ghost')
    .map((item) => `Remove “${item.entity}” from the thumbnail: it never appears in the video.`);
  if (result.visualExaggeration.detected) {
    fixes.push(`Remove the added graphics that exaggerate the video: ${result.visualExaggeration.details}`);
  }
  if (result.sentiment.contradiction) {
    fixes.push(`Match the mood: the thumbnail sells ${result.sentiment.thumbnail.toLowerCase()}, `
      + `but the video feels ${result.sentiment.video.toLowerCase()}.`);
  }
  if (result.sentiment.thematicMismatch) {
    fixes.push(result.actualTopics?.length
      ? `Show the real topic: ${result.actualTopics.join(', ')}.`
      : 'Show the topic the video is actually about.');
  }
  if (result.remediationTip && !fixes.includes(result.remediationTip)) fixes.push(result.remediationTip);
  return fixes;
}

function FixList({ result, title, onRevise, onShowFix }: {
  result: ThumbnailTruthResult; title: string; onRevise: () => void; onShowFix: (() => void) | null;
}) {
  const fixes = fixesFor(result);
  const suggestTitle = result.improvedTitle && result.improvedTitle !== title;
  return (
    <article className="tt-card tt-fixes">
      <h4>What to change before publishing</h4>
      {fixes.length
        ? <ol>{fixes.map((fix) => <li key={fix}>{fix}</li>)}</ol>
        : <p className="tt-muted">Nothing to change: the thumbnail keeps the video's promise.</p>}
      {suggestTitle && <p className="tt-tip"><strong>Suggested title:</strong> {result.improvedTitle}</p>}
      {(fixes.length > 0 || onShowFix) && (
        <div className="tt-fix-actions">
          {fixes.length > 0 && (
            <button type="button" className="project-telos-button secondary" onClick={onRevise}>
              Revise draft and recheck
            </button>
          )}
          {onShowFix && (
            <button type="button" className="project-telos-button journey-cta" onClick={onShowFix}>
              See the fixed version <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function Diagnostics({ result, title, onRevise, onShowFix }: {
  result: ThumbnailTruthResult; title: string; onRevise: () => void; onShowFix: (() => void) | null;
}) {
  const ghosts = result.ghostTracker.filter((item) => item.status === 'ghost').length;
  const player = useRef<YouTubePlayerHandle>(null);
  const video = result.youtubeVideo;

  function jumpTo(seconds: number) {
    player.current?.seek(seconds);
    player.current?.play();
  }

  return (
    <section className="tt-results" aria-labelledby="tt-results-title" aria-live="polite">
      <div className="tt-results-head">
        <h3 id="tt-results-title">Your thumbnail check</h3>
        <span className={`tt-source ${result.source === 'gemini' ? 'is-live' : ''}`}>
          {result.source === 'gemini' ? `Live Gemini · ${result.model}` : 'Reviewed sample · no model call'}
        </span>
      </div>
      <p className={`tt-source-banner ${result.source === 'gemini' ? 'is-live' : ''}`}>
        {result.source === 'gemini'
          ? <><strong>Live check.</strong> Gemini analysed this {result.youtubeVideo ? 'video' : 'draft'} just now.</>
          : <><strong>Reviewed example.</strong> A precomputed result that shows what a check returns. No AI call was made.</>}
      </p>
      {(result.youtubeVideo || result.translation || result.analysedWindowSec != null) && (
        <div className="tt-badges">
          {result.youtubeVideo && (
            <a className="project-telos-pill" href={result.youtubeVideo.canonicalUrl} target="_blank" rel="noreferrer">
              ▶ {result.youtubeVideo.title} · {result.youtubeVideo.channel}
            </a>
          )}
          {result.analysedWindowSec != null && (
            <span className="project-telos-pill">
              Analysed first {formatTimecode(result.analysedWindowSec)}
              {result.youtubeVideo?.durationSec != null && ` of ${formatTimecode(result.youtubeVideo.durationSec)}`}
            </span>
          )}
          {result.translation && (
            <span className="project-telos-pill">
              {result.translation.translated
                ? `Translated from ${result.translation.detectedLanguage} · ${result.translation.provider}`
                : `Language: ${result.translation.detectedLanguage} · no translation needed`}
            </span>
          )}
        </div>
      )}

      {video && (
        <div className="tt-result-player">
          <YouTubePlayer ref={player} videoId={video.videoId} title={video.title} />
          <p className="tt-muted">Select a timestamp below to jump to that moment.</p>
        </div>
      )}

      <div className="tt-summary">
        <div className="tt-score-row">
          <RiskGauge result={result} />
          <div>
            <p className={`tt-band band-${result.band}`}>{result.bandLabel}</p>
            {result.riskScore !== null && (
              <p className="tt-verdict">
                Your thumbnail sells <strong>{result.sentiment.thumbnail.toLowerCase()}</strong>; your video
                delivers <strong>{result.sentiment.video.toLowerCase()}</strong>
                {ghosts > 0 && <>, and shows {ghosts} thing{ghosts === 1 ? '' : 's'} the video never does</>}.
              </p>
            )}
            <p className="tt-scale">A signal to review, not proof of intent · 0–30 matches · 31–65 worth a look · 66–100 strong mismatch</p>
            {result.breakdown && (
              <p className="tt-breakdown">
                Visual risk {result.breakdown.visualRisk} · Sentiment risk {result.breakdown.sentimentRisk}
                {' '}→ average + {result.breakdown.penalties} pattern penalties
              </p>
            )}
          </div>
        </div>

        <article className="tt-card tt-proof">
          <h4>The proof: promised vs. found</h4>
          <dl className="tt-sentiment">
            <div><dt>Promised topics</dt><dd>{result.promisedTopics?.join(', ') || 'No separate topic list supplied'}</dd></div>
            <div><dt>Observed topics</dt><dd>{result.actualTopics?.join(', ') || 'See observations below'}</dd></div>
          </dl>
          {result.evidence?.length ? <ul className="tt-evidence">
            {result.evidence.map((row, index) => <li key={index}>
              {row.startSec !== null && row.endSec !== null ? (
                video ? (
                  <button type="button" className="tt-timestamp" onClick={() => jumpTo(row.startSec!)}
                    aria-label={`Play from ${formatTimecode(row.startSec)}`}>
                    ▶ {formatTimecode(row.startSec)}–{formatTimecode(row.endSec)}
                  </button>
                ) : <strong>{formatTimecode(row.startSec)}–{formatTimecode(row.endSec)}</strong>
              ) : <strong>No timestamp supplied</strong>}
              <p>Promise: {row.promised}</p>
              <p>Observed: {row.observed}</p>
            </li>)}
          </ul> : <p className="tt-muted">No timestamped observations supplied. The rationale below explains the available evidence.</p>}
        </article>
      </div>

      <EmotionGap sentiment={result.sentiment} />

      <FixList result={result} title={title} onRevise={onRevise} onShowFix={onShowFix} />

      <div className="tt-grid">
        <article className="tt-card">
          <h4>Ghost entity tracker <span>{ghosts} ghost{ghosts === 1 ? '' : 's'}</span></h4>
          {result.ghostTracker.length === 0
            ? <p className="tt-muted">No prominent entities were listed.</p>
            : <ul className="tt-entities">
              {result.ghostTracker.map((item) => (
                <li key={item.entity} className={`entity-${item.status}`}>
                  <span aria-hidden="true">{item.status === 'ghost' ? '✕' : item.status === 'verified' ? '✓' : '?'}</span>
                  {item.entity}
                  <small>
                    {item.status === 'ghost' ? 'in thumbnail, not in video'
                      : item.status === 'verified' ? 'confirmed in video' : 'not confirmed either way'}
                  </small>
                </li>
              ))}
            </ul>}
          <p className={`tt-flag ${result.visualExaggeration.detected ? 'is-on' : ''}`}>
            Visual exaggeration: {result.visualExaggeration.detected ? 'detected' : 'not detected'}
            <span>{result.visualExaggeration.details}</span>
          </p>
        </article>
        <article className="tt-card">
          <h4>Why this score</h4>
          <ol className="tt-rationale-list">{result.rationale.map((line) => <li key={line}>{line}</li>)}</ol>
        </article>
      </div>
      <p className="tt-note">{result.note}</p>
    </section>
  );
}

/** Before vs. after a revision: the payoff of the fix-and-recheck loop. Only shown for a real new check. */
function RecheckComparison({ before, after, afterTitle }: {
  before: Baseline; after: ThumbnailTruthResult; afterTitle: string;
}) {
  const afterLabel = after.source === 'gemini' ? 'After your revision' : 'After the reviewed fix';
  if (after.riskScore === null) return null;
  const change = after.riskScore - before.score;
  return (
    <section className="tt-recheck" aria-label="Before and after your revision">
      <div className={`tt-recheck-side band-${before.band}`}>
        <small>Before</small><strong>{before.score}</strong><span>{before.title}</span>
      </div>
      <span className="tt-recheck-arrow" aria-hidden="true">→</span>
      <div className={`tt-recheck-side band-${after.band}`}>
        <small>{afterLabel}</small><strong>{after.riskScore}</strong><span>{afterTitle}</span>
      </div>
      <p className={change < 0 ? 'is-better' : change > 0 ? 'is-worse' : ''}>
        {change < 0 ? `Risk down ${-change} points` : change > 0 ? `Risk up ${change} points` : 'No change in risk'}
      </p>
    </section>
  );
}

/** This creator's recent checks, newest first, so revisions can be compared over time. */
function History({ entries, storage, onClear }: {
  entries: ThumbnailTruthHistoryEntry[]; storage: 'local' | 'firestore'; onClear: () => void;
}) {
  return (
    <section className="tt-panel" aria-labelledby="tt-history-title">
      <div className="tt-panel-head">
        <h2 id="tt-history-title">Your recent checks</h2>
        <span className="tt-history-actions">
          <span className="tt-muted">{storage === 'firestore' ? 'Saved in Firestore' : 'Saved on this server'}</span>
          <button type="button" className="tt-chip" onClick={onClear}>Clear history</button>
        </span>
      </div>
      <ol className="tt-history">
        {entries.map((entry) => (
          <li key={entry.id} className={`band-${entry.band}`}>
            <strong className="tt-history-score">{entry.riskScore ?? '—'}</strong>
            <span className="tt-history-title">{entry.title}</span>
            <small>
              {entry.emotionGap !== null && `${entry.emotionGap}-pt emotion gap · `}
              {entry.ghostEntities} ghost{entry.ghostEntities === 1 ? '' : 's'}
              {' · '}{entry.source === 'youtube-link' ? 'YouTube link' : 'Draft upload'}
              {' · '}{new Date(entry.checkedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </small>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Imagen suggestion for a flagged result. Sends only the title and the model's video summary. */
function Redesign({ result, title, status, onUse }: {
  result: ThumbnailTruthResult; title: string; status: ThumbnailTruthStatus | null;
  onUse: (image: ThumbnailRedesignResult) => void;
}) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<ThumbnailRedesignResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  if (result.band !== 'review' && result.band !== 'high') return null;
  const configured = status?.imagenConfigured ?? false;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const suggestion = await api.thumbnailTruthRedesign({
        title: title.slice(0, 150),
        videoSummary: result.sentiment.video.slice(0, 600),
        avoid: result.ghostTracker.filter((item) => item.status === 'ghost').map((item) => item.entity).slice(0, 10),
        remediationTip: result.remediationTip.slice(0, 300),
        consentToGoogleAnalysis: true,
      });
      if (mounted.current) setImage(suggestion);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Imagen could not generate a suggestion');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section className="tt-card tt-redesign" aria-labelledby="tt-redesign-title">
      <h4 id="tt-redesign-title">Suggest an honest thumbnail <span>Imagen{status?.imagenModel ? ` · ${status.imagenModel}` : ''}</span></h4>
      {!configured ? (
        <p className="tt-muted">Imagen suggestions need the same live Gemini configuration (a billing-enabled key).</p>
      ) : (
        <>
          <label className="tt-consent">
            <input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />
            Send the title and the video summary above (not your files) to Google Imagen.
          </label>
          <button type="button" className="project-telos-button secondary" disabled={!consent || busy || !title.trim()}
            onClick={() => void generate()}>
            {busy ? 'Generating with Imagen…' : 'Generate honest thumbnail'}
          </button>
        </>
      )}
      {error && <p role="alert" className="tt-error">{error}</p>}
      {image && (
        <figure>
          <img src={`data:${image.mimeType};base64,${image.imageBase64}`} alt={`Imagen thumbnail suggestion for ${title}`} />
          <figcaption className="tt-muted">{image.note}</figcaption>
          <button type="button" className="project-telos-button secondary" onClick={() => onUse(image)}>
            Use this thumbnail in a new check
          </button>
        </figure>
      )}
    </section>
  );
}

/** Creator-side, pre-upload check: does the thumbnail keep the video's promise? */
export function ThumbnailTruth() {
  const [status, setStatus] = useState<ThumbnailTruthStatus | null>(null);
  const [samples, setSamples] = useState<ThumbnailTruthSample[]>([]);
  const [selectedSample, setSelectedSample] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<PickedFile | null>(null);
  const [video, setVideo] = useState<PickedFile | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [transcript, setTranscript] = useState('');
  const [region, setRegion] = useState('');
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState<Mode>('upload');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [preview, setPreview] = useState<ThumbnailTruthYouTubePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [clip, setClip] = useState<Clip>(QUICK_CLIP_SECONDS);
  const [result, setResult] = useState<ThumbnailTruthResult | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisionNote, setRevisionNote] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  // Set by a revision and used by the next successful check only.
  const pendingBaseline = useRef<Baseline | null>(null);
  const [creatorId] = useState(creatorIdentity);
  const [history, setHistory] = useState<ThumbnailTruthHistoryEntry[]>([]);
  const mounted = useRef(true);
  const inFlight = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (result) resultsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [result]);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const [capabilities, reviewed] = await Promise.all([api.thumbnailTruthStatus(), api.thumbnailTruthSamples()]);
        if (!mounted.current) return;
        setStatus(capabilities);
        setSamples(reviewed);
      } catch (cause) {
        if (mounted.current) setError(cause instanceof Error ? cause.message : 'ThumbnailTruth is unavailable');
      }
    })();
    void refreshHistory();
    return () => { mounted.current = false; };
  }, []);

  /** History is a convenience: failing to load it never blocks a check. */
  async function refreshHistory() {
    if (!creatorId) return;
    try {
      const entries = await api.thumbnailTruthHistory(creatorId);
      if (mounted.current) setHistory(entries);
    } catch {
      // Leave the last known history in place.
    }
  }

  async function clearHistory() {
    if (!creatorId) return;
    try {
      await api.thumbnailTruthForgetHistory(creatorId);
      if (mounted.current) setHistory([]);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not clear your history');
    }
  }

  // Look up the pasted link (title, length) so the creator can choose how much to analyse.
  useEffect(() => {
    const url = youtubeUrl.trim();
    setPreview(null);
    if (mode !== 'youtube' || !url) { setPreviewing(false); return; }
    const controller = new AbortController();
    setPreviewing(true);
    const timer = window.setTimeout(async () => {
      try {
        const found = await api.thumbnailTruthYoutubePreview(url, controller.signal);
        if (controller.signal.aborted) return;
        setPreview(found);
        const duration = found.video.durationSec;
        setClip(duration !== null && duration <= QUICK_CLIP_SECONDS ? 'full' : QUICK_CLIP_SECONDS);
      } catch {
        // Not fatal: the check itself reports invalid or unavailable links.
      } finally {
        if (!controller.signal.aborted) setPreviewing(false);
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [mode, youtubeUrl]);

  async function pick(file: File | null, kind: 'thumbnail' | 'video') {
    setError(null);
    const setter = kind === 'thumbnail' ? setThumbnail : setVideo;
    if (!file) { setter(null); return; }
    const allowed = kind === 'thumbnail' ? IMAGE_TYPES : VIDEO_TYPES;
    const limit = kind === 'thumbnail' ? status?.maxThumbnailBytes : status?.maxVideoBytes;
    if (!allowed.includes(file.type)) {
      setError(kind === 'thumbnail' ? 'Thumbnail must be JPEG, PNG, or WebP.' : 'Draft video must be MP4, WebM, or MOV.');
      return;
    }
    if (limit && file.size > limit) {
      setError(`${file.name} is larger than the ${megabytes(limit)} prototype limit.`);
      return;
    }
    try {
      const picked = await readFile(file);
      if (mounted.current) setter(picked);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not read the file');
    }
  }

  function showSample(sample: ThumbnailTruthSample) {
    setSelectedSample(sample.id);
    setResult(sample.result);
    setError(null);
    setRevisionNote(null);
    setBaseline(null);
    pendingBaseline.current = null;
  }

  /** Show a sample's reviewed fix, compared with the sample it fixes. */
  function showFix(original: ThumbnailTruthSample, fixed: ThumbnailTruthSample) {
    showSample(fixed);
    if (original.result.riskScore !== null) {
      setBaseline({ score: original.result.riskScore, band: original.result.band, title: original.title });
    }
  }

  function revise(image?: ThumbnailRedesignResult) {
    if (!result) return;
    pendingBaseline.current = result.riskScore === null
      ? null : { score: result.riskScore, band: result.band, title: resultTitle };
    if (sample) {
      setDescription(sample.description);
      setTranscript(sample.transcript);
      setRegion(sample.region);
      setThumbnail(null);
      setVideo(null);
    }
    if (result.youtubeVideo) {
      setThumbnail(null);
      setVideo(null);
    }
    setTitle(result.improvedTitle || resultTitle);
    if (image) {
      setThumbnail({
        name: 'imagen-suggestion.png', size: Math.floor(image.imageBase64.length * 3 / 4),
        upload: { mimeType: image.mimeType, dataBase64: image.imageBase64 },
        preview: `data:${image.mimeType};base64,${image.imageBase64}`,
      });
    }
    setMode('upload');
    setSelectedSample(null);
    setResult(null);
    setConsent(false);
    setError(null);
    setRevisionNote('Revise the title and thumbnail below, add the video or transcript, then approve a fresh check. No revised score is assumed.');
    draftRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  async function verify() {
    if (analysing || (mode === 'upload' ? !thumbnail : !youtubeUrl.trim())) return;
    setAnalysing(true);
    setSelectedSample(null);
    setResult(null);
    setBaseline(null);
    setError(null);
    setRevisionNote(null);
    const controller = new AbortController();
    inFlight.current = controller;
    const identity = creatorId ? { creatorId } : {};
    try {
      const verdict = mode === 'youtube'
        ? await api.thumbnailTruthAnalyseYoutube({
          url: youtubeUrl.trim(), transcript, region, consentToGoogleAnalysis: consent,
          ...(clip !== 'full' ? { clipSeconds: clip } : {}), ...identity,
        }, controller.signal)
        : await api.thumbnailTruthAnalyse({
          title, description, transcript, region,
          thumbnail: thumbnail!.upload,
          ...(video ? { video: video.upload } : {}),
          consentToGoogleAnalysis: consent, ...identity,
        }, controller.signal);
      if (mounted.current) {
        setResult(verdict);
        setBaseline(pendingBaseline.current);
        pendingBaseline.current = null;
      }
      void refreshHistory();
    } catch (cause) {
      if (!mounted.current) return;
      if (controller.signal.aborted) setError('Check cancelled. No verdict was produced.');
      else setError(cause instanceof Error ? cause.message : 'Analysis failed; no verdict was produced');
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      if (mounted.current) setAnalysing(false);
    }
  }

  function cancel() {
    inFlight.current?.abort();
  }

  const live = status?.liveConfigured ?? false;
  const ready = mode === 'upload'
    ? !!thumbnail && title.trim().length > 0 && (!!video || transcript.trim().length > 0)
    : youtubeUrl.trim().length > 0;
  const canVerify = live && consent && ready && !analysing;
  const sample = samples.find((item) => item.id === selectedSample);
  const fixedSample = sample ? samples.find((item) => item.revisionOf === sample.id) : undefined;
  const resultTitle = result?.youtubeVideo?.title ?? (sample ? sample.title : title);

  const explainerSample = samples.find((item) => item.id === 'ghost-supercar');

  return (
    <div className="tt-shell" data-testid="thumbnail-truth">
      <ContradictionExplainer onExample={explainerSample ? () => showSample(explainerSample) : null} />

      <section ref={draftRef} className="tt-panel" aria-labelledby="tt-upload-title">
        <div className="tt-panel-head">
          <h2 id="tt-upload-title">Check your draft</h2>
          <span className={`tt-source ${live ? 'is-live' : ''}`}>
            {live ? `Gemini configured · ${status?.model}` : 'Live check not configured'}
          </span>
        </div>
        {revisionNote && <p role="status" className="tt-muted">{revisionNote}</p>}
        {status && !live && (
          <p className="tt-muted tt-config-note">
            Live Gemini checks are switched off on this deployment. The reviewed examples below show exactly
            what a live check returns; Project Telos never invents a score for an upload it has not analysed.
          </p>
        )}

        <div className="tt-mode" role="group" aria-label="What to check">
          <button type="button" aria-pressed={mode === 'upload'} disabled={analysing}
            onClick={() => setMode('upload')}>Draft upload</button>
          <button type="button" aria-pressed={mode === 'youtube'} disabled={analysing}
            onClick={() => setMode('youtube')}>Published YouTube link</button>
        </div>

        {mode === 'youtube' ? (
          <div className="tt-fields">
            <label className="tt-wide">Public YouTube video link
              <input type="url" value={youtubeUrl} maxLength={2048} disabled={analysing}
                placeholder="https://www.youtube.com/watch?v=..."
                onChange={(event) => setYoutubeUrl(event.target.value)} />
            </label>
            <div className="tt-wide tt-chips" role="group" aria-label="Sample YouTube links">
              <span className="tt-muted">Try a sample:</span>
              {SAMPLE_YOUTUBE_LINKS.map((link) => (
                <button key={link.url} type="button" className="tt-chip" disabled={analysing}
                  aria-pressed={youtubeUrl === link.url} onClick={() => setYoutubeUrl(link.url)}>{link.label}</button>
              ))}
            </div>
            <ClipPicker preview={preview} loading={previewing} clip={clip} disabled={analysing} onClip={setClip} />
            <p className="tt-wide tt-muted">
              Project Telos fetches the real thumbnail and title from YouTube, then Gemini watches the public video
              itself. Long videos can be checked by their opening minutes; whole videos up to 20 minutes.
            </p>
          </div>
        ) : (
        <div className="tt-drops">
          <DropZone id="tt-thumbnail" label="Upload custom thumbnail" hint="JPEG, PNG, or WebP · up to 4 MB"
            accept={IMAGE_TYPES} file={thumbnail} disabled={analysing}
            onFile={(file) => void pick(file, 'thumbnail')} />
          <DropZone id="tt-video" label="Upload draft video (optional)" hint="MP4, WebM, or MOV · up to 15 MB"
            accept={VIDEO_TYPES} file={video} disabled={analysing}
            onFile={(file) => void pick(file, 'video')} />
          <p className="tt-wide tt-muted">
            The video is optional: upload it for a direct check, or paste a transcript below instead.
            Without either, there is not enough evidence to score the draft.
          </p>
        </div>
        )}

        <div className="tt-fields">
          {mode === 'upload' && <>
          <label>Video title
            <input value={title} maxLength={150} required disabled={analysing}
              onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>Audience region (optional)
            <input value={region} maxLength={60} placeholder="e.g. India" disabled={analysing}
              onChange={(event) => setRegion(event.target.value)} />
          </label>
          <label className="tt-wide">Description
            <textarea value={description} maxLength={5000} rows={2} disabled={analysing}
              onChange={(event) => setDescription(event.target.value)} />
          </label>
          </>}
          {mode === 'youtube' && (
            <label className="tt-wide">Audience region (optional)
              <input value={region} maxLength={60} placeholder="e.g. India" disabled={analysing}
                onChange={(event) => setRegion(event.target.value)} />
            </label>
          )}
          <label className="tt-wide">Transcript or subtitles{mode === 'youtube' ? ' (optional)' : ''}
            <textarea value={transcript} maxLength={20000} rows={4} disabled={analysing}
              placeholder={mode === 'youtube'
                ? 'Optional. Gemini already watches and listens to the public video.'
                : 'Paste subtitles if you are not uploading the video.'}
              onChange={(event) => setTranscript(event.target.value)} />
          </label>
        </div>

        <label className="tt-consent">
          <input type="checkbox" checked={consent} disabled={analysing}
            onChange={(event) => setConsent(event.target.checked)} />
          {mode === 'youtube'
            ? 'I agree to send this public video link, its thumbnail, and any transcript to Google Gemini for analysis.'
            : 'I agree to send this thumbnail, text, and optional video to Google Gemini for analysis. Project Telos does not store the files.'}
          {status?.translationEnabled && ' Non-English text is also translated with Google Cloud Translation.'}
          {creatorId && ' The title and score are kept in your recent checks so you can compare revisions.'}
        </label>

        <button type="button" className="project-telos-button journey-cta tt-verify" disabled={!canVerify} onClick={() => void verify()}>
          {analysing ? 'Checking…' : 'Check my thumbnail'}
        </button>
        {analysing && <AnalysisProgress mode={mode} clip={clip} onCancel={cancel} />}
      </section>

      <section className="tt-panel" aria-labelledby="tt-samples-title">
        <div className="tt-panel-head">
          <h2 id="tt-samples-title">Try a reviewed example</h2>
          <span className="tt-muted">Precomputed results · no model call</span>
        </div>
        <div className="tt-samples" role="group" aria-label="Reviewed sample submissions">
          {samples.filter((item) => !item.revisionOf).map((item) => (
            <button key={item.id} type="button" aria-pressed={selectedSample === item.id}
              className={`tt-sample band-${item.result.band}`} onClick={() => showSample(item)}>
              <span>{item.label}</span>
              <small>{item.region} · score {item.result.riskScore}</small>
            </button>
          ))}
        </div>
        {sample && (
          <div className="tt-sample-detail">
            <SampleThumbnail sample={sample} />
            <dl>
              <div><dt>Title</dt><dd>{sample.title}</dd></div>
              <div><dt>Description</dt><dd>{sample.description}</dd></div>
              <div><dt>Transcript excerpt</dt><dd>{sample.transcript}</dd></div>
            </dl>
          </div>
        )}
      </section>

      {history.length > 0 && (
        <History entries={history} storage={status?.historyStorage ?? 'local'} onClear={() => void clearHistory()} />
      )}

      {error && <p role="alert" className="tt-error">{error}</p>}
      {result && <div ref={resultsRef}>
        {baseline && <RecheckComparison before={baseline} after={result} afterTitle={resultTitle} />}
        <Diagnostics result={result} title={resultTitle} onRevise={() => revise()}
          onShowFix={sample && fixedSample ? () => showFix(sample, fixedSample) : null} />
        <Redesign key={`${result.source}-${result.riskScore}-${resultTitle}`} result={result} title={resultTitle} status={status}
          onUse={(image) => revise(image)} />
      </div>}
    </div>
  );
}
