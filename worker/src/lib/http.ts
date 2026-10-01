import type { Context } from 'hono';

/**
 * An error a handler throws to end the request with a specific status. The app's
 * onError turns it into the usual `{ error, message }` body, so handlers never build
 * error responses by hand and a forgotten `return` cannot fall through to a 200.
 */
export class HttpError extends Error {
	constructor(
		readonly status: 400 | 404 | 409,
		readonly code: string,
		message: string,
		readonly field?: string,
	) {
		super(message);
	}
}

export function badRequest(message: string, field?: string): HttpError {
	return new HttpError(400, 'VALIDATION_ERROR', message, field);
}

export function notFound(what: string): HttpError {
	return new HttpError(404, 'NOT_FOUND', `${what} not found`);
}

/** The request body as a plain object, or a 400. Arrays and scalars are not records. */
export async function readJsonObject(c: Context): Promise<Record<string, unknown>> {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
	}
	if (body === null || typeof body !== 'object' || Array.isArray(body)) {
		throw new HttpError(400, 'INVALID_JSON', 'Request body must be a JSON object');
	}
	return body as Record<string, unknown>;
}
