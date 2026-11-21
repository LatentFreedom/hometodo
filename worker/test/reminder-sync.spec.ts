import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { API_BASE_PATH } from '../src/config/api';
import type { Env } from '../src/types/env';
import { adminHeaders, apiUrl, createProject, ORIGIN, resetDatabase } from './helpers';

const TODOS = `${API_BASE_PATH}/todos`;
const NOTIFY_URL = 'https://notify.example.com/api/v1';
const NOTIFY_TOKEN = 'test-notify-token';

interface Call {
	url: string;
	method: string;
	headers: Headers;
	body: unknown;
}

interface Todo {
	id: string;
	status: string;
	remind_at: string | null;
	due_date: string | null;
	[key: string]: unknown;
}

let calls: Call[] = [];
let answer: () => Promise<Response> = () => Promise.resolve(Response.json({ reminder: {} }));

// The worker runs in this isolate, so stubbing the global fetch captures every outbound call
beforeEach(async () => {
	await resetDatabase();
	calls = [];
	answer = () => Promise.resolve(Response.json({ reminder: {} }));
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const request = new Request(input as RequestInfo, init);
		const text = await request.text();
		calls.push({ url: request.url, method: request.method, headers: request.headers, body: text ? JSON.parse(text) : null });
		return answer();
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

const withNotify: Env = { ...env, LIVE_NOTIFY_URL: NOTIFY_URL, LIVE_NOTIFY_TOKEN: NOTIFY_TOKEN };

/** Calls the worker directly so the test can wait for every waitUntil task to settle. */
async function send(method: string, path: string, body: unknown, bindings: Env = withNotify): Promise<Response> {
	const ctx = createExecutionContext();
	const init: RequestInit = { method, headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...adminHeaders() } };
	if (body !== undefined) init.body = JSON.stringify(body);
	const response = await worker.fetch(new Request(apiUrl(path), init), bindings, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

async function create(projectId: string, body: Record<string, unknown>, bindings: Env = withNotify): Promise<Todo> {
	const response = await send('POST', TODOS, { project_id: projectId, title: 'Example todo', ...body }, bindings);
	expect(response.status).toBe(201);
	return ((await response.json()) as { todo: Todo }).todo;
}

function keyUrl(id: string, done = false): string {
	return `${NOTIFY_URL}/reminders/by-key/hometodo:todo:${id}${done ? '/done' : ''}`;
}

describe('reminder sync to live.imnotbot', () => {
	it('creating a todo with a due_date makes one PUT with the bare date', async () => {
		const project = await createProject();
		const todo = await create(project.id, { title: 'Example gutter repair', due_date: '2026-12-01', notes: 'Example private note' });

		expect(calls).toHaveLength(1);
		const [call] = calls;
		expect(call?.method).toBe('PUT');
		expect(call?.url).toBe(keyUrl(todo.id));
		expect(call?.headers.get('Authorization')).toBe(`Bearer ${NOTIFY_TOKEN}`);
		// Only the title and the link leave the app; notes never do
		expect(call?.body).toEqual({
			note: 'Example gutter repair',
			remind_at: '2026-12-01',
			timed: false,
			link_url: `http://localhost:3000/todo/?id=${todo.id}`,
		});
	});

	it('PATCH remind_at sends a timed PUT with the UTC time', async () => {
		const project = await createProject();
		const todo = await create(project.id, { due_date: '2026-12-01' });
		calls = [];

		const response = await send('PATCH', `${TODOS}/${todo.id}`, { remind_at: '2026-12-01T09:00:00-05:00' });
		expect(response.status).toBe(200);
		const saved = ((await response.json()) as { todo: Todo }).todo;
		expect(saved.remind_at).toBe('2026-12-01T14:00:00Z');

		expect(calls).toHaveLength(1);
		expect(calls[0]?.method).toBe('PUT');
		expect(calls[0]?.url).toBe(keyUrl(todo.id));
		expect(calls[0]?.body).toMatchObject({ remind_at: '2026-12-01T14:00:00Z', timed: true });
	});

	it('PATCH status to done sends the by-key done call', async () => {
		const project = await createProject();
		const todo = await create(project.id, { remind_at: '2026-12-01T14:00:00Z' });
		calls = [];

		expect((await send('PATCH', `${TODOS}/${todo.id}`, { status: 'done' })).status).toBe(200);
		expect(calls.map((call) => [call.method, call.url])).toEqual([['POST', keyUrl(todo.id, true)]]);
	});

	it('DELETE sends the by-key done call', async () => {
		const project = await createProject();
		const todo = await create(project.id, { due_date: '2026-12-01' });
		calls = [];

		expect((await send('DELETE', `${TODOS}/${todo.id}`, undefined)).status).toBe(204);
		expect(calls.map((call) => [call.method, call.url])).toEqual([['POST', keyUrl(todo.id, true)]]);
	});

	it('a todo with neither a due date nor a remind time sends done', async () => {
		const project = await createProject();
		const todo = await create(project.id, { due_date: '2026-12-01' });
		calls = [];

		expect((await send('PATCH', `${TODOS}/${todo.id}`, { due_date: null })).status).toBe(200);
		expect(calls.map((call) => [call.method, call.url])).toEqual([['POST', keyUrl(todo.id, true)]]);
	});

	it('a waiting todo still gets its reminder', async () => {
		const project = await createProject();
		const todo = await create(project.id, { status: 'waiting', due_date: '2026-12-01' });
		expect(calls.map((call) => [call.method, call.url])).toEqual([['PUT', keyUrl(todo.id)]]);
	});

	it('finishing a repeating todo sends done for it and a PUT for the next one, which falls back to its due date', async () => {
		const project = await createProject();
		const todo = await create(project.id, {
			due_date: '2026-12-01',
			remind_at: '2026-11-30T14:00:00Z',
			repeat_mode: 'fixed',
			repeat_every: 1,
			repeat_unit: 'week',
		});
		calls = [];

		const response = await send('PATCH', `${TODOS}/${todo.id}`, { status: 'done' });
		expect(response.status).toBe(200);
		const next = ((await response.json()) as { next_todo: Todo }).next_todo;
		expect(next.remind_at).toBeNull();
		expect(next.due_date).toBe('2026-12-08');

		expect(calls.map((call) => [call.method, call.url])).toEqual([
			['POST', keyUrl(todo.id, true)],
			['PUT', keyUrl(next.id)],
		]);
		expect(calls[1]?.body).toMatchObject({ remind_at: '2026-12-08', timed: false });
	});

	it('a 500 from live.imnotbot still lets the PATCH return 200 and keeps the change', async () => {
		answer = () => Promise.resolve(new Response('boom', { status: 500 }));
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const project = await createProject();
		const todo = await create(project.id, { due_date: '2026-12-01' });

		const response = await send('PATCH', `${TODOS}/${todo.id}`, { remind_at: '2026-12-02T15:00:00Z' });
		expect(response.status).toBe(200);
		expect(((await response.json()) as { todo: Todo }).todo.remind_at).toBe('2026-12-02T15:00:00Z');
		expect(calls).toHaveLength(2);
		expect(error).toHaveBeenCalled();
		// The token never reaches the log
		expect(JSON.stringify(error.mock.calls)).not.toContain(NOTIFY_TOKEN);
	});

	it('a network failure from live.imnotbot still lets the PATCH return 200', async () => {
		answer = () => Promise.reject(new TypeError('network down'));
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const project = await createProject();
		const todo = await create(project.id, { due_date: '2026-12-01' });

		expect((await send('PATCH', `${TODOS}/${todo.id}`, { title: 'Example renamed' })).status).toBe(200);
	});

	it('with LIVE_NOTIFY_TOKEN unset, no outbound request is made and every todo route behaves as before', async () => {
		const bindings: Env = { ...env, LIVE_NOTIFY_URL: NOTIFY_URL, LIVE_NOTIFY_TOKEN: '' };
		const project = await createProject();
		const todo = await create(project.id, { due_date: '2026-12-01', remind_at: '2026-11-30T14:00:00Z' }, bindings);
		expect((await send('GET', `${TODOS}/${todo.id}`, undefined, bindings)).status).toBe(200);
		expect((await send('PATCH', `${TODOS}/${todo.id}`, { status: 'done' }, bindings)).status).toBe(200);
		expect((await send('DELETE', `${TODOS}/${todo.id}`, undefined, bindings)).status).toBe(204);
		expect(calls).toHaveLength(0);
	});

	it('with LIVE_NOTIFY_URL unset, no outbound request is made', async () => {
		const bindings: Env = { ...env, LIVE_NOTIFY_URL: '', LIVE_NOTIFY_TOKEN: NOTIFY_TOKEN };
		const project = await createProject();
		await create(project.id, { due_date: '2026-12-01' }, bindings);
		expect(calls).toHaveLength(0);
	});

	it('PATCH remind_at "tomorrow" returns 400 naming the field', async () => {
		const project = await createProject();
		const todo = await create(project.id, {});
		calls = [];

		const response = await send('PATCH', `${TODOS}/${todo.id}`, { remind_at: 'tomorrow' });
		expect(response.status).toBe(400);
		const body = (await response.json()) as { field: string; message: string };
		expect(body.field).toBe('remind_at');
		expect(body.message).toContain('UTC');
		expect(calls).toHaveLength(0);
	});

	it('refuses a remind_at with no zone or an impossible day', async () => {
		const project = await createProject();
		const todo = await create(project.id, {});
		for (const value of ['2026-12-01T14:00:00', '2026-02-30T14:00:00Z', '2026-12-01', 1_796_000_000]) {
			const response = await send('PATCH', `${TODOS}/${todo.id}`, { remind_at: value });
			expect(response.status, String(value)).toBe(400);
		}
	});

	it('PATCH remind_at null clears it and falls back to the due date', async () => {
		const project = await createProject();
		const todo = await create(project.id, { due_date: '2026-12-01', remind_at: '2026-11-30T14:00:00Z' });
		calls = [];

		const response = await send('PATCH', `${TODOS}/${todo.id}`, { remind_at: null });
		expect(((await response.json()) as { todo: Todo }).todo.remind_at).toBeNull();
		expect(calls[0]?.body).toMatchObject({ remind_at: '2026-12-01', timed: false });
	});
});
