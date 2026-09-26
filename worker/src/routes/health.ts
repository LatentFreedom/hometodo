import { Hono } from 'hono';
import type { Env } from '../types/env';

export const healthRoutes = new Hono<{ Bindings: Env }>();

/**
 * Liveness probe. Deliberately does not touch D1: this endpoint answers "is the worker
 * running and routing", and a health check that fails on a database hiccup cannot tell
 * a deploy problem apart from a data problem.
 */
healthRoutes.get('/', (c) => c.json({ status: 'ok', service: 'hometodo-worker' }));
