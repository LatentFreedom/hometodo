'use client';

import { useState, type FormEvent } from 'react';
import { signIn } from '../../lib/api';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'working' | 'done'>('idle');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus('working');

    try {
      const session = await signIn(email, password);
      // Session storage, not local storage: the token dies with the tab. There is no
      // application behind this page yet, so nothing needs a session that outlives it.
      sessionStorage.setItem('hometodo.session', JSON.stringify(session));
      setStatus('done');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed.');
      setStatus('idle');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1">
          <span className="text-sm">Email</span>
          <input
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm">Password</span>
          <input
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button
          className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          type="submit"
          disabled={status === 'working'}
        >
          {status === 'working' ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {status === 'done' ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Signed in. There is nothing behind this page yet.
        </p>
      ) : null}

      <p className="text-sm text-neutral-500">
        There is no sign up. This installation has one account, created once during
        setup.
      </p>
    </main>
  );
}
