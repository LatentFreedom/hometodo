import type { MiddlewareHandler } from 'hono';
import { getCorsHeaders, handleCorsPreflight, parseAllowedOrigins } from '@latentfreedom/latentedge-worker-core/cors';
import type { Env } from '../types/env';

/**
 * Strict allow-list CORS for every route.
 *
 * The header values come from @latentfreedom/latentedge-worker-core and are never
 * rebuilt here. An unknown origin gets no allow-origin header at all: no wildcard, and
 * no fallback to the first configured origin.
 */
export const cors: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
	const allowedOrigins = parseAllowedOrigins(c.env.ALLOWED_ORIGINS);

	const preflight = handleCorsPreflight(c.req.raw, allowedOrigins);
	if (preflight) return preflight;

	await next();

	const headers = getCorsHeaders(c.req.header('Origin') ?? null, allowedOrigins) as Record<string, string>;
	for (const [name, value] of Object.entries(headers)) {
		c.header(name, value);
	}
};
