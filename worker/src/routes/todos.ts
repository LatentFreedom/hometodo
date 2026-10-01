import { Hono } from 'hono';
import { getContact } from '../db/contacts';
import { getProject } from '../db/projects';
import { deleteTodo, externalIdTaken, getTodo, insertTodo, listTodos, updateTodo } from '../db/todos';
import { decodeCursor, encodeCursor, parseLimit } from '../lib/cursor';
import { badRequest, HttpError, notFound, readJsonObject } from '../lib/http';
import {
	parseEnumQuery,
	parseFlag,
	parseInput,
	TODO_SOURCES,
	TODO_STATUSES,
	type Field,
	type TodoSource,
	type TodoStatus,
	type Value,
} from '../lib/validate';
import type { Env } from '../types/env';

export const todoRoutes = new Hono<{ Bindings: Env }>();

const UPDATE_FIELDS: Record<string, Field> = {
	project_id: { type: 'ref' },
	title: { type: 'text', max: 500, required: true },
	notes: { type: 'text', max: 10_000 },
	status: { type: 'enum', values: TODO_STATUSES },
	due_date: { type: 'date' },
	cost_cents: { type: 'cents' },
	contact_id: { type: 'ref' },
};

const CREATE_FIELDS: Record<string, Field> = {
	...UPDATE_FIELDS,
	source: { type: 'enum', values: TODO_SOURCES },
	external_id: { type: 'text', max: 200 },
};

/**
 * A todo must belong to a real project and may name a real contact. Checked here so a
 * bad id is a 400 that names the field, not a foreign-key 500.
 */
async function checkReferences(db: D1Database, input: Record<string, Value>): Promise<void> {
	if ('project_id' in input) {
		if (input.project_id === null) throw badRequest('project_id is required', 'project_id');
		if (!(await getProject(db, input.project_id as string))) {
			throw badRequest('project_id does not match a project', 'project_id');
		}
	}
	if (typeof input.contact_id === 'string' && !(await getContact(db, input.contact_id))) {
		throw badRequest('contact_id does not match a contact', 'contact_id');
	}
}

/**
 * Keyset pagination in creation order. `next_cursor` is null on the last page.
 * Todos of archived projects are hidden unless include_archived=true.
 */
todoRoutes.get('/', async (c) => {
	const limit = parseLimit(c.req.query('limit'));
	const rows = await listTodos(c.env.DB, {
		projectId: c.req.query('project_id') ?? null,
		status: parseEnumQuery('status', c.req.query('status'), TODO_STATUSES),
		contactId: c.req.query('contact_id') ?? null,
		includeArchived: parseFlag('include_archived', c.req.query('include_archived')),
		after: decodeCursor(c.req.query('cursor')),
		limit,
	});

	const todos = rows.slice(0, limit);
	const last = todos[todos.length - 1];
	const nextCursor = rows.length > limit && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;
	return c.json({ todos, next_cursor: nextCursor });
});

todoRoutes.post('/', async (c) => {
	const input = parseInput(await readJsonObject(c), CREATE_FIELDS, 'create');
	if (!('project_id' in input)) throw badRequest('project_id is required', 'project_id');
	await checkReferences(c.env.DB, input);

	const source = (input.source as TodoSource | undefined) ?? 'manual';
	const externalId = (input.external_id as string | null | undefined) ?? null;
	// A repeat import must be refused, not duplicated; 409 lets an importer skip the row.
	if (externalId !== null && (await externalIdTaken(c.env.DB, source, externalId))) {
		throw new HttpError(409, 'CONFLICT', 'A todo with this source and external_id already exists', 'external_id');
	}

	const todo = await insertTodo(c.env.DB, {
		project_id: input.project_id as string,
		title: input.title as string,
		notes: (input.notes as string | null | undefined) ?? null,
		status: (input.status as TodoStatus | undefined) ?? 'open',
		due_date: (input.due_date as string | null | undefined) ?? null,
		cost_cents: (input.cost_cents as number | null | undefined) ?? null,
		contact_id: (input.contact_id as string | null | undefined) ?? null,
		source,
		external_id: externalId,
	});
	return c.json({ todo }, 201);
});

todoRoutes.get('/:id', async (c) => {
	const todo = await getTodo(c.env.DB, c.req.param('id'));
	if (!todo) throw notFound('Todo');
	return c.json({ todo });
});

todoRoutes.patch('/:id', async (c) => {
	const changes = parseInput(await readJsonObject(c), UPDATE_FIELDS, 'update');
	await checkReferences(c.env.DB, changes);
	const todo = await updateTodo(c.env.DB, c.req.param('id'), changes);
	if (!todo) throw notFound('Todo');
	return c.json({ todo });
});

/** Todos are hard deleted; marking one done is how work is kept. */
todoRoutes.delete('/:id', async (c) => {
	if (!(await deleteTodo(c.env.DB, c.req.param('id')))) throw notFound('Todo');
	return c.body(null, 204);
});
