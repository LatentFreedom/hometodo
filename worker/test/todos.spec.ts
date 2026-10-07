import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { API_BASE_PATH } from '../src/config/api';
import { adminHeaders, createContact, createProject, createTodo, del, get, patch, post, resetDatabase } from './helpers';

const TODOS = `${API_BASE_PATH}/todos`;

interface Todo {
	id: string;
	status: string;
	completed_at: string | null;
	[key: string]: unknown;
}

interface Page {
	todos: Todo[];
	next_cursor: string | null;
}

async function readPage(query: string): Promise<Page> {
	const response = await get(`${TODOS}${query}`, adminHeaders());
	expect(response.status).toBe(200);
	return (await response.json()) as Page;
}

/** Many rows at once, straight into D1, all sharing one created_at to force cursor ties. */
async function seedTodos(projectId: string, count: number): Promise<string[]> {
	const ids = Array.from({ length: count }, () => crypto.randomUUID());
	await env.DB.batch(
		ids.map((id, index) =>
			env.DB.prepare("INSERT INTO todos (id, project_id, title, created_at) VALUES (?, ?, ?, '2026-01-01 00:00:00')").bind(
				id,
				projectId,
				`Example todo ${index}`,
			),
		),
	);
	return ids;
}

describe('todos API', () => {
	beforeEach(resetDatabase);

	it('creates a todo with defaults and every optional field', async () => {
		const project = await createProject();
		const contact = await createContact();

		const plain = await createTodo(project.id);
		expect(plain).toMatchObject({ status: 'open', source: 'manual', completed_at: null, contact_id: null });

		const response = await post(
			TODOS,
			{
				project_id: project.id,
				title: 'Example gutter repair',
				notes: 'Example note',
				status: 'waiting',
				due_date: '2026-11-30',
				cost_cents: 12_500,
				contact_id: contact.id,
				source: 'reminders',
				external_id: 'example-external-1',
			},
			adminHeaders(),
		);
		expect(response.status).toBe(201);
		expect(await response.json()).toMatchObject({
			todo: { status: 'waiting', due_date: '2026-11-30', cost_cents: 12_500, contact_id: contact.id, source: 'reminders' },
		});
	});

	it('reads and deletes a todo', async () => {
		const project = await createProject();
		const todo = await createTodo(project.id);

		expect(await (await get(`${TODOS}/${todo.id}`, adminHeaders())).json()).toMatchObject({ todo: { id: todo.id } });
		expect((await del(`${TODOS}/${todo.id}`, adminHeaders())).status).toBe(204);
		expect((await get(`${TODOS}/${todo.id}`, adminHeaders())).status).toBe(404);
		// A second delete finds nothing, and the row is still there for a sync pull
		expect((await del(`${TODOS}/${todo.id}`, adminHeaders())).status).toBe(404);
		const kept = (await (await get(`${TODOS}/${todo.id}?include_deleted=true`, adminHeaders())).json()) as { todo: Todo };
		expect(kept.todo.id).toBe(todo.id);
		expect(kept.todo.deleted_at).not.toBeNull();
	});

	it('answers 404 for a todo that does not exist', async () => {
		const missing = `${TODOS}/00000000-0000-4000-8000-000000000000`;
		expect((await get(missing, adminHeaders())).status).toBe(404);
		expect((await patch(missing, { title: 'Example' }, adminHeaders())).status).toBe(404);
		expect((await del(missing, adminHeaders())).status).toBe(404);
	});

	it('rejects an unknown status with 400 on create, update, and list', async () => {
		const project = await createProject();
		const created = await post(TODOS, { project_id: project.id, title: 'Example', status: 'maybe' }, adminHeaders());
		expect(created.status).toBe(400);
		expect(await created.json()).toMatchObject({ error: 'VALIDATION_ERROR', field: 'status' });

		const todo = await createTodo(project.id);
		expect((await patch(`${TODOS}/${todo.id}`, { status: 'maybe' }, adminHeaders())).status).toBe(400);
		expect((await patch(`${TODOS}/${todo.id}`, { status: null }, adminHeaders())).status).toBe(400);
		expect((await get(`${TODOS}?status=maybe`, adminHeaders())).status).toBe(400);
	});

	it('rejects bad input with 400', async () => {
		const project = await createProject();
		const base = { project_id: project.id, title: 'Example' };
		const cases: unknown[] = [
			{ title: 'Example' },
			{ project_id: project.id },
			{ ...base, title: '' },
			{ ...base, project_id: null },
			{ ...base, project_id: '00000000-0000-4000-8000-000000000000' },
			{ ...base, contact_id: '00000000-0000-4000-8000-000000000000' },
			{ ...base, due_date: '2026-02-30' },
			{ ...base, due_date: '30/11/2026' },
			{ ...base, due_date: '2026-11-30T10:00:00Z' },
			{ ...base, cost_cents: -1 },
			{ ...base, cost_cents: 12.5 },
			{ ...base, cost_cents: '1250' },
			{ ...base, source: 'email' },
			{ ...base, completed_at: '2026-01-01 00:00:00' },
			{ ...base, priority: 'high' },
		];
		for (const body of cases) {
			expect((await post(TODOS, body, adminHeaders())).status, JSON.stringify(body)).toBe(400);
		}

		const todo = await createTodo(project.id);
		for (const body of [{}, { title: null }, { project_id: 'missing' }, { source: 'manual' }, { external_id: 'x' }, { due_date: '2026-13-01' }]) {
			expect((await patch(`${TODOS}/${todo.id}`, body, adminHeaders())).status, JSON.stringify(body)).toBe(400);
		}
	});

	it('clears optional fields with null and moves a todo to another project', async () => {
		const first = await createProject();
		const second = await createProject({ name: 'Example second' });
		const contact = await createContact();
		const todo = await createTodo(first.id, { due_date: '2026-12-01', cost_cents: 100, contact_id: contact.id, notes: 'Example' });

		const response = await patch(
			`${TODOS}/${todo.id}`,
			{ project_id: second.id, due_date: null, cost_cents: null, contact_id: null, notes: null },
			adminHeaders(),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			todo: { project_id: second.id, due_date: null, cost_cents: null, contact_id: null, notes: null },
		});
	});

	it('refuses a second todo with the same source and external_id with 409', async () => {
		const project = await createProject();
		const body = { project_id: project.id, title: 'Example', source: 'reminders', external_id: 'example-external-2' };
		expect((await post(TODOS, body, adminHeaders())).status).toBe(201);
		const repeat = await post(TODOS, body, adminHeaders());
		expect(repeat.status).toBe(409);
		expect(await repeat.json()).toMatchObject({ error: 'CONFLICT' });

		// The same external id from another source is a different row.
		expect((await post(TODOS, { ...body, source: 'manual' }, adminHeaders())).status).toBe(201);
	});
});

describe('todo status and completed_at', () => {
	beforeEach(resetDatabase);

	it('PATCH to done returns a non-null completed_at', async () => {
		const project = await createProject();
		const todo = await createTodo(project.id);

		const response = await patch(`${TODOS}/${todo.id}`, { status: 'done' }, adminHeaders());
		expect(response.status).toBe(200);
		const body = (await response.json()) as { todo: Todo };
		expect(body.todo.status).toBe('done');
		expect(body.todo.completed_at).not.toBeNull();
		expect(body.todo.completed_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
	});

	it('keeps the first completed_at when done is sent again', async () => {
		const project = await createProject();
		const todo = await createTodo(project.id);
		await env.DB.prepare("UPDATE todos SET status = 'done', completed_at = '2026-01-02 03:04:05' WHERE id = ?").bind(todo.id).run();

		const response = await patch(`${TODOS}/${todo.id}`, { status: 'done', title: 'Example renamed' }, adminHeaders());
		expect(await response.json()).toMatchObject({ todo: { completed_at: '2026-01-02 03:04:05' } });
	});

	it('clears completed_at when a todo leaves done, for either status', async () => {
		const project = await createProject();
		for (const next of ['open', 'waiting']) {
			const todo = await createTodo(project.id, { status: 'done' });
			expect(todo.completed_at).not.toBeNull();
			const response = await patch(`${TODOS}/${todo.id}`, { status: next }, adminHeaders());
			expect(await response.json()).toMatchObject({ todo: { status: next, completed_at: null } });
		}
	});

	it('moves freely between open and waiting without a stamp', async () => {
		const project = await createProject();
		const todo = await createTodo(project.id);
		const waiting = await patch(`${TODOS}/${todo.id}`, { status: 'waiting' }, adminHeaders());
		expect(await waiting.json()).toMatchObject({ todo: { status: 'waiting', completed_at: null } });
		const open = await patch(`${TODOS}/${todo.id}`, { status: 'open' }, adminHeaders());
		expect(await open.json()).toMatchObject({ todo: { status: 'open', completed_at: null } });
	});

	it('leaves completed_at alone when the status is not part of the change', async () => {
		const project = await createProject();
		const todo = await createTodo(project.id, { status: 'done' });
		const response = await patch(`${TODOS}/${todo.id}`, { title: 'Example renamed' }, adminHeaders());
		expect(await response.json()).toMatchObject({ todo: { status: 'done', completed_at: todo.completed_at } });
	});
});

describe('todo list and pagination', () => {
	beforeEach(resetDatabase);

	it('returns 50 rows by default and a cursor to the rest', async () => {
		const project = await createProject();
		await seedTodos(project.id, 55);

		const first = await readPage('');
		expect(first.todos).toHaveLength(50);
		expect(first.next_cursor).toEqual(expect.any(String));

		const second = await readPage(`?cursor=${first.next_cursor}`);
		expect(second.todos).toHaveLength(5);
		expect(second.next_cursor).toBeNull();
	});

	it('caps a page at 200 rows', async () => {
		const project = await createProject();
		await seedTodos(project.id, 205);

		const page = await readPage('?limit=200');
		expect(page.todos).toHaveLength(200);
		expect(page.next_cursor).not.toBeNull();
	});

	it('refuses a limit outside 1 to 200 and a cursor that does not decode', async () => {
		for (const query of ['?limit=0', '?limit=201', '?limit=-5', '?limit=abc', '?limit=10.5', '?limit=', '?cursor=not-a-cursor', '?cursor=W10']) {
			const response = await get(`${TODOS}${query}`, adminHeaders());
			expect(response.status, query).toBe(400);
		}
	});

	it('walks every row exactly once across pages, even when created_at ties', async () => {
		const project = await createProject();
		const ids = await seedTodos(project.id, 23);

		const seen: string[] = [];
		let cursor: string | null = null;
		let pages = 0;
		do {
			const page: Page = await readPage(`?limit=7${cursor ? `&cursor=${cursor}` : ''}`);
			seen.push(...page.todos.map((todo) => todo.id));
			cursor = page.next_cursor;
			pages += 1;
		} while (cursor !== null);

		expect(pages).toBe(4);
		expect(seen).toHaveLength(23);
		expect(new Set(seen)).toEqual(new Set(ids));
	});

	it('returns no cursor when the last page is exactly full', async () => {
		const project = await createProject();
		await seedTodos(project.id, 10);
		expect((await readPage('?limit=10')).next_cursor).toBeNull();
	});

	it('filters by project, status, and contact', async () => {
		const first = await createProject();
		const second = await createProject({ name: 'Example second' });
		const contact = await createContact();
		const open = await createTodo(first.id);
		const waiting = await createTodo(first.id, { status: 'waiting', contact_id: contact.id });
		const other = await createTodo(second.id);

		const ids = (page: Page) => page.todos.map((todo) => todo.id).sort();
		expect(ids(await readPage(`?project_id=${first.id}`))).toEqual([open.id, waiting.id].sort());
		expect(ids(await readPage('?status=waiting'))).toEqual([waiting.id]);
		expect(ids(await readPage(`?contact_id=${contact.id}`))).toEqual([waiting.id]);
		expect(ids(await readPage(''))).toEqual([open.id, waiting.id, other.id].sort());
	});

	it('hides todos of archived projects unless include_archived=true', async () => {
		const active = await createProject();
		const archived = await createProject({ name: 'Example archived' });
		const visible = await createTodo(active.id);
		const hidden = await createTodo(archived.id);
		await del(`${API_BASE_PATH}/projects/${archived.id}`, adminHeaders());

		expect((await readPage('')).todos.map((todo) => todo.id)).toEqual([visible.id]);
		expect((await readPage(`?project_id=${archived.id}`)).todos).toEqual([]);
		const all = await readPage('?include_archived=true');
		expect(all.todos.map((todo) => todo.id).sort()).toEqual([visible.id, hidden.id].sort());
		expect((await get(`${TODOS}?include_archived=1`, adminHeaders())).status).toBe(400);
	});

	describe('sync support', () => {
		it('hides deleted todos from list and PATCH unless include_deleted=true', async () => {
			const project = await createProject();
			const kept = await createTodo(project.id);
			const gone = await createTodo(project.id, { title: 'Example removed' });
			await del(`${TODOS}/${gone.id}`, adminHeaders());

			expect((await readPage('')).todos.map((todo) => todo.id)).toEqual([kept.id]);
			expect((await patch(`${TODOS}/${gone.id}`, { title: 'Example revived' }, adminHeaders())).status).toBe(404);
			const all = await readPage('?include_deleted=true');
			expect(all.todos.map((todo) => todo.id).sort()).toEqual([kept.id, gone.id].sort());
			expect(all.todos.find((todo) => todo.id === gone.id)?.deleted_at).not.toBeNull();
		});

		it('returns only rows changed at or after updated_since, in either stamp form', async () => {
			const project = await createProject();
			const old = await createTodo(project.id, { title: 'Example old' });
			const fresh = await createTodo(project.id, { title: 'Example fresh' });
			await env.DB.prepare("UPDATE todos SET updated_at = '2026-01-01 00:00:00' WHERE id = ?").bind(old.id).run();
			await env.DB.prepare("UPDATE todos SET updated_at = '2026-02-01 12:00:00' WHERE id = ?").bind(fresh.id).run();

			expect((await readPage('?updated_since=2026-02-01T12:00:00Z')).todos.map((todo) => todo.id)).toEqual([fresh.id]);
			expect((await readPage('?updated_since=2026-02-01%2012:00:00')).todos.map((todo) => todo.id)).toEqual([fresh.id]);
			expect((await readPage('?updated_since=2026-01-01T00:00:00Z')).todos.map((todo) => todo.id).sort()).toEqual([old.id, fresh.id].sort());
			expect((await readPage('?updated_since=2026-03-01T00:00:00Z')).todos).toEqual([]);
			expect((await get(`${TODOS}?updated_since=yesterday`, adminHeaders())).status).toBe(400);
		});

		it('stamps updated_at and deleted_at on delete so a pull after the delete sees it', async () => {
			const project = await createProject();
			const todo = await createTodo(project.id);
			await env.DB.prepare("UPDATE todos SET updated_at = '2026-01-01 00:00:00' WHERE id = ?").bind(todo.id).run();
			await del(`${TODOS}/${todo.id}`, adminHeaders());

			const page = await readPage('?updated_since=2026-06-01T00:00:00Z&include_deleted=true');
			expect(page.todos.map((item) => item.id)).toEqual([todo.id]);
		});

		it('accepts a caller UUID on create and refuses a repeat with 409', async () => {
			const project = await createProject();
			const id = crypto.randomUUID();
			const created = await post(TODOS, { id, project_id: project.id, title: 'Example offline todo' }, adminHeaders());
			expect(created.status).toBe(201);
			expect(((await created.json()) as { todo: Todo }).todo.id).toBe(id);

			const repeat = await post(TODOS, { id, project_id: project.id, title: 'Example repeat' }, adminHeaders());
			expect(repeat.status).toBe(409);
			// Deleting does not free the id
			await del(`${TODOS}/${id}`, adminHeaders());
			expect((await post(TODOS, { id, project_id: project.id, title: 'Example again' }, adminHeaders())).status).toBe(409);
			expect((await post(TODOS, { id: 'not-a-uuid', project_id: project.id, title: 'Example bad id' }, adminHeaders())).status).toBe(400);
		});
	});
});
