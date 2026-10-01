import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { API_BASE_PATH } from '../src/config/api';
import { ADMIN_KEY, adminHeaders, apiUrl, bearerHeaders, createProject, createTodo, get, ORIGIN, post, READ_TOKEN, resetDatabase } from './helpers';

const SUMMARY = `${API_BASE_PATH}/summary`;

type Credential = 'none' | 'wrong admin key' | 'wrong bearer' | 'admin key' | 'read token';

function headersFor(credential: Credential): Record<string, string> {
	switch (credential) {
		case 'none':
			return {};
		case 'wrong admin key':
			return { 'X-Admin-API-Key': 'not-the-key' };
		case 'wrong bearer':
			return { Authorization: 'Bearer not-the-token' };
		case 'admin key':
			return { 'X-Admin-API-Key': ADMIN_KEY };
		case 'read token':
			return { Authorization: `Bearer ${READ_TOKEN}` };
	}
}

// Every gated route, with a method that route serves. Ids are made up: the gate
// answers before any handler looks them up.
const GATED_ROUTES: Array<[string, string]> = [
	['GET', '/access'],
	['GET', '/projects'],
	['POST', '/projects'],
	['GET', '/projects/00000000-0000-4000-8000-000000000000'],
	['PATCH', '/projects/00000000-0000-4000-8000-000000000000'],
	['DELETE', '/projects/00000000-0000-4000-8000-000000000000'],
	['GET', '/todos'],
	['POST', '/todos'],
	['GET', '/todos/00000000-0000-4000-8000-000000000000'],
	['PATCH', '/todos/00000000-0000-4000-8000-000000000000'],
	['DELETE', '/todos/00000000-0000-4000-8000-000000000000'],
	['GET', '/contacts'],
	['POST', '/contacts'],
	['GET', '/contacts/00000000-0000-4000-8000-000000000000'],
	['PATCH', '/contacts/00000000-0000-4000-8000-000000000000'],
	['DELETE', '/contacts/00000000-0000-4000-8000-000000000000'],
	['POST', '/summary'],
	['GET', '/nope'],
];

// Each matrix call comes from its own address, so the wrong-value cases do not trip
// the throttle partway through and turn an expected 401 into a 429.
let nextHost = 0;

function call(method: string, path: string, credential: Credential): Promise<Response> {
	const hasBody = method === 'POST' || method === 'PATCH';
	nextHost += 1;
	const ip = `10.0.${Math.floor(nextHost / 250)}.${nextHost % 250}`;
	return SELF.fetch(apiUrl(`${API_BASE_PATH}${path}`), {
		method,
		headers: {
			Origin: ORIGIN,
			'CF-Connecting-IP': ip,
			...(hasBody ? { 'Content-Type': 'application/json' } : {}),
			...headersFor(credential),
		},
		body: hasBody ? '{}' : undefined,
	});
}

describe('access matrix', () => {
	beforeEach(resetDatabase);

	it('GET /api/v1/summary: 401 without a token, 401 for wrong values, 200 for the admin key and the read token', async () => {
		expect((await call('GET', '/summary', 'none')).status).toBe(401);
		expect((await call('GET', '/summary', 'wrong admin key')).status).toBe(401);
		expect((await call('GET', '/summary', 'wrong bearer')).status).toBe(401);
		expect((await call('GET', '/summary', 'admin key')).status).toBe(200);
		expect((await call('GET', '/summary', 'read token')).status).toBe(200);
	});

	it('answers 401 on every gated route with no credential or a wrong one', async () => {
		for (const credential of ['none', 'wrong admin key', 'wrong bearer'] as const) {
			for (const [method, path] of GATED_ROUTES) {
				const response = await call(method, path, credential);
				expect(response.status, `${credential} ${method} ${path}`).toBe(401);
			}
		}
	});

	it('answers 403 on every route but GET /summary for the read token', async () => {
		for (const [method, path] of GATED_ROUTES) {
			const response = await call(method, path, 'read token');
			expect(response.status, `${method} ${path}`).toBe(403);
			expect(await response.json()).toMatchObject({ error: 'FORBIDDEN' });
		}
	});

	it('lets the admin key past the gate on every route', async () => {
		for (const [method, path] of GATED_ROUTES) {
			const response = await call(method, path, 'admin key');
			expect([401, 403, 429], `${method} ${path}`).not.toContain(response.status);
		}
	});

	it('POST /api/v1/todos with only the read token returns 403 and writes nothing', async () => {
		const project = await createProject();
		const response = await post(`${API_BASE_PATH}/todos`, { project_id: project.id, title: 'Example todo' }, bearerHeaders());

		expect(response.status).toBe(403);
		const row = await env.DB.prepare('SELECT COUNT(*) AS total FROM todos').first<{ total: number }>();
		expect(row?.total).toBe(0);
	});

	it('keeps the health probe public for every credential', async () => {
		for (const credential of ['none', 'wrong bearer', 'read token'] as const) {
			expect((await get(`${API_BASE_PATH}/health`, headersFor(credential))).status).toBe(200);
		}
	});

	it('accepts the bearer scheme in any case and with surrounding whitespace', async () => {
		expect((await get(SUMMARY, { Authorization: `bearer ${READ_TOKEN}` })).status).toBe(200);
		expect((await get(SUMMARY, { Authorization: `  Bearer   ${READ_TOKEN}  ` })).status).toBe(200);
	});

	it('refuses the read token under another scheme or in the admin header', async () => {
		expect((await get(SUMMARY, { Authorization: `Basic ${READ_TOKEN}` })).status).toBe(401);
		expect((await get(SUMMARY, adminHeaders(READ_TOKEN))).status).toBe(401);
	});

	it('refuses the admin key sent as a bearer token on a write route', async () => {
		const response = await post(`${API_BASE_PATH}/projects`, { name: 'Example project' }, bearerHeaders(ADMIN_KEY));
		expect(response.status).toBe(401);
	});

	it('refuses a bearer value longer than 256 characters', async () => {
		expect((await get(SUMMARY, bearerHeaders('t'.repeat(257)))).status).toBe(401);
	});

	it('fails closed when READ_TOKEN is unset', async () => {
		for (const token of [READ_TOKEN, 'anything']) {
			const request = new Request(apiUrl(SUMMARY), { headers: { Authorization: `Bearer ${token}` } });
			const response = await worker.fetch(request, { ...env, READ_TOKEN: '' });
			expect(response.status).toBe(401);
		}
		const empty = new Request(apiUrl(SUMMARY), { headers: { Authorization: 'Bearer ' } });
		expect((await worker.fetch(empty, { ...env, READ_TOKEN: '' })).status).toBe(401);
	});

	it('still lets the admin key read the summary when READ_TOKEN is unset', async () => {
		const request = new Request(apiUrl(SUMMARY), { headers: adminHeaders() });
		const response = await worker.fetch(request, { ...env, READ_TOKEN: '' });
		expect(response.status).toBe(200);
	});

	it('gives the read token nothing from a todo route even for an existing record', async () => {
		const project = await createProject();
		const todo = await createTodo(project.id);
		expect((await get(`${API_BASE_PATH}/todos/${todo.id}`, bearerHeaders())).status).toBe(403);
		expect((await get(`${API_BASE_PATH}/projects/${project.id}`, bearerHeaders())).status).toBe(403);
	});
});

describe('wrong bearer throttle', () => {
	beforeEach(resetDatabase);

	const fromIp = (ip: string, headers: Record<string, string>) => get(SUMMARY, { ...headers, 'CF-Connecting-IP': ip });

	it('returns 429 on the 21st wrong bearer value from one IP', async () => {
		for (let attempt = 1; attempt <= 20; attempt += 1) {
			expect((await fromIp('198.51.100.20', { Authorization: `Bearer wrong-${attempt}` })).status).toBe(401);
		}
		expect((await fromIp('198.51.100.20', { Authorization: 'Bearer wrong-21' })).status).toBe(429);
	});

	it('shares one budget between wrong admin keys and wrong bearer values', async () => {
		for (let attempt = 1; attempt <= 10; attempt += 1) {
			await fromIp('198.51.100.21', { 'X-Admin-API-Key': `wrong-${attempt}` });
			await fromIp('198.51.100.21', { Authorization: `Bearer wrong-${attempt}` });
		}
		expect((await fromIp('198.51.100.21', { Authorization: 'Bearer wrong-21' })).status).toBe(429);
		expect((await fromIp('198.51.100.21', { 'X-Admin-API-Key': 'wrong-21' })).status).toBe(429);
	});

	it('never throttles the correct read token, and never counts it as a failure', async () => {
		for (let attempt = 1; attempt <= 21; attempt += 1) {
			await fromIp('198.51.100.22', { Authorization: `Bearer wrong-${attempt}` });
		}
		expect((await fromIp('198.51.100.22', { Authorization: `Bearer ${READ_TOKEN}` })).status).toBe(200);

		await resetDatabase();
		await post(`${API_BASE_PATH}/todos`, {}, { ...bearerHeaders(), 'CF-Connecting-IP': '198.51.100.23' });
		const row = await env.DB.prepare('SELECT COUNT(*) AS total FROM access_failures').first<{ total: number }>();
		expect(row?.total).toBe(0);
	});

	it('does not count an Authorization header with another scheme', async () => {
		await fromIp('198.51.100.24', { Authorization: 'Basic abc' });
		const row = await env.DB.prepare('SELECT COUNT(*) AS total FROM access_failures').first<{ total: number }>();
		expect(row?.total).toBe(0);
	});
});

describe('CORS for the new methods', () => {
	it('allows PATCH and DELETE in a preflight', async () => {
		const response = await SELF.fetch(apiUrl(`${API_BASE_PATH}/todos/x`), {
			method: 'OPTIONS',
			headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'X-Admin-API-Key, Content-Type' },
		});
		expect(response.status).toBe(204);
		const methods = response.headers.get('Access-Control-Allow-Methods') ?? '';
		expect(methods).toContain('PATCH');
		expect(methods).toContain('DELETE');
		expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
	});
});
