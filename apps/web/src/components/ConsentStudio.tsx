import { VIEWER_GOALS, type ConsentProfile, type ViewerGoal } from '../api/types';
import { INTENSITY_ORDER } from '@project-telos/contracts';

interface Props {
  profile: ConsentProfile | null;
  presets: ConsentProfile[];
  utterance: string;
  context: string;
  busy: boolean;
  onDraftChange: (utterance: string, context: string) => void;
  onDeclare: (utterance: string, context: string) => void;
  onSelectPreset: (profileId: string) => void;
  goal: ViewerGoal;
  topics: string;
  onGoalChange: (goal: ViewerGoal) => void;
  onTopicsChange: (topics: string) => void;
}

export const DEFAULT_DECLARATION =
  "I'm here to learn about aviation, cooking, and DIY. Keep it clean; avoid graphic content.";

const readable = (value: string) => value.replace(/_/g, ' ');

/** Declare: one sentence becomes a structured, readable, editable profile. */
export function ConsentStudio({
  profile, presets, utterance, context, busy, onDraftChange, onDeclare, onSelectPreset,
  goal, topics, onGoalChange, onTopicsChange,
}: Props) {
  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
        What are you here for?
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Choose a goal, add topics, and set your boundaries. Topic matching and safety are checked separately.
      </p>
      <p className="mt-2 text-xs leading-6 text-slate-400">
        Declare also searches YouTube using only your positive interests when configured.
        Your boundary reasons are not sent in the search. Selected-video AI analysis and
        external playback each require a separate choice.
      </p>

      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onDeclare(utterance, context);
        }}
      >
        <fieldset disabled={busy} className="viewer-goals">
          <legend className="text-xs text-slate-400">Your goal</legend>
          {Object.entries(VIEWER_GOALS).map(([value, label]) => (
            <label key={value}>
              <input type="radio" name="viewer-goal" value={value} checked={goal === value}
                onChange={() => onGoalChange(value as ViewerGoal)} />
              {label}
            </label>
          ))}
        </fieldset>
        <label className="block text-xs text-slate-400">
          Topics (separate with commas)
          <input className="project-telos-input mt-2 w-full" value={topics} maxLength={1000}
            disabled={busy} onChange={(event) => onTopicsChange(event.target.value)}
            placeholder="e.g. aviation, cooking, DIY" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-400">Describe your boundaries and interests</span>
          <textarea
            value={utterance}
            disabled={busy}
            onChange={(event) => onDraftChange(event.target.value, context)}
            rows={3}
            maxLength={1000}
            className="w-full rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-100 outline-none focus:border-[var(--color-project-telos-key)]"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-400">
            Context
            <select
              value={context}
              onChange={(event) => onDraftChange(utterance, event.target.value)}
              className="ml-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-100"
            >
              {['work', 'family', 'learning', 'personal', 'commute'].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={busy || utterance.trim().length === 0}
            className="rounded bg-[var(--color-project-telos-key)] px-4 py-1.5 text-xs font-medium text-slate-950 disabled:opacity-40"
          >
            {busy ? 'Reading…' : 'Declare'}
          </button>

          {presets.length > 0 && (
            <label className="text-xs text-slate-400">
              or switch to
              <select
                value={profile?.id?.startsWith('preset-') ? profile.id : ''}
                onChange={(event) => event.target.value && onSelectPreset(event.target.value)}
                className="ml-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-100"
              >
                <option value="">a preset…</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </form>

      {profile && (
        <dl data-testid="profile-summary" className="mt-5 grid gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Avoid</dt>
            <dd className="mt-1 flex flex-wrap gap-2">
              {profile.avoid.length === 0 && <span className="text-slate-500">Nothing yet</span>}
              {profile.avoid.map((boundary) => (
                <span
                  key={boundary.category}
                  title={boundary.reason ?? undefined}
                  className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs text-rose-200 ring-1 ring-inset ring-rose-500/30"
                >
                  {readable(boundary.category)}
                  <span className="ml-1 text-rose-300/60">
                    ≤ {boundary.intensityThreshold}
                  </span>
                  {boundary.reason && <span className="ml-1" aria-label="has a stated reason">•</span>}
                </span>
              ))}
            </dd>
          </div>

          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Allow in context
            </dt>
            <dd className="mt-1 flex flex-wrap gap-2">
              {profile.allowContextually.length === 0 && (
                <span className="text-slate-500">None</span>
              )}
              {profile.allowContextually.map((category) => (
                <span
                  key={category}
                  className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200 ring-1 ring-inset ring-emerald-500/30"
                >
                  {readable(category)}
                </span>
              ))}
            </dd>
          </div>

          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Interested in</dt>
            <dd className="mt-1 flex flex-wrap gap-2">
              {profile.interests.length === 0 && <span className="text-slate-500">None yet</span>}
              {profile.interests.map((interest) => (
                <span
                  key={interest}
                  className="rounded-full bg-sky-500/10 px-2.5 py-1 text-xs text-sky-200 ring-1 ring-inset ring-sky-500/30"
                >
                  {interest}
                </span>
              ))}
            </dd>
          </div>

          <p className="pt-1 text-[11px] text-slate-500 md:col-span-3">
            Intensity scale: {INTENSITY_ORDER.join(' → ')}. A boundary admits content at or
            below its threshold.
          </p>
        </dl>
      )}
    </section>
  );
}
