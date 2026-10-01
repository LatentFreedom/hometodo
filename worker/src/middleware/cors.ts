import type { MiddlewareHandler } from 'hono';
import { getCorsHeaders, handleCorsPreflight, parseAllowedOrigins } from '@latentfreedom/latentedge-worker-core/cors';
import { ADMIN_KEY_HEADER } from '../lib/auth';
import type { Env } from '../types/env';

// The admin key travels in a custom header, which the browser must be allowed to send
// on a cross-origin call (local dev runs the site and the API on different ports).
// The method list is set outright because the package default has no PATCH, which
// every partial update here uses, and advertises PUT, which no route serves.
const CORS_OPTIONS = {
	extraAllowHeaders: [ADMIN_KEY_HEADER],
	allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
};

/**
 * Strict allow-list CORS for every route.
 *
 * The header values come from @latentfreedom/latentedge-worker-core and are never
 * rebuilt here. An unknown origin gets no allow-origin header at all: no wildcard, and
 * no fallback to the first configured origin.
 */
export const cors: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
	const allowedOrigins = parseAllowedOrigins(c.env.ALLOWED_ORIGINS);

	const preflight = handleCorsPreflight(c.req.raw, allowedOrigins, CORS_OPTIONS);
	if (preflight) return preflight;

	await next();

	const headers = getCorsHeaders(c.req.header('Origin') ?? null, allowedOrigins, CORS_OPTIONS) as Record<string, string>;
	for (const [name, value] of Object.entries(headers)) {
		c.header(name, value);
	}
};
