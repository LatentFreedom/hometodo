'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { clearSavedKey, readSavedKey, saveKey, verifyKey } from '../lib/api';
import { AppShell } from './app-shell';
import { Icon } from './icons';
import { BUTTON_PRIMARY, BUTTON_QUIET, INPUT, LABEL } from './ui';

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
      <main className="flex min-h-screen items-center justify-center">
        <Icon name="house" size={28} className="animate-pulse text-accent" />
        <span className="sr-only">Checking access...</span>
      </main>
    );
  }

  if (state === 'locked' || changing) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Icon name="house" size={30} strokeWidth={1.25} />
            </span>
            <h1 className="font-display text-5xl font-medium">{changing ? 'Change key' : 'Home'}</h1>
            <p className="text-sm text-muted-foreground">Enter the admin key to open this installation.</p>
          </div>

          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Admin key</span>
              <input
                className={INPUT}
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
            </label>

            <button className={BUTTON_PRIMARY} type="submit" disabled={working}>
              {working ? 'Checking...' : 'Unlock'}
            </button>

            {changing ? (
              <button className={`${BUTTON_QUIET} self-center`} type="button" onClick={() => setChanging(false)}>
                Cancel
              </button>
            ) : null}
          </form>

          {error ? (
            <p role="alert" className="text-center text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <AppShell
      onChangeKey={() => {
        setError(null);
        setChanging(true);
      }}
      onClearKey={clearKey}
    >
      {children}
    </AppShell>
  );
}
