import { Hono } from 'hono';
import type { Env } from '../types/env';

export const accessRoutes = new Hono<{ Bindings: Env }>();

/**
 * Key check for the site's gate. The admin gate has already accepted the key by the
 * time this runs, so reaching it at all is the answer. The body names the tier so a
 * second, narrower tier could be added later without changing the response shape.
 */
accessRoutes.get('/', (c) => c.json({ auth_level: 'admin' }));
