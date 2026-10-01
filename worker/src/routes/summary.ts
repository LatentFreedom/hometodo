import { Hono } from 'hono';
import { readSummary } from '../db/summary';
import type { Env } from '../types/env';

export const summaryRoutes = new Hono<{ Bindings: Env }>();

/**
 * The one route the read token opens (the admin key opens it too). Counts per active
 * project plus its five soonest-due unfinished todos. No contact data and no notes:
 * the caller is another app, and the summary carries only what a glance needs.
 */
summaryRoutes.get('/', async (c) => {
	const { counts, soonest } = await readSummary(c.env.DB);
	const projects = counts.map((project) => ({
		id: project.id,
		name: project.name,
		kind: project.kind,
		open_count: project.open_count,
		waiting_count: project.waiting_count,
		done_count: project.done_count,
		soonest_due: soonest
			.filter((todo) => todo.project_id === project.id)
			.map((todo) => ({ id: todo.id, title: todo.title, status: todo.status, due_date: todo.due_date })),
	}));
	return c.json({ projects });
});
