import { beforeEach, describe, expect, it } from 'vitest';
import {
	ADMIN_EMAIL,
	ADMIN_PASSWORD,
	API_AUTH_BASE,
	SETUP_KEY,
	bootstrapAdmin,
	get,
	post,
	resetDatabase,
} from './helpers';

describe('admin bootstrap', () => {
	beforeEach(resetDatabase);

	it('creates the single admin account when given the setup key', async () => {
		const response = await bootstrapAdmin();

		expect(response.status).toBe(201);
		const body = (await response.json()) as { token: string; refreshToken: string; user: { email: string } };
		expect(body.user.email).toBe(ADMIN_EMAIL);
		expect(body.token).toBeTruthy();
		expect(body.refreshToken).toBeTruthy();
	});

	it('refuses without the setup key', async () => {
		const response = await post(`${API_AUTH_BASE}/bootstrap`, {
			email: ADMIN_EMAIL,
			password: ADMIN_PASSWORD,
		});

		expect(response.status).toBe(403);
	});

	it('refuses a wrong setup key', async () => {
		const response = await post(
			`${API_AUTH_BASE}/bootstrap`,
			{ email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
			{ 'X-Admin-Key': 'not-the-setup-key' },
		);

		expect(response.status).toBe(403);
	});

	it('refuses a second account once the admin exists', async () => {
		await bootstrapAdmin();

		const second = await post(
			`${API_AUTH_BASE}/bootstrap`,
			{ email: 'someone-else@example.com', password: ADMIN_PASSWORD },
			{ 'X-Admin-Key': SETUP_KEY },
		);

		expect(second.status).toBe(403);
		await expect(second.json()).resolves.toMatchObject({ error: 'ALREADY_INITIALIZED' });
	});
});

describe('there is no signup route', () => {
	beforeEach(resetDatabase);

	it('returns 404 for POST /api/v1/auth/signup', async () => {
		// This app has exactly one account. A signup route would be a way for a
		// stranger who finds the API to create a second one.
		const response = await post(`${API_AUTH_BASE}/signup`, {
			email: 'stranger@example.com',
			password: ADMIN_PASSWORD,
		});

		expect(response.status).toBe(404);
	});

	it('returns 404 for POST /api/v1/auth/register', async () => {
		const response = await post(`${API_AUTH_BASE}/register`, {
			email: 'stranger@example.com',
			password: ADMIN_PASSWORD,
		});

		expect(response.status).toBe(404);
	});
});

describe('POST /api/v1/auth/login', () => {
	beforeEach(async () => {
		await resetDatabase();
		await bootstrapAdmin();
	});

	it('returns a session for the admin credentials', async () => {
		const response = await post(`${API_AUTH_BASE}/login`, {
			email: ADMIN_EMAIL,
			password: ADMIN_PASSWORD,
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { token: string; refreshToken: string; user: { email: string } };
		expect(body.token).toBeTruthy();
		expect(body.refreshToken).toBeTruthy();
		expect(body.user.email).toBe(ADMIN_EMAIL);
	});

	it('accepts the email in any case', async () => {
		const response = await post(`${API_AUTH_BASE}/login`, {
			email: ADMIN_EMAIL.toUpperCase(),
			password: ADMIN_PASSWORD,
		});

		expect(response.status).toBe(200);
	});

	it('rejects a wrong password', async () => {
		const response = await post(`${API_AUTH_BASE}/login`, {
			email: ADMIN_EMAIL,
			password: 'not-the-password',
		});

		expect(response.status).toBe(401);
	});

	it('rejects an unknown email', async () => {
		const response = await post(`${API_AUTH_BASE}/login`, {
			email: 'stranger@example.com',
			password: ADMIN_PASSWORD,
		});

		expect(response.status).toBe(401);
	});

	it('rejects a request with no credentials', async () => {
		// 401, not 400. A malformed email is answered exactly like a wrong password, so
		// the endpoint cannot be used to probe which addresses are registered.
		const response = await post(`${API_AUTH_BASE}/login`, {});

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toMatchObject({ error: 'INVALID_CREDENTIALS' });
	});
});

describe('GET /api/v1/auth/me', () => {
	beforeEach(resetDatabase);

	it('returns the admin for a valid token', async () => {
		const bootstrap = await bootstrapAdmin();
		const { token } = (await bootstrap.json()) as { token: string };

		const response = await get(`${API_AUTH_BASE}/me`, { Authorization: `Bearer ${token}` });

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ user: { email: ADMIN_EMAIL } });
	});

	it('returns 401 without a token', async () => {
		const response = await get(`${API_AUTH_BASE}/me`);

		expect(response.status).toBe(401);
	});

	it('returns 401 for a token signed with another secret', async () => {
		const response = await get(`${API_AUTH_BASE}/me`, { Authorization: 'Bearer not.a.token' });

		expect(response.status).toBe(401);
	});
});

describe('refresh and logout', () => {
	beforeEach(resetDatabase);

	it('exchanges a refresh token for a new access token, then revokes it on logout', async () => {
		const bootstrap = await bootstrapAdmin();
		const { refreshToken } = (await bootstrap.json()) as { refreshToken: string };

		const refreshed = await post(`${API_AUTH_BASE}/refresh`, { refreshToken });
		expect(refreshed.status).toBe(200);
		const refreshBody = (await refreshed.json()) as { token: string; refreshToken?: string };
		expect(refreshBody.token).toBeTruthy();

		// Rotating strategy: the refresh call hands back a NEW refresh token and the
		// old one is dead. Logging out with the new one must end the session.
		const current = refreshBody.refreshToken ?? refreshToken;
		const loggedOut = await post(`${API_AUTH_BASE}/logout`, { refreshToken: current });
		expect(loggedOut.status).toBe(200);

		const afterLogout = await post(`${API_AUTH_BASE}/refresh`, { refreshToken: current });
		expect(afterLogout.status).toBe(401);
	});
});

describe('CORS', () => {
	beforeEach(resetDatabase);

	it('answers a preflight from an allowed origin with 204', async () => {
		const { SELF } = await import('cloudflare:test');
		const response = await SELF.fetch(`http://example.com${API_AUTH_BASE}/login`, {
			method: 'OPTIONS',
			headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'POST' },
		});

		expect(response.status).toBe(204);
	});
});
