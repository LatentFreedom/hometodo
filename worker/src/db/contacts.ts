import type { Value } from '../lib/validate';
import { assign, updateRow } from './update';

export interface ContactRow {
	id: string;
	name: string;
	role: string | null;
	phone: string | null;
	email: string | null;
	notes: string | null;
	created_at: string;
	updated_at: string;
}

export const CONTACT_COLUMNS = ['name', 'role', 'phone', 'email', 'notes'] as const;

export async function listContacts(db: D1Database): Promise<ContactRow[]> {
	const result = await db.prepare('SELECT * FROM contacts ORDER BY name COLLATE NOCASE, id').all<ContactRow>();
	return result.results;
}

export function getContact(db: D1Database, id: string): Promise<ContactRow | null> {
	return db.prepare('SELECT * FROM contacts WHERE id = ?').bind(id).first<ContactRow>();
}

export async function insertContact(db: D1Database, input: Record<string, Value>): Promise<ContactRow> {
	const row = await db
		.prepare('INSERT INTO contacts (id, name, role, phone, email, notes) VALUES (?, ?, ?, ?, ?, ?) RETURNING *')
		.bind(crypto.randomUUID(), ...CONTACT_COLUMNS.map((column) => input[column] ?? null))
		.first<ContactRow>();
	if (!row) throw new Error('contact insert returned no row');
	return row;
}

export function updateContact(db: D1Database, id: string, changes: Record<string, Value>): Promise<ContactRow | null> {
	const assignments = CONTACT_COLUMNS.filter((column) => column in changes).map((column) => assign(column, changes[column]));
	return updateRow<ContactRow>(db, 'contacts', id, assignments);
}

/**
 * Deleting a contact must not delete the work. The schema says ON DELETE SET NULL,
 * but that only holds while foreign keys are enforced, so the todos are unlinked
 * explicitly in the same batch rather than trusting a connection pragma.
 */
export async function deleteContact(db: D1Database, id: string): Promise<boolean> {
	const [, deleted] = await db.batch([
		db.prepare('UPDATE todos SET contact_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE contact_id = ?').bind(id),
		db.prepare('DELETE FROM contacts WHERE id = ?').bind(id),
	]);
	return (deleted?.meta.changes ?? 0) > 0;
}
