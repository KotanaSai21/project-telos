import { useEffect, useRef, useState, type DragEvent } from 'react';

import { api } from '../api/client';
import { SAMPLE_YOUTUBE_LINKS } from '../api/samples';
import { formatTimecode } from '../playback/gate';
import type {
  MediaUpload,
  ThumbnailRedesignResult,
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
        ? 'Deception risk not scored: insufficient evidence'
        : `Deception risk ${result.riskScore} out of 100: ${result.bandLabel}`}>
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
        <strong>Verifying… {elapsed}s</strong>
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
        </div>
      </div>
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

function Diagnostics({ result }: { result: ThumbnailTruthResult }) {
  const ghosts = result.ghostTracker.filter((item) => item.status === 'ghost').length;
  return (
    <section className="tt-results" aria-labelledby="tt-results-title" aria-live="polite">
      <div className="tt-results-head">
        <h3 id="tt-results-title">Integrity diagnostics</h3>
        <span className={`tt-source ${result.source === 'gemini' ? 'is-live' : ''}`}>
          {result.source === 'gemini' ? `Live Gemini · ${result.model}` : 'Reviewed sample · no model call'}
        </span>
      </div>
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

      <div className="tt-score-row">
        <RiskGauge result={result} />
        <div>
          <p className={`tt-band band-${result.band}`}>{result.bandLabel}</p>
          {result.breakdown && (
            <p className="tt-breakdown">
              Visual risk {result.breakdown.visualRisk} · Sentiment risk {result.breakdown.sentimentRisk}
              {' '}→ average + {result.breakdown.penalties} pattern penalties
            </p>
          )}
          <p className="tt-scale">0–30 safe · 31–65 review · 66–100 held. Heuristic bands, not a probability.</p>
        </div>
      </div>

      <div className="tt-grid">
        <article className="tt-card">
          <h4>The promise vs. the content</h4>
          <dl className="tt-sentiment">
            <div><dt>Promised topics</dt><dd>{result.promisedTopics?.join(', ') || 'No separate topic list supplied'}</dd></div>
            <div><dt>Observed topics</dt><dd>{result.actualTopics?.join(', ') || 'See observations below'}</dd></div>
          </dl>
          {result.evidence?.length ? <ul className="tt-evidence">
            {result.evidence.map((row, index) => <li key={index}>
              <strong>{row.startSec !== null && row.endSec !== null
                ? `${formatTimecode(row.startSec)}–${formatTimecode(row.endSec)}` : 'No timestamp supplied'}</strong>
              <p>Promise: {row.promised}</p>
              <p>Observed: {row.observed}</p>
            </li>)}
          </ul> : <p className="tt-muted">No timestamped observations supplied. The rationale below explains the available evidence.</p>}
        </article>
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
          <h4>Sentiment alignment</h4>
          <dl className="tt-sentiment">
            <div><dt>Thumbnail projects</dt><dd>{result.sentiment.thumbnail}</dd></div>
            <div><dt>Video actually feels</dt><dd>{result.sentiment.video}</dd></div>
          </dl>
          <p className={`tt-flag ${result.sentiment.contradiction ? 'is-on' : ''}`}>
            Sentiment contradiction: {result.sentiment.contradiction ? 'yes' : 'no'}
          </p>
          <p className={`tt-flag ${result.sentiment.thematicMismatch ? 'is-on' : ''}`}>
            Thematic mismatch: {result.sentiment.thematicMismatch ? 'yes' : 'no'}
          </p>
        </article>
      </div>

      <article className="tt-card tt-rationale">
        <h4>Model rationale</h4>
        <ol>{result.rationale.map((line) => <li key={line}>{line}</li>)}</ol>
        <p className="tt-tip"><strong>Fix before publishing:</strong> {result.remediationTip}</p>
        {result.improvedTitle && <p className="tt-tip"><strong>Suggested title:</strong> {result.improvedTitle}</p>}
      </article>
      <p className="tt-note">{result.note}</p>
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
    return () => { mounted.current = false; };
  }, []);

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
  }

  function revise(image?: ThumbnailRedesignResult) {
    if (!result) return;
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
    setError(null);
    setRevisionNote(null);
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const verdict = mode === 'youtube'
        ? await api.thumbnailTruthAnalyseYoutube({
          url: youtubeUrl.trim(), transcript, region, consentToGoogleAnalysis: consent,
          ...(clip !== 'full' ? { clipSeconds: clip } : {}),
        }, controller.signal)
        : await api.thumbnailTruthAnalyse({
          title, description, transcript, region,
          thumbnail: thumbnail!.upload,
          ...(video ? { video: video.upload } : {}),
          consentToGoogleAnalysis: consent,
        }, controller.signal);
      if (mounted.current) setResult(verdict);
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
  const resultTitle = result?.youtubeVideo?.title ?? (sample ? sample.title : title);

  return (
    <div className="tt-shell" data-testid="thumbnail-truth">
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
            Live checks need PROJECT_TELOS_PROVIDER=gemini with an API key, or vertex with a Google Cloud project
            and credentials. Until then, use the reviewed
            samples; Project Telos never invents a score for an upload it has not analysed.
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
        </label>

        <button type="button" className="project-telos-button journey-cta tt-verify" disabled={!canVerify} onClick={() => void verify()}>
          {analysing ? 'Verifying…' : 'Verify platform integrity'}
        </button>
        {analysing && <AnalysisProgress mode={mode} clip={clip} onCancel={cancel} />}
      </section>

      <section className="tt-panel" aria-labelledby="tt-samples-title">
        <div className="tt-panel-head">
          <h2 id="tt-samples-title">Try a reviewed example</h2>
          <span className="tt-muted">Precomputed results · no model call</span>
        </div>
        <div className="tt-samples" role="group" aria-label="Reviewed sample submissions">
          {samples.map((item) => (
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

      {error && <p role="alert" className="tt-error">{error}</p>}
      {result && <div ref={resultsRef}>
        <Diagnostics result={result} />
        <button type="button" className="project-telos-button secondary" onClick={() => revise()}>
          Revise draft and recheck
        </button>
        <Redesign key={`${result.source}-${result.riskScore}-${resultTitle}`} result={result} title={resultTitle} status={status}
          onUse={(image) => revise(image)} />
      </div>}
    </div>
  );
}
