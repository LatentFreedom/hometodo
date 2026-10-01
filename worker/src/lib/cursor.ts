import { badRequest } from './http';

/**
 * Keyset cursor for the todo list. The client treats it as an opaque string; inside
 * it is the sort key of the last row on the page. created_at has one-second
 * resolution, so many rows can share it and the id breaks the tie.
 */
export interface CursorPosition {
	createdAt: string;
	id: string;
}

export function encodeCursor(position: CursorPosition): string {
	const json = JSON.stringify([position.createdAt, position.id]);
	return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Absent means the first page. Anything that does not decode is a 400. */
export function decodeCursor(raw: string | undefined): CursorPosition | null {
	if (raw === undefined) return null;
	try {
		const base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
		const parsed: unknown = JSON.parse(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)));
		if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === 'string' && typeof parsed[1] === 'string') {
			return { createdAt: parsed[0], id: parsed[1] };
		}
	} catch {
		// Fall through to the 400 below.
	}
	throw badRequest('cursor is not valid', 'cursor');
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/** Out-of-range limits are refused, not clamped, so a caller never gets a silent short page. */
export function parseLimit(raw: string | undefined): number {
	if (raw === undefined) return DEFAULT_PAGE_SIZE;
	if (!/^\d+$/.test(raw)) throw badRequest(`limit must be a whole number from 1 to ${MAX_PAGE_SIZE}`, 'limit');
	const limit = Number(raw);
	if (limit < 1 || limit > MAX_PAGE_SIZE) {
		throw badRequest(`limit must be a whole number from 1 to ${MAX_PAGE_SIZE}`, 'limit');
	}
	return limit;
}
