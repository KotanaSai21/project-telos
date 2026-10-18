import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { ACCESS_LOCKED_EVENT, api, type AccessStatus } from '../api/client';

type GateState = 'checking' | 'locked' | 'open';

/** Why the gate exists. Each line describes a control that is live in the deployed service. */
const SAFEGUARDS: ReadonlyArray<{ title: string; detail: string }> = [
  { title: 'No Gemini key to leak', detail: 'Gemini runs on Vertex AI under the service’s own identity. The YouTube key and this code live in Secret Manager, never in the page.' },
  { title: 'The code never sits in your browser', detail: 'The server checks it and sets an HttpOnly cookie that holds only an HMAC of it.' },
  { title: 'Guessing is throttled', detail: '10 wrong tries in 5 minutes from one address triggers a cooldown.' },
  { title: 'Spend is capped', detail: 'At most 3 Cloud Run instances, and a monthly billing budget alerts the owner at 50%, 90%, and 100%.' },
  { title: 'Consent before any AI call', detail: 'Nothing reaches Gemini until you tick the box. Uploaded files are not stored, only the title and score.' },
  { title: 'Content is data, not instructions', detail: 'Thumbnail text, titles, and transcripts are treated as evidence, never as commands to the model.' },
];

/**
 * Asks for the site access code before showing the app. The API enforces the code
 * itself; this screen only collects it, so the code never ships in the bundle.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking');
  const [hint, setHint] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    function apply(status: AccessStatus) {
      if (!active) return;
      setHint(status.hint);
      setState(status.required && !status.unlocked ? 'locked' : 'open');
    }
    api.accessStatus().then(apply).catch(() => {
      // API unreachable: show the app, which reports its own connection errors.
      if (active) setState('open');
    });
    const relock = () => { if (active) setState('locked'); };
    window.addEventListener(ACCESS_LOCKED_EVENT, relock);
    return () => { active = false; window.removeEventListener(ACCESS_LOCKED_EVENT, relock); };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.accessVerify(code);
      setCode('');
      setState('open');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check the code. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'open') return <>{children}</>;
  if (state === 'checking') return <main className="access-gate" aria-busy="true" />;

  return (
    <main className="access-gate">
      <form className="access-card" onSubmit={(event) => void submit(event)}>
        <p className="eyebrow"><span className="eyebrow-dot" /> PROJECT TELOS</p>
        <h1>Enter access code</h1>
        <p className="access-muted">
          Every check spends real Gemini calls, so this prototype is private. Enter the code you were given to
          continue. Judges: the code is in the submission form.
        </p>
        <label htmlFor="access-code" className="sr-only">Access code</label>
        <input id="access-code" type="password" autoComplete="current-password" autoFocus
          value={code} maxLength={200} disabled={busy} placeholder="Access code"
          onChange={(event) => setCode(event.target.value)} />
        {hint && <p className="access-hint">Hint: {hint}</p>}
        {error && <p role="alert" className="tt-error">{error}</p>}
        <button type="submit" className="project-telos-button" disabled={busy || !code.trim()}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
        <section className="access-security" aria-labelledby="access-security-title">
          <h2 id="access-security-title">Why there’s a code: security by design</h2>
          <ul>
            {SAFEGUARDS.map((item) => (
              <li key={item.title}><strong>{item.title}.</strong> {item.detail}</li>
            ))}
          </ul>
        </section>
      </form>
    </main>
  );
}
