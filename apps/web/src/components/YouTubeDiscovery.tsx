import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api/client';
import { viewerSampleGroups } from '../api/samples';
import type { ConsentProfile, YouTubeAudit, YouTubeCandidate, YouTubeSearch, YouTubeStatus } from '../api/types';
import { formatTimecode } from '../playback/gate';

function mergeLinked(current: YouTubeSearch | null, profileId: string, video: YouTubeCandidate): YouTubeSearch {
  const others = (current?.videos ?? []).filter((row) => row.videoId !== video.videoId);
  return current
    ? { ...current, videos: [video, ...others] }
    : {
      profileId, query: '(pasted links)', videos: [video], source: 'Pasted links · YouTube oEmbed',
      note: 'Pasted candidates only, not consent-approved content. Nothing is analysed until you choose.',
    };
}

/** Official discovery is separate from AI auditing and explicit external playback. */
export function YouTubeDiscovery({ profile }: { profile: ConsentProfile }) {
  const [status, setStatus] = useState<YouTubeStatus | null>(null);
  const [search, setSearch] = useState<YouTubeSearch | null>(null);
  const [result, setResult] = useState<YouTubeAudit | null>(null);
  const [searching, setSearching] = useState(true);
  const [analysing, setAnalysing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approveAnalysis, setApproveAnalysis] = useState(false);
  const [approveOverride, setApproveOverride] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [retry, setRetry] = useState(0);
  const [link, setLink] = useState('');
  const [linking, setLinking] = useState(false);
  const mounted = useRef(true);
  const pendingAnalysis = useRef(false);
  const sampleGroups = useMemo(() => viewerSampleGroups(profile), [profile]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    setSearch(null);
    setResult(null);
    setPlaying(false);
    setApproveOverride(false);
    setError(null);
    (async () => {
      try {
        const capabilities = await api.youtubeStatus();
        if (cancelled) return;
        setStatus(capabilities);
        if (!capabilities.searchConfigured) return;
        const candidates = await api.youtubeSearch(profile.id);
        if (!cancelled) setSearch(candidates);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'YouTube discovery failed');
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile.id, retry]);

  async function addLink(url: string) {
    const trimmed = url.trim();
    if (!trimmed || linking) return;
    setLinking(true);
    setError(null);
    try {
      const added = await api.youtubeLink(profile.id, trimmed);
      if (!mounted.current) return;
      setSearch((current) => mergeLinked(current, profile.id, added.video));
      setLink('');
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not add that YouTube link');
    } finally {
      if (mounted.current) setLinking(false);
    }
  }

  async function analyse(videoId: string) {
    if (pendingAnalysis.current || !approveAnalysis) return;
    pendingAnalysis.current = true;
    setAnalysing(videoId);
    setResult(null);
    setPlaying(false);
    setApproveOverride(false);
    setError(null);
    try {
      const audit = await api.youtubeAnalyse(profile.id, videoId);
      if (mounted.current) setResult(audit);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Gemini analysis failed; no verdict is available');
    } finally {
      pendingAnalysis.current = false;
      if (mounted.current) setAnalysing(null);
    }
  }

  return (
    <section data-testid="youtube-discovery" className="project-telos-panel mt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Live YouTube for your intent</h2>
          <p className="mt-2 text-xs leading-6 text-slate-400">
            Declared interests → YouTube Data API search (or your pasted links) → selected-video Gemini audit → your playback choice.
          </p>
        </div>
        <button type="button" className="project-telos-button secondary" disabled={searching || analysing !== null}
          onClick={() => setRetry((value) => value + 1)}>Refresh YouTube search</button>
      </header>

      {status && <div className="my-4 flex flex-wrap gap-2 text-xs">
        <span className="project-telos-pill">YouTube Data API: {status.searchConfigured ? 'configured' : 'not configured'}</span>
        <span className="project-telos-pill">Gemini audit: {status.analysisConfigured ? `configured / ${status.model}` : 'not configured'}</span>
      </div>}
      {status && !status.searchConfigured && <p className="mt-4 text-sm text-amber-200">
        Live search needs a server-side YOUTUBE_API_KEY with YouTube Data API v3 enabled.
        You can still paste a public link below; no fabricated YouTube results are shown.
      </p>}
      {status && !status.analysisConfigured && <p className="mt-3 text-xs leading-6 text-slate-400">
        Selected-video analysis needs a configured Gemini API or Vertex AI provider,
        the Google SDK, and offline fallback disabled. Vertex uses your Google Cloud
        project and credentials. Search results alone are not safety verdicts.
      </p>}
      {searching && <p role="status" className="mt-4 text-sm text-slate-400">Finding short videos for your interests...</p>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}

      <form className="mt-4 rounded-lg bg-slate-800/40 p-3" aria-label="Add a YouTube link"
        onSubmit={(event) => { event.preventDefault(); void addLink(link); }}>
        <label htmlFor="youtube-link" className="text-xs font-medium text-slate-300">Paste a public YouTube link</label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input id="youtube-link" type="url" value={link} placeholder="https://www.youtube.com/watch?v=..."
            onChange={(event) => setLink(event.target.value)} disabled={linking}
            className="project-telos-input min-w-[16rem] flex-1" />
          <button type="submit" className="project-telos-button secondary" disabled={linking || !link.trim()}>
            {linking ? 'Adding...' : 'Add to candidates'}
          </button>
        </div>
        <div className="mt-3 grid gap-3 text-xs">
          <span className="text-slate-500">Try a sample, then analyse it to see how it compares with your intent:</span>
          {sampleGroups.map((group) => (
            <div key={group.title} role="group" aria-label={`Samples: ${group.title}`}>
              <p className="font-medium text-slate-300">{group.title}
                <span className="ml-2 font-normal text-slate-500">{group.expectation}</span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {group.links.map((sample) => <button key={sample.url} type="button"
                  className="project-telos-pill hover:text-teal-200" disabled={linking}
                  onClick={() => void addLink(sample.url)}>{sample.label}</button>)}
              </div>
            </div>
          ))}
        </div>
        {status && !status.searchConfigured && <p className="mt-2 text-xs leading-5 text-slate-500">
          Pasted links use YouTube's public oEmbed metadata. Analysing them also needs YOUTUBE_API_KEY
          to confirm the video is public, embeddable, and under four minutes.
        </p>}
      </form>

      {search && <>
        <p className="mt-4 text-xs text-slate-400">Query: <strong className="text-teal-200">{search.query}</strong> · {search.source}</p>
        <p className="mt-2 text-xs leading-6 text-slate-500">{search.note}</p>
        {search.videos.length === 0 ? <p className="mt-4 text-sm text-slate-400">
          No matching short videos were returned. Adjust your interests and declare again.
        </p> : <>
          <label className="mt-4 flex items-start gap-3 rounded-lg bg-slate-800/50 p-3 text-xs leading-6 text-slate-300">
            <input type="checkbox" checked={approveAnalysis} disabled={analysing !== null}
              onChange={(event) => setApproveAnalysis(event.target.checked)} className="mt-1.5" />
            I agree to send the selected public video's title, thumbnail, and URL, plus my chosen topics, to Google
            Gemini for analysis. Project Telos applies my boundaries locally; it does not send my boundary reasons in this audit.
          </label>
          <div className="youtube-candidate-feed mt-4" role="region" aria-label="YouTube candidates from your interests" tabIndex={0}>
            {search.videos.map((video, index) => <article key={video.videoId}
              className="youtube-candidate-card rounded-xl border border-slate-700 p-4">
              <span className="candidate-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <p className="text-[10px] uppercase tracking-wider text-amber-200">Unanalysed candidate</p>
              <h3 className="mt-2 text-sm font-medium">{video.title}</h3>
              <p className="mt-2 text-xs text-slate-500">{video.channel} · {video.durationSec
                ? `${formatTimecode(video.durationSec)} long` : 'short video'}</p>
              <button type="button" className="project-telos-button secondary mt-4"
                disabled={!approveAnalysis || !status?.analysisConfigured || analysing !== null || searching}
                onClick={() => void analyse(video.videoId)}>
                {analysing === video.videoId ? 'Gemini is analysing...' : `Analyse: ${video.title}`}
              </button>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">
                No thumbnail or player loads until Project Telos has checked this video and you choose to watch.
              </p>
            </article>)}
          </div>
        </>}
      </>}

      {result && <article className="mt-6 rounded-xl border border-teal-500/30 bg-teal-500/5 p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium">{result.video.title}</h3>
          <span className="project-telos-pill text-xs text-teal-200">
            {result.topicMatch?.status === 'off-topic' ? 'Filtered from your feed'
              : result.recommendation === 'eligible' ? 'Matches your intent'
              : result.recommendation === 'hold' ? 'Held for your preferences' : 'Unverified / insufficient evidence'}
          </span>
        </header>
        <p className="mt-3 text-xs text-slate-400">{result.analysedBy} · {new Date(result.analysedAt).toLocaleString()}</p>
        {!!result.topicMatch?.judgedInterests?.length && <p className="mt-2 text-xs text-slate-400">
          Matched by meaning, not exact words: {result.topicMatch.judgedInterests.join(', ')}
          {result.topicMatch.topics.length > 0 && ` (observed: ${result.topicMatch.topics.slice(0, 4).join(', ')})`}
        </p>}
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {result.topicMatch?.status === 'off-topic'
            ? 'The observed video topics do not match the topics you selected.'
            : result.recommendation === 'eligible'
              ? 'The topic check and boundary check found no reason to hold this item. This is not a safety guarantee.'
              : result.recommendation === 'unverified'
                ? 'There is not enough evidence to confirm that this video fits your intent.'
                : 'This video does not fit your declared preferences. External playback stays off unless you choose otherwise.'}
        </p>
        {result.audit.evidenceStatus === 'sufficient' && <div className="mt-4 border-t border-slate-700 pt-4">
          <h4 className="text-sm font-medium text-teal-200">Clean summary</h4>
          <p className="mt-2 text-sm leading-6">{result.audit.summary}</p>
        </div>}
        <p className="mt-4 text-xs leading-6 text-amber-200">{result.note}</p>
        <p className="mt-2 text-xs text-slate-500">
          YouTube audit records are saved separately. They do not increase the controlled demo's receipt or neutralization counts.
        </p>
        {result.recommendation !== 'eligible' && <label className="mt-4 flex items-start gap-3 text-xs leading-6 text-amber-200">
          <input type="checkbox" checked={approveOverride} disabled={playing}
            onChange={(event) => setApproveOverride(event.target.checked)} className="mt-1.5" />
          I understand this video is held or unverified and may cross my boundaries. I still choose external playback.
        </label>}
        {!playing ? <button type="button" className="project-telos-button secondary mt-4"
          disabled={result.recommendation !== 'eligible' && !approveOverride}
          onClick={() => setPlaying(true)}>Load YouTube player (not protected)</button>
          : <div className="mt-4">
            <iframe title={`YouTube player: ${result.video.title}`}
              className="aspect-video w-full rounded-lg"
              src={`https://www.youtube-nocookie.com/embed/${result.video.videoId}?autoplay=0&rel=0`}
              allow="encrypted-media; picture-in-picture" allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin" />
            <button type="button" className="project-telos-button secondary mt-3"
              onClick={() => setPlaying(false)}>Unload player</button>
          </div>}
      </article>}
    </section>
  );
}
