import { Hono } from 'hono';
import { API_BASE_PATH } from './config/api';
import { adminGate } from './middleware/admin-gate';
import { cors } from './middleware/cors';
import { accessRoutes } from './routes/access';
import { healthRoutes } from './routes/health';
import type { Env } from './types/env';

/**
 * Routing only. Business logic belongs in src/services, database access in src/db.
 *
 * Auth is one shared admin key (see src/lib/auth.ts). There are no accounts, so there
 * is no login, signup, or session route; those paths fall through to the 404 below,
 * and only after the gate, so an unauthenticated caller sees 401 for every path.
 */
const app = new Hono<{ Bindings: Env }>();

// CORS first: it answers preflights before the gate, which never sees an OPTIONS.
app.use('*', cors);
app.use(`${API_BASE_PATH}/*`, adminGate);

app.route(`${API_BASE_PATH}/health`, healthRoutes);
app.route(`${API_BASE_PATH}/access`, accessRoutes);

app.notFound((c) => c.json({ error: 'NOT_FOUND', message: 'Endpoint not found' }, 404));

app.onError((error, c) => {
	console.error('[worker] unhandled error', error);
	return c.json({ error: 'INTERNAL_ERROR', message: 'Something went wrong' }, 500);
});

export default app;
