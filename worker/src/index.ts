import { Hono } from 'hono';
import { API_BASE_PATH } from './config/api';
import { cors } from './middleware/cors';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import type { Env } from './types/env';

/**
 * Routing only. Business logic belongs in src/services, database access in src/db.
 *
 * There is no signup route and none may be added: this app has exactly one account,
 * created once through POST /api/v1/auth/bootstrap. A request to /api/v1/auth/signup
 * therefore falls through to the 404 handler below, which is the intended answer.
 */
const app = new Hono<{ Bindings: Env }>();

app.use('*', cors);

app.route(`${API_BASE_PATH}/health`, healthRoutes);
app.route(`${API_BASE_PATH}/auth`, authRoutes);

app.notFound((c) => c.json({ error: 'NOT_FOUND', message: 'Endpoint not found' }, 404));

app.onError((error, c) => {
	console.error('[worker] unhandled error', error);
	return c.json({ error: 'INTERNAL_ERROR', message: 'Something went wrong' }, 500);
});

export default app;
