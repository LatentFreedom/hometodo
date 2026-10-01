import { env, SELF } from 'cloudflare:test';

export const ORIGIN = 'http://localhost:3000';

// Matches the ADMIN_API_KEY binding in vitest.config.mts. Nothing real ever appears in
// this repository.
export const ADMIN_KEY = 'test-admin-key';

export function apiUrl(path: string): string {
	return `http://example.com${path}`;
}

export function get(path: string, headers: HeadersInit = {}): Promise<Response> {
	return SELF.fetch(apiUrl(path), { headers: { Origin: ORIGIN, ...headers } });
}

export function post(path: string, body: unknown, headers: HeadersInit = {}): Promise<Response> {
	return SELF.fetch(apiUrl(path), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
		body: JSON.stringify(body),
	});
}

/** Headers that pass the admin gate. */
export function adminHeaders(key: string = ADMIN_KEY): HeadersInit {
	return { 'X-Admin-API-Key': key };
}

/** Wipe every table between specs so ordering cannot make one test depend on another. */
export async function resetDatabase(): Promise<void> {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM todos'),
		env.DB.prepare('DELETE FROM contacts'),
		env.DB.prepare('DELETE FROM projects'),
		env.DB.prepare('DELETE FROM access_failures'),
	]);
}
