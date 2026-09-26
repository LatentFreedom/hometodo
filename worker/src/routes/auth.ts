import { Hono } from 'hono';
import { AuthServiceError, requireAuth } from '@latentfreedom/latentedge-auth-package';
import { getAuthService } from '../db/auth';
import type { Env } from '../types/env';

export const authRoutes = new Hono<{ Bindings: Env }>();

interface CredentialsBody {
	email?: unknown;
	password?: unknown;
	name?: unknown;
	refreshToken?: unknown;
}

async function readBody(request: Request): Promise<CredentialsBody> {
	try {
		const body = await request.json();
		return body && typeof body === 'object' ? (body as CredentialsBody) : {};
	} catch {
		return {};
	}
}

function asString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/**
 * Map an AuthServiceError onto its HTTP response. Anything else is a real fault: it is
 * logged and returned as a generic 500, because an auth endpoint that echoes internal
 * error text tells an attacker which half of a credential pair was wrong.
 */
function errorResponse(error: unknown): { body: { error: string; message: string }; status: 400 | 401 | 403 | 404 | 500 } {
	if (error instanceof AuthServiceError) {
		return {
			body: { error: error.code, message: error.message },
			status: error.status as 400 | 401 | 403 | 404,
		};
	}
	console.error('[auth] unhandled error', error);
	return { body: { error: 'INTERNAL_ERROR', message: 'Something went wrong' }, status: 500 };
}

/**
 * One-time creation of the single admin account.
 *
 * This app has no signup route by design, so the first account has to come from
 * somewhere. Two guards make that safe: the caller must present ADMIN_SETUP_KEY, and
 * the route refuses outright once any user row exists. A deployment therefore cannot
 * be taken over by whoever finds the URL first, and re-running it cannot create a
 * second admin.
 */
authRoutes.post('/bootstrap', async (c) => {
	const setupKey = c.env.ADMIN_SETUP_KEY;
	if (!setupKey) {
		return c.json({ error: 'NOT_FOUND', message: 'Endpoint not found' }, 404);
	}

	// Compared in full, not short-circuited on the first differing character. The
	// timing signal from a naive compare is small over a network, but the correct
	// comparison costs nothing.
	const presented = c.req.header('X-Admin-Key') ?? '';
	if (presented.length !== setupKey.length || !timingSafeEqual(presented, setupKey)) {
		return c.json({ error: 'FORBIDDEN', message: 'Invalid setup key' }, 403);
	}

	const existing = await c.env.DB.prepare('SELECT id FROM users LIMIT 1').first<{ id: string }>();
	if (existing) {
		return c.json({ error: 'ALREADY_INITIALIZED', message: 'An admin account already exists' }, 403);
	}

	const body = await readBody(c.req.raw);

	try {
		const result = await getAuthService(c.env).signup({
			db: c.env.DB,
			email: asString(body.email),
			password: asString(body.password),
			name: typeof body.name === 'string' ? body.name : null,
			request: c.req.raw,
		});
		return c.json(result, 201);
	} catch (error) {
		const { body: errorBody, status } = errorResponse(error);
		return c.json(errorBody, status);
	}
});

authRoutes.post('/login', async (c) => {
	const body = await readBody(c.req.raw);

	try {
		const result = await getAuthService(c.env).login({
			db: c.env.DB,
			email: asString(body.email),
			password: asString(body.password),
			request: c.req.raw,
		});
		return c.json(result, 200);
	} catch (error) {
		const { body: errorBody, status } = errorResponse(error);
		return c.json(errorBody, status);
	}
});

authRoutes.post('/refresh', async (c) => {
	const body = await readBody(c.req.raw);

	try {
		const result = await getAuthService(c.env).refresh({
			refreshToken: asString(body.refreshToken),
			db: c.env.DB,
			request: c.req.raw,
		});
		return c.json(result, 200);
	} catch (error) {
		const { body: errorBody, status } = errorResponse(error);
		return c.json(errorBody, status);
	}
});

authRoutes.post('/logout', async (c) => {
	const body = await readBody(c.req.raw);

	try {
		const result = await getAuthService(c.env).logout({
			db: c.env.DB,
			refreshToken: asString(body.refreshToken) || undefined,
		});
		return c.json(result, 200);
	} catch (error) {
		const { body: errorBody, status } = errorResponse(error);
		return c.json(errorBody, status);
	}
});

/** Who the bearer token belongs to. The frontend uses this to decide if a session is live. */
authRoutes.get('/me', async (c) => {
	const payload = await requireAuth(c.req.raw, c.env.JWT_SECRET);
	if (!payload) {
		return c.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, 401);
	}

	return c.json({ user: { id: payload.userId, email: payload.email } }, 200);
});

function timingSafeEqual(a: string, b: string): boolean {
	let mismatch = 0;
	for (let i = 0; i < a.length; i += 1) {
		mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return mismatch === 0;
}
