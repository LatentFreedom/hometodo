import type { ProjectKind, Value } from '../lib/validate';
import { assign, updateRow, type Assignment } from './update';

export interface ProjectRow {
	id: string;
	name: string;
	kind: ProjectKind;
	notes: string | null;
	archived_at: string | null;
	created_at: string;
	updated_at: string;
}

export async function listProjects(db: D1Database, includeArchived: boolean): Promise<ProjectRow[]> {
	const where = includeArchived ? '' : 'WHERE archived_at IS NULL';
	const result = await db.prepare(`SELECT * FROM projects ${where} ORDER BY name COLLATE NOCASE, id`).all<ProjectRow>();
	return result.results;
}

export function getProject(db: D1Database, id: string): Promise<ProjectRow | null> {
	return db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first<ProjectRow>();
}

export async function insertProject(
	db: D1Database,
	input: { name: string; kind: ProjectKind; notes: string | null },
): Promise<ProjectRow> {
	const row = await db
		.prepare('INSERT INTO projects (id, name, kind, notes) VALUES (?, ?, ?, ?) RETURNING *')
		.bind(crypto.randomUUID(), input.name, input.kind, input.notes)
		.first<ProjectRow>();
	if (!row) throw new Error('project insert returned no row');
	return row;
}

/** `archived` maps onto archived_at; an already archived project keeps its first stamp. */
export function updateProject(db: D1Database, id: string, changes: Record<string, Value>): Promise<ProjectRow | null> {
	const assignments: Assignment[] = [];
	for (const column of ['name', 'kind', 'notes'] as const) {
		if (column in changes) assignments.push(assign(column, changes[column]));
	}
	if ('archived' in changes) {
		assignments.push({
			sql: changes.archived ? 'archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)' : 'archived_at = NULL',
			values: [],
		});
	}
	return updateRow<ProjectRow>(db, 'projects', id, assignments);
}
