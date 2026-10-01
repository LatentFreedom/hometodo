import type { Env } from '../types/env';

/**
 * Admin-key auth: one shared key held as a Cloudflare secret, sent in one header,
 * never stored server-side as an account.
 * Revoking access means rotating the secret with `wrangler secret put ADMIN_API_KEY`.
 */

export const ADMIN_KEY_HEADER = 'X-Admin-API-Key';

// Upper bound on the header: generous for a long random key, while rejecting
// multi-kilobyte junk before the compare runs.
export const MAX_CREDENTIAL_LENGTH = 256;

// Compares every byte up to the longer length and folds the length difference in, so
// the time taken does not reveal how much of a guess was right.
function timingSafeEqual(value: string, expected: string): boolean {
	const encoder = new TextEncoder();
	const valueBytes = encoder.encode(value);
	const expectedBytes = encoder.encode(expected);
	const length = Math.max(valueBytes.length, expectedBytes.length);
	let diff = valueBytes.length ^ expectedBytes.length;

	for (let index = 0; index < length; index += 1) {
		diff |= (valueBytes[index] || 0) ^ (expectedBytes[index] || 0);
	}

	return diff === 0;
}

/** The key the caller sent, trimmed. Empty when the header is absent. */
export function providedAdminKey(request: Request): string {
	return String(request.headers.get(ADMIN_KEY_HEADER) || '').trim();
}

/**
 * Fails closed: an empty header, an empty or unset secret, or an oversized header is
 * always a rejection, so a deploy that forgot the secret locks everyone out instead
 * of letting everyone in.
 */
export function checkAdminAuth(request: Request, env: Env): boolean {
	const provided = providedAdminKey(request);
	const expected = String(env.ADMIN_API_KEY || '').trim();
	if (provided.length > MAX_CREDENTIAL_LENGTH) return false;
	return provided !== '' && expected !== '' && timingSafeEqual(provided, expected);
}
