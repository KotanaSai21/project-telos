import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { ACCESS_LOCKED_EVENT, api, type AccessStatus } from '../api/client';

type GateState = 'checking' | 'locked' | 'welcome' | 'open';

/** Per-tab memory that the visitor has read the welcome screen. Storage can be blocked, so failures are ignored. */
const WELCOME_SEEN_KEY = 'project-telos:welcome-seen';

function welcomeSeen(): boolean {
  try { return window.sessionStorage.getItem(WELCOME_SEEN_KEY) === '1'; } catch { return false; }
}

function rememberWelcome() {
  try { window.sessionStorage.setItem(WELCOME_SEEN_KEY, '1'); } catch { /* storage blocked: show it again next time */ }
}

type Safeguard = { title: string; detail: string };

/** Controls that are live in the deployed service, whether or not a code is required. */
const SAFEGUARDS: readonly Safeguard[] = [
  { title: 'No Gemini key to leak', detail: 'Gemini runs on Vertex AI under the service’s own identity. Other secrets live in Secret Manager, never in the page.' },
  { title: 'Every visitor is rate limited', detail: 'Requests that can call Gemini, Imagen, or YouTube are capped per visitor per minute.' },
  { title: 'Spend is capped', detail: 'At most 3 Cloud Run instances, and a monthly billing budget alerts the owner at 50%, 90%, and 100%.' },
  { title: 'Consent before any AI call', detail: 'Nothing reaches Gemini until you tick the box. Uploaded files are not stored, only the title and score.' },
  { title: 'Content is data, not instructions', detail: 'Thumbnail text, titles, and transcripts are treated as evidence, never as commands to the model.' },
];

/** Extra controls that only apply while the site asks for a code. */
const CODE_SAFEGUARDS: readonly Safeguard[] = [
  { title: 'The code never sits in your browser', detail: 'The server checks it and sets an HttpOnly cookie that holds only an HMAC of it.' },
  { title: 'Guessing is throttled', detail: '10 wrong tries in 5 minutes from one address triggers a cooldown.' },
];

function Safeguards({ title, items }: { title: string; items: readonly Safeguard[] }) {
  return (
    <section className="access-security" aria-labelledby="access-security-title">
      <h2 id="access-security-title">{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item.title}><strong>{item.title}.</strong> {item.detail}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The first screen. When the site is open it explains the safeguards once per tab, then
 * lets the visitor in. When an access code is set it collects the code instead; the API
 * enforces the code itself, so the code never ships in the bundle.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking');
  const [hint, setHint] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const opened = () => (welcomeSeen() ? 'open' : 'welcome');
    function apply(status: AccessStatus) {
      if (!active) return;
      setHint(status.hint);
      if (!status.required) setState(opened());
      else setState(status.unlocked ? 'open' : 'locked');
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

  function enter() {
    rememberWelcome();
    setState('open');
  }

  if (state === 'open') return <>{children}</>;
  if (state === 'checking') return <main className="access-gate" aria-busy="true" />;

  if (state === 'welcome') {
    return (
      <main className="access-gate">
        <div className="access-card">
          <p className="eyebrow"><span className="eyebrow-dot" /> PROJECT TELOS</p>
          <h1>Open for judging, safe by design</h1>
          <p className="access-muted">
            No access code: you can try everything. Every check makes real Gemini calls on our own Google Cloud
            account, so these safeguards keep the prototype safe and affordable while it is open.
          </p>
          <Safeguards title="How we keep it safe" items={SAFEGUARDS} />
          <button type="button" className="project-telos-button" autoFocus onClick={enter}>
            Enter Project Telos
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="access-gate">
      <form className="access-card" onSubmit={(event) => void submit(event)}>
        <p className="eyebrow"><span className="eyebrow-dot" /> PROJECT TELOS</p>
        <h1>Enter access code</h1>
        <p className="access-muted">
          Every check spends real Gemini calls, so this prototype is private. Enter the code you were given to continue.
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
        <Safeguards title="Why there’s a code: security by design" items={[...CODE_SAFEGUARDS, ...SAFEGUARDS]} />
      </form>
    </main>
  );
}
