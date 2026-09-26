/**
 * Base URL of the Cloudflare Worker that serves the API.
 *
 * Inlined at build time from NEXT_PUBLIC_API_URL. This is a static export, so there is
 * no server to read the value at run time: a wrong value here ships to the browser and
 * every request fails against it.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface AuthSession {
  token: string;
  refreshToken: string;
  user: { id: string; email: string; name: string | null };
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    // The API deliberately does not say whether the email or the password was wrong,
    // and neither does this message.
    throw new Error('Sign in failed. Check the email address and password.');
  }

  return (await response.json()) as AuthSession;
}
