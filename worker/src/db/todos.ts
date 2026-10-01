import type { CursorPosition } from '../lib/cursor';
import type { TodoSource, TodoStatus, Value } from '../lib/validate';
import { assign, updateRow, type Assignment } from './update';

export interface TodoRow {
	id: string;
	project_id: string;
	title: string;
	notes: string | null;
	status: TodoStatus;
	due_date: string | null;
	cost_cents: number | null;
	contact_id: string | null;
	source: TodoSource;
	external_id: string | null;
	completed_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface TodoInsert {
	project_id: string;
	title: string;
	notes: string | null;
	status: TodoStatus;
	due_date: string | null;
	cost_cents: number | null;
	contact_id: string | null;
	source: TodoSource;
	external_id: string | null;
}

export interface TodoFilter {
	projectId: string | null;
	status: TodoStatus | null;
	contactId: string | null;
	includeArchived: boolean;
	after: CursorPosition | null;
	limit: number;
}

// Fields a PATCH may change. source and external_id are provenance from an import and
// are fixed at create time, which also keeps their uniqueness a create-only check.
export const TODO_UPDATE_COLUMNS = ['project_id', 'title', 'notes', 'status', 'due_date', 'cost_cents', 'contact_id'] as const;

/** Rows in a stable order, one more than asked for, so the caller can tell if a next page exists. */
export async function listTodos(db: D1Database, filter: TodoFilter): Promise<TodoRow[]> {
	const conditions: string[] = [];
	const values: Value[] = [];
	if (filter.projectId !== null) {
		conditions.push('t.project_id = ?');
		values.push(filter.projectId);
	}
	if (filter.status !== null) {
		conditions.push('t.status = ?');
		values.push(filter.status);
	}
	if (filter.contactId !== null) {
		conditions.push('t.contact_id = ?');
		values.push(filter.contactId);
	}
	if (!filter.includeArchived) conditions.push('p.archived_at IS NULL');
	if (filter.after !== null) {
		conditions.push('(t.created_at > ? OR (t.created_at = ? AND t.id > ?))');
		values.push(filter.after.createdAt, filter.after.createdAt, filter.after.id);
	}

	const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
	const result = await db
		.prepare(`SELECT t.* FROM todos t JOIN projects p ON p.id = t.project_id ${where} ORDER BY t.created_at, t.id LIMIT ?`)
		.bind(...values, filter.limit + 1)
		.all<TodoRow>();
	return result.results;
}

export function getTodo(db: D1Database, id: string): Promise<TodoRow | null> {
	return db.prepare('SELECT * FROM todos WHERE id = ?').bind(id).first<TodoRow>();
}

export async function externalIdTaken(db: D1Database, source: TodoSource, externalId: string): Promise<boolean> {
	const row = await db
		.prepare('SELECT 1 AS hit FROM todos WHERE source = ? AND external_id = ?')
		.bind(source, externalId)
		.first<{ hit: number }>();
	return row !== null;
}

/** A todo created as done is stamped at once, the same as one moved to done later. */
export async function insertTodo(db: D1Database, input: TodoInsert): Promise<TodoRow> {
	const row = await db
		.prepare(
			`INSERT INTO todos (id, project_id, title, notes, status, due_date, cost_cents, contact_id, source, external_id, completed_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'done' THEN CURRENT_TIMESTAMP END)
			 RETURNING *`,
		)
		.bind(
			crypto.randomUUID(),
			input.project_id,
			input.title,
			input.notes,
			input.status,
			input.due_date,
			input.cost_cents,
			input.contact_id,
			input.source,
			input.external_id,
			input.status,
		)
		.first<TodoRow>();
	if (!row) throw new Error('todo insert returned no row');
	return row;
}

/**
 * Status moves freely between open, waiting, and done. Moving to done stamps
 * completed_at, and a todo that is already done keeps its first stamp; moving away
 * from done clears it, so completed_at is never set on unfinished work.
 */
export function updateTodo(db: D1Database, id: string, changes: Record<string, Value>): Promise<TodoRow | null> {
	const assignments: Assignment[] = TODO_UPDATE_COLUMNS.filter((column) => column in changes).map((column) =>
		assign(column, changes[column]),
	);
	if ('status' in changes) {
		assignments.push({
			sql: "completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) END",
			values: [changes.status],
		});
	}
	return updateRow<TodoRow>(db, 'todos', id, assignments);
}

export async function deleteTodo(db: D1Database, id: string): Promise<boolean> {
	const result = await db.prepare('DELETE FROM todos WHERE id = ?').bind(id).run();
	return result.meta.changes > 0;
}
