import type { ProjectKind, TodoStatus } from '../lib/validate';

/**
 * Everything the read token can see comes from these two queries. Each names its
 * columns rather than selecting *, so a contact's phone or email, or any column added
 * later, cannot reach the summary without someone editing this file on purpose.
 * Archived projects, and therefore their todos, are excluded in both, as are deleted todos.
 */

export interface SummaryCountRow {
	id: string;
	name: string;
	kind: ProjectKind;
	open_count: number;
	waiting_count: number;
	done_count: number;
}

export interface SummaryTodoRow {
	id: string;
	project_id: string;
	title: string;
	status: TodoStatus;
	due_date: string;
}

export const SOONEST_DUE_PER_PROJECT = 5;

export async function readSummary(db: D1Database): Promise<{ counts: SummaryCountRow[]; soonest: SummaryTodoRow[] }> {
	const [counts, soonest] = await db.batch([
		db.prepare(
			`SELECT p.id, p.name, p.kind,
			        COALESCE(SUM(t.status = 'open'), 0) AS open_count,
			        COALESCE(SUM(t.status = 'waiting'), 0) AS waiting_count,
			        COALESCE(SUM(t.status = 'done'), 0) AS done_count
			 FROM projects p
			 LEFT JOIN todos t ON t.project_id = p.id AND t.deleted_at IS NULL
			 WHERE p.archived_at IS NULL
			 GROUP BY p.id
			 ORDER BY p.name COLLATE NOCASE, p.id`,
		),
		// Soonest due means unfinished work with a due date; a done todo is not due.
		db
			.prepare(
				`SELECT id, project_id, title, status, due_date FROM (
				   SELECT t.id, t.project_id, t.title, t.status, t.due_date,
				          ROW_NUMBER() OVER (PARTITION BY t.project_id ORDER BY t.due_date, t.created_at, t.id) AS position
				   FROM todos t
				   JOIN projects p ON p.id = t.project_id
				   WHERE p.archived_at IS NULL AND t.deleted_at IS NULL AND t.status != 'done' AND t.due_date IS NOT NULL
				 )
				 WHERE position <= ?
				 ORDER BY project_id, position`,
			)
			.bind(SOONEST_DUE_PER_PROJECT),
	]);
	return {
		counts: (counts?.results ?? []) as SummaryCountRow[],
		soonest: (soonest?.results ?? []) as SummaryTodoRow[],
	};
}
