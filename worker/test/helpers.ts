import { env, SELF } from 'cloudflare:test';
import { API_BASE_PATH } from '../src/config/api';

export const API_AUTH_BASE = `${API_BASE_PATH}/auth`;
export const ORIGIN = 'http://localhost:3000';

// Example credentials. Nothing real ever appears in this repository.
export const ADMIN_EMAIL = 'owner@example.com';
export const ADMIN_PASSWORD = 'Example-Passw0rd!';
export const SETUP_KEY = 'test-only-admin-setup-key';

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

/** Wipe every table between specs so ordering cannot make one test depend on another. */
export async function resetDatabase(): Promise<void> {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM todos'),
		env.DB.prepare('DELETE FROM contacts'),
		env.DB.prepare('DELETE FROM projects'),
		env.DB.prepare('DELETE FROM auth_refresh_tokens'),
		env.DB.prepare('DELETE FROM password_reset_tokens'),
		env.DB.prepare('DELETE FROM users'),
	]);
}

export function bootstrapAdmin(): Promise<Response> {
	return post(
		`${API_AUTH_BASE}/bootstrap`,
		{ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: 'Owner' },
		{ 'X-Admin-Key': SETUP_KEY },
	);
}
