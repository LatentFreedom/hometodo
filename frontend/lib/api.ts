/**
 * Base URL of the Cloudflare Worker that serves the API.
 *
 * Inlined at build time from NEXT_PUBLIC_API_URL. This is a static export, so there is
 * no server to read the value at run time: a wrong value here ships to the browser and
 * every request fails against it. Empty means same origin, which is how production runs.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

/** The one browser slot for the admin key. */
export const ADMIN_KEY_STORAGE = 'hometodo_admin_key';
const ADMIN_KEY_HEADER = 'X-Admin-API-Key';

// Storage can throw in private windows or with blocked site data; the gate then just
// asks for the key each visit instead of breaking.
export function readSavedKey(): string {
  try {
    return window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function saveKey(key: string): void {
  try {
    window.localStorage.setItem(ADMIN_KEY_STORAGE, key);
  } catch {
    // Not persisted; the key still works for this page load.
  }
}

export function clearSavedKey(): void {
  try {
    window.localStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    // Nothing saved to clear.
  }
}

/** Fetch an API path with the saved admin key attached. */
export function apiFetch(path: string, init: RequestInit = {}, key: string = readSavedKey()): Promise<Response> {
  const headers = new Headers(init.headers);
  if (key) headers.set(ADMIN_KEY_HEADER, key);
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

export type KeyCheck = 'ok' | 'rejected' | 'throttled' | 'unreachable';

/**
 * Asks the worker whether a key is valid. Only 401 and 403 mean "wrong key"; a 5xx or
 * a network error says nothing about the key, so the caller must not discard it.
 */
export async function verifyKey(key: string): Promise<KeyCheck> {
  try {
    const response = await apiFetch('/api/v1/access', {}, key);
    if (response.ok) return 'ok';
    if (response.status === 401 || response.status === 403) return 'rejected';
    if (response.status === 429) return 'throttled';
    return 'unreachable';
  } catch {
    return 'unreachable';
  }
}
