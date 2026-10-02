'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { clearSavedKey, readSavedKey, saveKey, verifyKey } from '../lib/api';
import { SiteHeader } from './site-header';

type GateState = 'checking' | 'locked' | 'unlocked';

const MESSAGES = {
  rejected: 'That key is not right.',
  throttled: 'Too many attempts. Try again later.',
  unreachable: 'Could not reach the server. Your key was not checked.',
} as const;

/**
 * Re-checks a saved key on load. Only a definite rejection discards it; an outage or a
 * throttle must not log the owner out.
 */
async function checkSavedKey(): Promise<{ state: GateState; error: string | null }> {
  const saved = readSavedKey();
  if (!saved) return { state: 'locked', error: null };
  const result = await verifyKey(saved);
  if (result === 'ok') return { state: 'unlocked', error: null };
  if (result === 'rejected') {
    clearSavedKey();
    return { state: 'locked', error: null };
  }
  return { state: 'locked', error: MESSAGES[result] };
}

/**
 * Full-screen key gate for the whole site. Every page is private, so nothing renders
 * until the worker accepts the key. A saved key is re-checked silently on each load.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking');
  const [changing, setChanging] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void checkSavedKey().then((outcome) => {
      if (cancelled) return;
      setError(outcome.error);
      setState(outcome.state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const candidate = key.trim();
      if (!candidate) return;
      setWorking(true);
      setError(null);
      const result = await verifyKey(candidate);
      setWorking(false);
      if (result === 'ok') {
        saveKey(candidate);
        if (changing) {
          window.location.reload();
          return;
        }
        setKey('');
        setState('unlocked');
        return;
      }
      setError(MESSAGES[result]);
    },
    [key, changing],
  );

  function clearKey() {
    clearSavedKey();
    window.location.reload();
  }

  if (state === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Checking access...</p>
      </main>
    );
  }

  if (state === 'locked' || changing) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 bg-background px-6 text-foreground">
        <h1 className="text-2xl font-semibold">{changing ? 'Change key' : 'Home Todos'}</h1>
        <p className="text-sm text-muted-foreground">Enter the admin key to open this installation.</p>

        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <label className="flex flex-col gap-1">
            <span className="text-sm">Admin key</span>
            <input
              className="rounded border border-border bg-input px-3 py-2 text-foreground"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>

          <button
            className="rounded border border-foreground bg-foreground px-3 py-2 text-background disabled:opacity-50"
            type="submit"
            disabled={working}
          >
            {working ? 'Checking...' : 'Unlock'}
          </button>

          {changing ? (
            <button
              className="text-sm text-muted-foreground underline underline-offset-4"
              type="button"
              onClick={() => setChanging(false)}
            >
              Cancel
            </button>
          ) : null}
        </form>

        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader
        onChangeKey={() => {
          setError(null);
          setChanging(true);
        }}
        onClearKey={clearKey}
      />
      {children}
    </div>
  );
}
