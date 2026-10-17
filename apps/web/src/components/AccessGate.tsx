import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { ACCESS_LOCKED_EVENT, api, type AccessStatus } from '../api/client';

type GateState = 'checking' | 'locked' | 'open';

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
        <p className="access-muted">This prototype is private. Enter the code you were given to continue.</p>
        <label htmlFor="access-code" className="sr-only">Access code</label>
        <input id="access-code" type="password" autoComplete="current-password" autoFocus
          value={code} maxLength={200} disabled={busy} placeholder="Access code"
          onChange={(event) => setCode(event.target.value)} />
        {hint && <p className="access-hint">Hint: {hint}</p>}
        {error && <p role="alert" className="tt-error">{error}</p>}
        <button type="submit" className="project-telos-button" disabled={busy || !code.trim()}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </main>
  );
}
