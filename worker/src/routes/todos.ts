import { Hono } from 'hono';
import { getContact } from '../db/contacts';
import { getProject } from '../db/projects';
import { deleteTodo, externalIdTaken, getTodo, insertNextOccurrence, insertTodo, listTodos, todoIdTaken, updateTodo, type TodoRow } from '../db/todos';
import { decodeCursor, encodeCursor, parseLimit } from '../lib/cursor';
import { badRequest, HttpError, notFound, readJsonObject } from '../lib/http';
import { nextDueDate, todayIn } from '../lib/repeat';
import {
	parseEnumQuery,
	parseFlag,
	parseInput,
	REPEAT_MODES,
	REPEAT_UNITS,
	TODO_SOURCES,
	TODO_STATUSES,
	type Field,
	type RepeatMode,
	type RepeatUnit,
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
	repeat_mode: { type: 'enum', values: REPEAT_MODES, nullable: true },
	// A cap keeps a typo such as 9000 weeks from looking like a real rule
	repeat_every: { type: 'count', max: 366 },
	repeat_unit: { type: 'enum', values: REPEAT_UNITS, nullable: true },
};

const REPEAT_FIELDS = ['repeat_mode', 'repeat_every', 'repeat_unit'] as const;

const CREATE_FIELDS: Record<string, Field> = {
	...UPDATE_FIELDS,
	// A replica that created the todo offline sends the UUID it already stored
	id: { type: 'text', max: 36 },
	source: { type: 'enum', values: TODO_SOURCES },
	external_id: { type: 'text', max: 200 },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// updated_since arrives as ISO 8601 or as the D1 form 'YYYY-MM-DD HH:MM:SS'; rows are
// compared as text in the D1 form, so the value is normalised to it here.
const STAMP_PATTERN = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|[+-]00:?00)?$/;

function parseStamp(name: string, raw: string | undefined): string | null {
	if (raw === undefined) return null;
	const match = STAMP_PATTERN.exec(raw);
	if (!match) throw badRequest(`${name} must be a UTC timestamp such as 2026-01-31T12:00:00Z`, name);
	return `${match[1]} ${match[2]}`;
}

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
 * A rule is all three repeat fields or none, judged on the row as it will be after the
 * change, so a PATCH may send only repeat_every. A fixed rule counts from the due date,
 * so it needs one; clearing the due date of a fixed todo is refused the same way.
 */
function checkRepeatRule(input: Record<string, Value>, existing: TodoRow | null): void {
	const after = (key: string): Value => (key in input ? input[key] : ((existing?.[key as keyof TodoRow] as Value | undefined) ?? null));
	const set = REPEAT_FIELDS.filter((key) => after(key) !== null);
	if (set.length !== 0 && set.length !== REPEAT_FIELDS.length) {
		const missing = REPEAT_FIELDS.find((key) => after(key) === null) as string;
		throw badRequest('repeat_mode, repeat_every and repeat_unit are set together or all null', missing);
	}
	if (after('repeat_mode') === 'fixed' && after('due_date') === null) {
		throw badRequest('A fixed repeat needs a due_date to count from', 'due_date');
	}
}

/** The successor of a todo that just became done, or null when it has no rule or already has one. */
function spawnNext(env: Env, finished: TodoRow): Promise<TodoRow | null> {
	if (finished.status !== 'done' || !finished.repeat_mode || !finished.repeat_every || !finished.repeat_unit) {
		return Promise.resolve(null);
	}
	const rule = { mode: finished.repeat_mode, every: finished.repeat_every, unit: finished.repeat_unit };
	return insertNextOccurrence(env.DB, finished, nextDueDate(rule, finished.due_date, todayIn(env.HOME_TZ)));
}

/**
 * Keyset pagination in creation order. `next_cursor` is null on the last page.
 * Todos of archived projects are hidden unless include_archived=true, and deleted todos
 * unless include_deleted=true. updated_since narrows to rows changed at or after a stamp,
 * which is how a replica pulls only what moved since its last sync.
 */
todoRoutes.get('/', async (c) => {
	const limit = parseLimit(c.req.query('limit'));
	const rows = await listTodos(c.env.DB, {
		projectId: c.req.query('project_id') ?? null,
		status: parseEnumQuery('status', c.req.query('status'), TODO_STATUSES),
		contactId: c.req.query('contact_id') ?? null,
		includeArchived: parseFlag('include_archived', c.req.query('include_archived')),
		includeDeleted: parseFlag('include_deleted', c.req.query('include_deleted')),
		updatedSince: parseStamp('updated_since', c.req.query('updated_since')),
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
	checkRepeatRule(input, null);

	const source = (input.source as TodoSource | undefined) ?? 'manual';
	const externalId = (input.external_id as string | null | undefined) ?? null;
	// A repeat import must be refused, not duplicated; 409 lets an importer skip the row.
	if (externalId !== null && (await externalIdTaken(c.env.DB, source, externalId))) {
		throw new HttpError(409, 'CONFLICT', 'A todo with this source and external_id already exists', 'external_id');
	}

	const id = (input.id as string | null | undefined) ?? undefined;
	if (id !== undefined) {
		if (!UUID_PATTERN.test(id)) throw badRequest('id must be a UUID', 'id');
		// Includes deleted rows: an id is never reused, so a replica cannot resurrect one
		if (await todoIdTaken(c.env.DB, id)) throw new HttpError(409, 'CONFLICT', 'A todo with this id already exists', 'id');
	}

	const todo = await insertTodo(c.env.DB, {
		id,
		project_id: input.project_id as string,
		title: input.title as string,
		notes: (input.notes as string | null | undefined) ?? null,
		status: (input.status as TodoStatus | undefined) ?? 'open',
		due_date: (input.due_date as string | null | undefined) ?? null,
		cost_cents: (input.cost_cents as number | null | undefined) ?? null,
		contact_id: (input.contact_id as string | null | undefined) ?? null,
		source,
		external_id: externalId,
		repeat_mode: (input.repeat_mode as RepeatMode | null | undefined) ?? null,
		repeat_every: (input.repeat_every as number | null | undefined) ?? null,
		repeat_unit: (input.repeat_unit as RepeatUnit | null | undefined) ?? null,
	});
	// A replica that created and finished a todo offline sends it already done
	const nextTodo = await spawnNext(c.env, todo);
	return c.json({ todo, next_todo: nextTodo }, 201);
});

/** include_deleted=true lets a replica confirm a delete it has not pulled yet. */
todoRoutes.get('/:id', async (c) => {
	const todo = await getTodo(c.env.DB, c.req.param('id'), parseFlag('include_deleted', c.req.query('include_deleted')));
	if (!todo) throw notFound('Todo');
	return c.json({ todo });
});

/**
 * A deleted todo is 404 here too, so a stale replica edit cannot bring it back.
 * Only the move into done spawns a successor: the dashboard sync resends status on every
 * PATCH, so a todo that was already done must not count as finishing again.
 */
todoRoutes.patch('/:id', async (c) => {
	const changes = parseInput(await readJsonObject(c), UPDATE_FIELDS, 'update');
	await checkReferences(c.env.DB, changes);
	const before = await getTodo(c.env.DB, c.req.param('id'));
	if (!before) throw notFound('Todo');
	checkRepeatRule(changes, before);
	const todo = await updateTodo(c.env.DB, c.req.param('id'), changes);
	if (!todo) throw notFound('Todo');
	const nextTodo = before.status === 'done' ? null : await spawnNext(c.env, todo);
	return c.json({ todo, next_todo: nextTodo });
});

/**
 * Soft delete. Marking a todo done is still how finished work is kept; a delete is for
 * a todo that should never have existed, and the stamped row only serves the sync pull.
 */
todoRoutes.delete('/:id', async (c) => {
	if (!(await deleteTodo(c.env.DB, c.req.param('id')))) throw notFound('Todo');
	return c.body(null, 204);
});
