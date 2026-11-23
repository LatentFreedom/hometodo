import { Hono } from 'hono';
import { deletePlace, getPlace, insertPlace, listPlaces, updatePlace } from '../db/places';
import { notFound, readJsonObject } from '../lib/http';
import { parseFlag, parseInput, parseStamp, type Field } from '../lib/validate';
import type { Env } from '../types/env';

export const placeRoutes = new Hono<{ Bindings: Env }>();

const FIELDS: Record<string, Field> = {
	name: { type: 'text', max: 200, required: true },
	latitude: { type: 'range', min: -90, max: 90, required: true },
	longitude: { type: 'range', min: -180, max: 180, required: true },
	// iOS does not fire reliably for a region under 100 m; past 2 km it stops being a place
	radius_m: { type: 'range', min: 100, max: 2000, integer: true, required: true },
};

const CREATE_FIELDS: Record<string, Field> = {
	...FIELDS,
	// Optional on create only: the default radius fills it in
	radius_m: { type: 'range', min: 100, max: 2000, integer: true },
};

/** updated_since and include_deleted work as on todos, so the phone can keep a cache. */
placeRoutes.get('/', async (c) => {
	const places = await listPlaces(c.env.DB, {
		includeDeleted: parseFlag('include_deleted', c.req.query('include_deleted')),
		updatedSince: parseStamp('updated_since', c.req.query('updated_since')),
	});
	return c.json({ places });
});

placeRoutes.post('/', async (c) => {
	const input = parseInput(await readJsonObject(c), CREATE_FIELDS, 'create');
	return c.json({ place: await insertPlace(c.env.DB, input) }, 201);
});

placeRoutes.get('/:id', async (c) => {
	const place = await getPlace(c.env.DB, c.req.param('id'), parseFlag('include_deleted', c.req.query('include_deleted')));
	if (!place) throw notFound('Place');
	return c.json({ place });
});

placeRoutes.patch('/:id', async (c) => {
	const changes = parseInput(await readJsonObject(c), FIELDS, 'update');
	const place = await updatePlace(c.env.DB, c.req.param('id'), changes);
	if (!place) throw notFound('Place');
	return c.json({ place });
});

/** Soft delete. Todos that pointed here keep going with place_id and place_trigger cleared. */
placeRoutes.delete('/:id', async (c) => {
	if (!(await deletePlace(c.env.DB, c.req.param('id')))) throw notFound('Place');
	return c.body(null, 204);
});
