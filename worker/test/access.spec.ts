import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { API_BASE_PATH } from '../src/config/api';
import { ADMIN_KEY, adminHeaders, apiUrl, get, ORIGIN, post, resetDatabase } from './helpers';

const ACCESS = `${API_BASE_PATH}/access`;

describe('admin gate', () => {
	beforeEach(resetDatabase);

	it('rejects a request with no key', async () => {
		const response = await get(ACCESS);
		expect(response.status).toBe(401);
	});

	it('rejects a wrong key', async () => {
		const response = await get(ACCESS, adminHeaders('not-the-key'));
		expect(response.status).toBe(401);
	});

	it('accepts the admin key and reports the tier', async () => {
		const response = await get(ACCESS, adminHeaders());
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ auth_level: 'admin' });
	});

	it('accepts the key with surrounding whitespace', async () => {
		const response = await get(ACCESS, adminHeaders(`  ${ADMIN_KEY}  `));
		expect(response.status).toBe(200);
	});

	it('rejects a key longer than 256 characters', async () => {
		const response = await get(ACCESS, adminHeaders('k'.repeat(257)));
		expect(response.status).toBe(401);
	});

	it('fails closed when the secret is unset', async () => {
		const request = new Request(apiUrl(ACCESS), { headers: { 'X-Admin-API-Key': '' } });
		const unset = await worker.fetch(request, { ...env, ADMIN_API_KEY: '' });
		expect(unset.status).toBe(401);

		const guess = new Request(apiUrl(ACCESS), { headers: { 'X-Admin-API-Key': 'anything' } });
		const stillUnset = await worker.fetch(guess, { ...env, ADMIN_API_KEY: '' });
		expect(stillUnset.status).toBe(401);
	});

	it('keeps the health probe public', async () => {
		const response = await get(`${API_BASE_PATH}/health`);
		expect(response.status).toBe(200);
	});

	it('answers unknown paths with 401 without a key and 404 with it', async () => {
		expect((await get(`${API_BASE_PATH}/nope`)).status).toBe(401);
		expect((await get(`${API_BASE_PATH}/nope`, adminHeaders())).status).toBe(404);
	});

	it('has no login or signup route', async () => {
		for (const path of ['login', 'signup', 'register', 'bootstrap']) {
			const response = await post(`${API_BASE_PATH}/auth/${path}`, {}, adminHeaders());
			expect(response.status).toBe(404);
		}
	});
});

describe('wrong-key throttle', () => {
	beforeEach(resetDatabase);

	const fromIp = (ip: string, key: string) => get(ACCESS, { ...adminHeaders(key), 'CF-Connecting-IP': ip });

	it('returns 429 on the 21st wrong key from one IP in ten minutes', async () => {
		for (let attempt = 1; attempt <= 20; attempt += 1) {
			expect((await fromIp('198.51.100.7', `wrong-${attempt}`)).status).toBe(401);
		}
		expect((await fromIp('198.51.100.7', 'wrong-21')).status).toBe(429);
	});

	it('never throttles the correct key', async () => {
		for (let attempt = 1; attempt <= 21; attempt += 1) {
			await fromIp('198.51.100.8', `wrong-${attempt}`);
		}
		expect((await fromIp('198.51.100.8', ADMIN_KEY)).status).toBe(200);
	});

	it('counts each IP separately', async () => {
		for (let attempt = 1; attempt <= 21; attempt += 1) {
			await fromIp('198.51.100.9', `wrong-${attempt}`);
		}
		expect((await fromIp('203.0.113.4', 'wrong')).status).toBe(401);
	});

	it('does not count a request that sent no key', async () => {
		for (let attempt = 1; attempt <= 25; attempt += 1) {
			await get(ACCESS, { 'CF-Connecting-IP': '198.51.100.10' });
		}
		const row = await env.DB.prepare('SELECT COUNT(*) AS total FROM access_failures').first<{ total: number }>();
		expect(row?.total).toBe(0);
	});

	it('never stores the guessed key', async () => {
		await fromIp('198.51.100.11', 'secret-looking-guess');
		const columns = await env.DB.prepare("SELECT name FROM pragma_table_info('access_failures')").all<{ name: string }>();
		expect(columns.results.map((column) => column.name)).toEqual(['id', 'ip', 'path', 'created_at']);
	});
});

describe('CORS', () => {
	it('answers a preflight from an allowed origin and allows the key header', async () => {
		const response = await SELF.fetch(apiUrl(ACCESS), {
			method: 'OPTIONS',
			headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'X-Admin-API-Key' },
		});

		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Admin-API-Key');
	});
});
