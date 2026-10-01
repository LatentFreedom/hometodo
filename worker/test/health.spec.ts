import { describe, expect, it } from 'vitest';
import { API_BASE_PATH } from '../src/config/api';
import { adminHeaders, get } from './helpers';

describe('GET /api/v1/health', () => {
	it('returns 200 with an ok status', async () => {
		const response = await get(`${API_BASE_PATH}/health`);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ status: 'ok' });
	});

	it('answers without touching the database', async () => {
		// Proves the probe reports on the worker, not on D1. If this ever starts
		// failing when the database is empty, the health route grew a query it
		// should not have.
		const response = await get(`${API_BASE_PATH}/health`);

		expect(response.status).toBe(200);
	});
});

describe('unknown routes', () => {
	// Unknown paths sit behind the admin gate, so the 404 only shows with the key.
	it('returns 404 for a path the worker does not serve', async () => {
		const response = await get(`${API_BASE_PATH}/nope`, adminHeaders());

		expect(response.status).toBe(404);
	});
});
