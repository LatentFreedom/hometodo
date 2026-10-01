import type { Env } from '../types/env';

/**
 * Admin-key auth: one shared key held as a Cloudflare secret, sent in one header,
 * never stored server-side as an account.
 * Revoking access means rotating the secret with `wrangler secret put ADMIN_API_KEY`.
 *
 * A read token (READ_TOKEN secret, sent as `Authorization: Bearer <token>`) opens the
 * read-only summary and nothing else. The admin gate enforces that limit.
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
 * The bearer value the caller sent, trimmed. Empty when there is no Authorization
 * header or it uses another scheme: only a bearer value can ever be the read token.
 */
export function providedBearerToken(request: Request): string {
	const header = String(request.headers.get('Authorization') || '').trim();
	const match = /^Bearer\s+(.+)$/i.exec(header);
	return match ? match[1].trim() : '';
}

/**
 * Fails closed: an empty value, an empty or unset secret, or an oversized value is
 * always a rejection, so a deploy that forgot a secret locks callers out instead of
 * letting them in. Both credentials go through this one compare.
 */
function matchesSecret(provided: string, secret: string | undefined): boolean {
	const expected = String(secret || '').trim();
	if (provided.length > MAX_CREDENTIAL_LENGTH) return false;
	return provided !== '' && expected !== '' && timingSafeEqual(provided, expected);
}

export function checkAdminAuth(request: Request, env: Env): boolean {
	return matchesSecret(providedAdminKey(request), env.ADMIN_API_KEY);
}

/**
 * The read token is a second, narrower secret for other apps that only need the
 * summary. It is kept separate from the admin key so it can be handed out, and
 * rotated, without exposing any write route or any contact detail.
 */
export function checkReadToken(request: Request, env: Env): boolean {
	return matchesSecret(providedBearerToken(request), env.READ_TOKEN);
}
