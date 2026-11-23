import type { Value } from '../lib/validate';
import { assign, updateRow } from './update';

export interface PlaceRow {
	id: string;
	name: string;
	latitude: number;
	longitude: number;
	radius_m: number;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}

export const PLACE_COLUMNS = ['name', 'latitude', 'longitude', 'radius_m'] as const;

export const DEFAULT_RADIUS_M = 150;

export interface PlaceFilter {
	includeDeleted: boolean;
	updatedSince: string | null;
}

/** The owner keeps a handful of places, so the list is one page, by name. */
export async function listPlaces(db: D1Database, filter: PlaceFilter): Promise<PlaceRow[]> {
	const conditions: string[] = [];
	const values: Value[] = [];
	if (!filter.includeDeleted) conditions.push('deleted_at IS NULL');
	// Inclusive for the same one-second-precision reason as the todo pull
	if (filter.updatedSince !== null) {
		conditions.push('updated_at >= ?');
		values.push(filter.updatedSince);
	}
	const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
	const result = await db
		.prepare(`SELECT * FROM places ${where} ORDER BY name COLLATE NOCASE, id`)
		.bind(...values)
		.all<PlaceRow>();
	return result.results;
}

/** A deleted place reads as absent unless the caller asks for it. */
export function getPlace(db: D1Database, id: string, includeDeleted = false): Promise<PlaceRow | null> {
	const deleted = includeDeleted ? '' : ' AND deleted_at IS NULL';
	return db.prepare(`SELECT * FROM places WHERE id = ?${deleted}`).bind(id).first<PlaceRow>();
}

export async function insertPlace(db: D1Database, input: Record<string, Value>): Promise<PlaceRow> {
	const row = await db
		.prepare('INSERT INTO places (id, name, latitude, longitude, radius_m) VALUES (?, ?, ?, ?, ?) RETURNING *')
		.bind(crypto.randomUUID(), input.name, input.latitude, input.longitude, input.radius_m ?? DEFAULT_RADIUS_M)
		.first<PlaceRow>();
	if (!row) throw new Error('place insert returned no row');
	return row;
}

/** A deleted place is not edited: the 404 keeps a stale client from reviving it. */
export async function updatePlace(db: D1Database, id: string, changes: Record<string, Value>): Promise<PlaceRow | null> {
	if (!(await getPlace(db, id))) return null;
	const assignments = PLACE_COLUMNS.filter((column) => column in changes).map((column) => assign(column, changes[column]));
	return updateRow<PlaceRow>(db, 'places', id, assignments);
}

/**
 * Soft delete, so the phone learns of it on its next pull. Its todos lose the place in
 * the same batch and get a fresh updated_at, so the phone also drops their regions.
 */
export async function deletePlace(db: D1Database, id: string): Promise<boolean> {
	const [, place] = await db.batch([
		db
			.prepare(
				'UPDATE todos SET place_id = NULL, place_trigger = NULL, updated_at = CURRENT_TIMESTAMP WHERE place_id = ? AND EXISTS (SELECT 1 FROM places WHERE id = ? AND deleted_at IS NULL)',
			)
			.bind(id, id),
		db.prepare('UPDATE places SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL').bind(id),
	]);
	return (place?.meta.changes ?? 0) > 0;
}
