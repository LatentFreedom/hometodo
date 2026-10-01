import { env, SELF } from 'cloudflare:test';

export const ORIGIN = 'http://localhost:3000';

// Matches the ADMIN_API_KEY binding in vitest.config.mts. Nothing real ever appears in
// this repository.
export const ADMIN_KEY = 'test-admin-key';

// Matches the READ_TOKEN binding in vitest.config.mts.
export const READ_TOKEN = 'test-read-token';

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

export function patch(path: string, body: unknown, headers: HeadersInit = {}): Promise<Response> {
	return SELF.fetch(apiUrl(path), {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
		body: JSON.stringify(body),
	});
}

export function del(path: string, headers: HeadersInit = {}): Promise<Response> {
	return SELF.fetch(apiUrl(path), { method: 'DELETE', headers: { Origin: ORIGIN, ...headers } });
}

/** A raw body, for malformed-JSON cases that JSON.stringify cannot produce. */
export function postRaw(path: string, body: string, headers: HeadersInit = {}): Promise<Response> {
	return SELF.fetch(apiUrl(path), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
		body,
	});
}

/** Headers that carry the read token. */
export function bearerHeaders(token: string = READ_TOKEN): HeadersInit {
	return { Authorization: `Bearer ${token}` };
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

const API = '/api/v1';

/** Creates a project through the API and returns its row. */
export async function createProject(body: Record<string, unknown> = {}): Promise<{ id: string; [key: string]: unknown }> {
	const response = await post(`${API}/projects`, { name: 'Example project', kind: 'house', ...body }, adminHeaders());
	if (response.status !== 201) throw new Error(`createProject failed with ${response.status}`);
	return ((await response.json()) as { project: { id: string } }).project;
}

/** Creates a todo through the API and returns its row. */
export async function createTodo(
	projectId: string,
	body: Record<string, unknown> = {},
): Promise<{ id: string; [key: string]: unknown }> {
	const response = await post(`${API}/todos`, { project_id: projectId, title: 'Example todo', ...body }, adminHeaders());
	if (response.status !== 201) throw new Error(`createTodo failed with ${response.status}`);
	return ((await response.json()) as { todo: { id: string } }).todo;
}

/** Creates a contact through the API and returns its row. */
export async function createContact(body: Record<string, unknown> = {}): Promise<{ id: string; [key: string]: unknown }> {
	const response = await post(`${API}/contacts`, { name: 'Example Roofing', ...body }, adminHeaders());
	if (response.status !== 201) throw new Error(`createContact failed with ${response.status}`);
	return ((await response.json()) as { contact: { id: string } }).contact;
}
