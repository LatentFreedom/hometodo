import type { Value } from '../lib/validate';

/**
 * One `column = expression` fragment of an UPDATE. Column names come only from code
 * in this directory, never from a request, so building the SET list is not an
 * injection path; every request value travels as a bound parameter.
 */
export interface Assignment {
	sql: string;
	values: Value[];
}

export function assign(column: string, value: Value): Assignment {
	return { sql: `${column} = ?`, values: [value] };
}

type Table = 'projects' | 'todos' | 'contacts';

/** Applies the assignments, stamps updated_at, and returns the new row (null when absent). */
export function updateRow<T>(db: D1Database, table: Table, id: string, assignments: Assignment[]): Promise<T | null> {
	const sets = [...assignments.map((assignment) => assignment.sql), 'updated_at = CURRENT_TIMESTAMP'];
	const values = assignments.flatMap((assignment) => assignment.values);
	return db
		.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ? RETURNING *`)
		.bind(...values, id)
		.first<T>();
}
