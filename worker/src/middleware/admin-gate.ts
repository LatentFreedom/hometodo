import type { MiddlewareHandler } from 'hono';
import { API_BASE_PATH } from '../config/api';
import { checkAdminAuth, checkReadToken, providedAdminKey, providedBearerToken } from '../lib/auth';
import type { Env } from '../types/env';

// Only the liveness probe is public. Everything else, including unknown paths, needs
// the key, so an unauthenticated caller cannot map the API by probing for 404s.
const PUBLIC_PATHS = new Set([`${API_BASE_PATH}/health`]);

// Wrong-key throttle, per client IP. A correct key is checked before this runs, so the
// owner is never locked out by someone else's guessing.
const FAILURE_WINDOW_SECONDS = 600;
const MAX_FAILURES_PER_WINDOW = 20;

// The read token opens exactly one route and one method. Matching the exact path
// fails closed: an encoded or otherwise unusual spelling of the summary path is
// refused with 403 rather than let through.
const READ_TOKEN_METHOD = 'GET';
const READ_TOKEN_PATH = `${API_BASE_PATH}/summary`;

export const adminGate: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
	const path = new URL(c.req.url).pathname.replace(/\/+$/, '');
	if (PUBLIC_PATHS.has(path)) return next();
	if (checkAdminAuth(c.req.raw, c.env)) return next();

	// A valid read token is a known caller, so it gets 403 (not 401) everywhere else:
	// the credential is fine, it is just not enough. It never counts as a failure.
	if (checkReadToken(c.req.raw, c.env)) {
		if (c.req.method === READ_TOKEN_METHOD && path === READ_TOKEN_PATH) return next();
		return c.json({ error: 'FORBIDDEN', message: 'The read token only opens GET /api/v1/summary' }, 403);
	}

	// A request with no credential at all is a fresh visitor, not a guess; only wrong
	// values count. A wrong bearer value shares the admin-key budget, so a second
	// header cannot double the guesses an IP gets.
	if (providedAdminKey(c.req.raw) !== '' || providedBearerToken(c.req.raw) !== '') {
		const throttled = await recordFailure(c.env.DB, clientIp(c.req.raw), path);
		if (throttled) {
			return c.json({ error: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts. Try again later.' }, 429);
		}
	}

	return c.json({ error: 'UNAUTHORIZED', message: 'A valid admin key is required' }, 401);
};

function clientIp(request: Request): string {
	return request.headers.get('CF-Connecting-IP') || 'unknown';
}

/**
 * Returns true when this IP is already over the limit. A database error never turns a
 * rejection into a 500 or an acceptance: the caller still gets 401.
 */
async function recordFailure(db: D1Database, ip: string, path: string): Promise<boolean> {
	try {
		const window = `-${FAILURE_WINDOW_SECONDS} seconds`;
		const row = await db
			.prepare("SELECT COUNT(*) AS total FROM access_failures WHERE ip = ? AND created_at > datetime('now', ?)")
			.bind(ip, window)
			.first<{ total: number }>();
		if ((row?.total ?? 0) >= MAX_FAILURES_PER_WINDOW) return true;

		await db.batch([
			db.prepare('INSERT INTO access_failures (ip, path) VALUES (?, ?)').bind(ip, path),
			// Rows older than a day can never affect the window again.
			db.prepare("DELETE FROM access_failures WHERE created_at < datetime('now', '-1 day')"),
		]);
		return false;
	} catch (error) {
		console.error('[admin-gate] could not record a failed attempt', error);
		return false;
	}
}
