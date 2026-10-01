import { Hono } from 'hono';
import { getProject, insertProject, listProjects, updateProject } from '../db/projects';
import { notFound, readJsonObject } from '../lib/http';
import { parseFlag, parseInput, PROJECT_KINDS, type Field, type ProjectKind } from '../lib/validate';
import type { Env } from '../types/env';

export const projectRoutes = new Hono<{ Bindings: Env }>();

const CREATE_FIELDS: Record<string, Field> = {
	name: { type: 'text', max: 200, required: true },
	kind: { type: 'enum', values: PROJECT_KINDS },
	notes: { type: 'text', max: 10_000 },
};

// Archiving goes through `archived`, never a raw timestamp, so the server owns the clock.
const UPDATE_FIELDS: Record<string, Field> = { ...CREATE_FIELDS, archived: { type: 'boolean' } };

/** Archived projects are hidden unless asked for, the same rule the summary applies. */
projectRoutes.get('/', async (c) => {
	const includeArchived = parseFlag('include_archived', c.req.query('include_archived'));
	return c.json({ projects: await listProjects(c.env.DB, includeArchived) });
});

projectRoutes.post('/', async (c) => {
	const input = parseInput(await readJsonObject(c), CREATE_FIELDS, 'create');
	const project = await insertProject(c.env.DB, {
		name: input.name as string,
		kind: (input.kind as ProjectKind | undefined) ?? 'other',
		notes: (input.notes as string | null | undefined) ?? null,
	});
	return c.json({ project }, 201);
});

projectRoutes.get('/:id', async (c) => {
	const project = await getProject(c.env.DB, c.req.param('id'));
	if (!project) throw notFound('Project');
	return c.json({ project });
});

projectRoutes.patch('/:id', async (c) => {
	const changes = parseInput(await readJsonObject(c), UPDATE_FIELDS, 'update');
	const project = await updateProject(c.env.DB, c.req.param('id'), changes);
	if (!project) throw notFound('Project');
	return c.json({ project });
});

/**
 * Projects are archived, never deleted: the history of a finished job is worth
 * keeping, and deleting would cascade to every todo. PATCH `archived: false` restores.
 */
projectRoutes.delete('/:id', async (c) => {
	const project = await updateProject(c.env.DB, c.req.param('id'), { archived: true });
	if (!project) throw notFound('Project');
	return c.json({ project });
});
