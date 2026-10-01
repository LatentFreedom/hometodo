import { Hono } from 'hono';
import { API_BASE_PATH } from './config/api';
import { adminGate } from './middleware/admin-gate';
import { HttpError } from './lib/http';
import { cors } from './middleware/cors';
import { accessRoutes } from './routes/access';
import { contactRoutes } from './routes/contacts';
import { healthRoutes } from './routes/health';
import { projectRoutes } from './routes/projects';
import { summaryRoutes } from './routes/summary';
import { todoRoutes } from './routes/todos';
import type { Env } from './types/env';

/**
 * Routing only. Handlers live in src/routes, database access in src/db.
 *
 * Auth is one shared admin key (see src/lib/auth.ts). There are no accounts, so there
 * is no login, signup, or session route; those paths fall through to the 404 below,
 * and only after the gate, so an unauthenticated caller sees 401 for every path.
 * A separate read token opens GET /summary and gets 403 everywhere else.
 */
const app = new Hono<{ Bindings: Env }>();

// CORS first: it answers preflights before the gate, which never sees an OPTIONS.
app.use('*', cors);
app.use(`${API_BASE_PATH}/*`, adminGate);

app.route(`${API_BASE_PATH}/health`, healthRoutes);
app.route(`${API_BASE_PATH}/access`, accessRoutes);
app.route(`${API_BASE_PATH}/projects`, projectRoutes);
app.route(`${API_BASE_PATH}/todos`, todoRoutes);
app.route(`${API_BASE_PATH}/contacts`, contactRoutes);
app.route(`${API_BASE_PATH}/summary`, summaryRoutes);

app.notFound((c) => c.json({ error: 'NOT_FOUND', message: 'Endpoint not found' }, 404));

app.onError((error, c) => {
	if (error instanceof HttpError) {
		const body = { error: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) };
		return c.json(body, error.status);
	}
	console.error('[worker] unhandled error', error);
	return c.json({ error: 'INTERNAL_ERROR', message: 'Something went wrong' }, 500);
});

export default app;
