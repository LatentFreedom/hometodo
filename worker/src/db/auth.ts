import { createAuthService, createRefreshSessionDb, createUserDb } from '@latentfreedom/latentedge-auth-package';
import type { Env } from '../types/env';

/**
 * Build the auth service for one request.
 *
 * Built per request rather than once at module scope because the JWT secret comes from
 * the request-scoped env, not from the module environment, in a Cloudflare Worker.
 *
 * Table names are omitted deliberately: the package defaults are `users`,
 * `password_reset_tokens`, and `auth_refresh_tokens`, which is exactly what
 * migrations/0002_auth.sql creates.
 */
export function getAuthService(env: Env) {
	const userDb = createUserDb({
		schema: { timestampType: 'datetime', usedField: 'used' },
	});

	const refreshSessionDb = createRefreshSessionDb({
		schema: { timestampType: 'datetime' },
	});

	return createAuthService({
		userDb,
		refreshSessionDb,
		jwtSecret: env.JWT_SECRET,
		// Opaque, rotating, server-revocable refresh tokens. A stolen refresh token can
		// be killed from the database; a self-contained JWT refresh token cannot.
		refreshTokenStrategy: 'rotating',
		// Access-token TTL only. refreshTokenTtlSeconds is left at the package default of
		// 30 days: a refresh token that expires at or before the access token can never
		// renew it, and the sessions silently die after an hour.
		tokenTtlSeconds: 60 * 60,
	});
}
