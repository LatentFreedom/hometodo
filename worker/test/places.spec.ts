import { beforeEach, describe, expect, it } from 'vitest';
import { API_BASE_PATH } from '../src/config/api';
import { adminHeaders, bearerHeaders, createProject, createTodo, del, get, patch, post, resetDatabase } from './helpers';

const PLACES = `${API_BASE_PATH}/places`;
const TODOS = `${API_BASE_PATH}/todos`;

interface Place {
	id: string;
	name: string;
	latitude: number;
	longitude: number;
	radius_m: number;
	deleted_at: string | null;
	[key: string]: unknown;
}

const HOME = { name: 'Example home', latitude: 39.7684, longitude: -86.1581 };

async function createPlace(body: Record<string, unknown> = {}): Promise<Place> {
	const response = await post(PLACES, { ...HOME, ...body }, adminHeaders());
	expect(response.status).toBe(201);
	return ((await response.json()) as { place: Place }).place;
}

async function listPlaces(query = ''): Promise<Place[]> {
	return ((await (await get(`${PLACES}${query}`, adminHeaders())).json()) as { places: Place[] }).places;
}

describe('places API', () => {
	beforeEach(resetDatabase);

	it('needs the admin key: 401 with none, 403 for the read token', async () => {
		expect((await get(PLACES)).status).toBe(401);
		expect((await post(PLACES, HOME)).status).toBe(401);
		expect((await get(PLACES, bearerHeaders())).status).toBe(403);
	});

	it('creates a place with the default radius and returns the row', async () => {
		const place = await createPlace();
		expect(place).toMatchObject({ ...HOME, radius_m: 150, deleted_at: null });
		expect(await createPlace({ name: 'Example store', radius_m: 2000 })).toMatchObject({ radius_m: 2000 });
		expect((await listPlaces()).map((row) => row.name)).toEqual(['Example home', 'Example store']);
	});

	it('refuses a radius under 100 m or over 2000 m, and bad coordinates', async () => {
		const bad: [Record<string, unknown>, string][] = [
			[{ radius_m: 50 }, 'radius_m'],
			[{ radius_m: 2001 }, 'radius_m'],
			[{ radius_m: 150.5 }, 'radius_m'],
			[{ latitude: 90.1 }, 'latitude'],
			[{ longitude: -180.5 }, 'longitude'],
			[{ latitude: '39.7' }, 'latitude'],
			[{ latitude: null }, 'latitude'],
			[{ name: '' }, 'name'],
		];
		for (const [body, field] of bad) {
			const response = await post(PLACES, { ...HOME, ...body }, adminHeaders());
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ field });
		}
		const { longitude: _, ...missing } = HOME;
		expect((await post(PLACES, missing, adminHeaders())).status).toBe(400);
	});

	it('reads and changes a place', async () => {
		const place = await createPlace();
		expect(await (await get(`${PLACES}/${place.id}`, adminHeaders())).json()).toMatchObject({ place: { id: place.id } });
		const changed = await patch(`${PLACES}/${place.id}`, { name: 'Example house', radius_m: 300 }, adminHeaders());
		expect(await changed.json()).toMatchObject({ place: { name: 'Example house', radius_m: 300, latitude: HOME.latitude } });
		expect((await patch(`${PLACES}/${place.id}`, { radius_m: 99 }, adminHeaders())).status).toBe(400);
		expect((await get(`${PLACES}/no-such-place`, adminHeaders())).status).toBe(404);
	});

	it('soft deletes a place and clears it from its todos', async () => {
		const project = await createProject();
		const place = await createPlace();
		const todo = await createTodo(project.id, { place_id: place.id, place_trigger: 'leave' });
		const other = await createTodo(project.id);

		expect((await del(`${PLACES}/${place.id}`, adminHeaders())).status).toBe(204);
		expect(await listPlaces()).toEqual([]);
		expect((await get(`${PLACES}/${place.id}`, adminHeaders())).status).toBe(404);
		expect((await patch(`${PLACES}/${place.id}`, { name: 'Example' }, adminHeaders())).status).toBe(404);
		expect((await del(`${PLACES}/${place.id}`, adminHeaders())).status).toBe(404);

		const pulled = await listPlaces('?include_deleted=true');
		expect(pulled[0]?.deleted_at).not.toBeNull();
		expect(await (await get(`${TODOS}/${todo.id}`, adminHeaders())).json()).toMatchObject({ todo: { place_id: null, place_trigger: null } });
		expect(await (await get(`${TODOS}/${other.id}`, adminHeaders())).json()).toMatchObject({ todo: { place_id: null } });

		// A deleted place cannot be picked again
		const refused = await patch(`${TODOS}/${todo.id}`, { place_id: place.id }, adminHeaders());
		expect(refused.status).toBe(400);
		expect(await refused.json()).toMatchObject({ field: 'place_id' });
	});

	it('returns only places changed at or after updated_since', async () => {
		await createPlace();
		expect(await listPlaces('?updated_since=2000-01-01T00:00:00Z')).toHaveLength(1);
		expect(await listPlaces('?updated_since=2999-01-01T00:00:00Z')).toHaveLength(0);
		expect((await get(`${PLACES}?updated_since=yesterday`, adminHeaders())).status).toBe(400);
	});
});

describe('todo place reminder', () => {
	beforeEach(resetDatabase);

	interface Reply {
		todo: { id: string; place_id: string | null; place_trigger: string | null };
		next_todo: { place_id: string | null; place_trigger: string | null } | null;
	}

	it('stores place_id and place_trigger on PATCH and returns both on GET', async () => {
		const project = await createProject();
		const place = await createPlace();
		const todo = await createTodo(project.id);
		expect(todo).toMatchObject({ place_id: null, place_trigger: null });

		expect((await patch(`${TODOS}/${todo.id}`, { place_id: place.id, place_trigger: 'leave' }, adminHeaders())).status).toBe(200);
		expect(await (await get(`${TODOS}/${todo.id}`, adminHeaders())).json()).toMatchObject({ todo: { place_id: place.id, place_trigger: 'leave' } });
	});

	it('defaults the trigger to arrive and refuses a trigger with no place', async () => {
		const project = await createProject();
		const place = await createPlace();
		expect(await createTodo(project.id, { place_id: place.id })).toMatchObject({ place_id: place.id, place_trigger: 'arrive' });

		const response = await post(TODOS, { project_id: project.id, title: 'Example', place_trigger: 'leave' }, adminHeaders());
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ field: 'place_trigger' });

		const bad = await post(TODOS, { project_id: project.id, title: 'Example', place_id: place.id, place_trigger: 'near' }, adminHeaders());
		expect(bad.status).toBe(400);
		expect((await post(TODOS, { project_id: project.id, title: 'Example', place_id: 'no-such-place' }, adminHeaders())).status).toBe(400);
	});

	it('clears the trigger with the place, and refuses a trigger sent with a null place', async () => {
		const project = await createProject();
		const place = await createPlace();
		const todo = await createTodo(project.id, { place_id: place.id, place_trigger: 'leave' });

		expect((await patch(`${TODOS}/${todo.id}`, { place_id: null, place_trigger: 'arrive' }, adminHeaders())).status).toBe(400);
		const cleared = await patch(`${TODOS}/${todo.id}`, { place_id: null }, adminHeaders());
		expect(await cleared.json()).toMatchObject({ todo: { place_id: null, place_trigger: null } });
	});

	it('copies the place reminder to the next occurrence of a repeating todo', async () => {
		const project = await createProject();
		const place = await createPlace();
		const todo = await createTodo(project.id, {
			place_id: place.id,
			place_trigger: 'leave',
			repeat_mode: 'after_done',
			repeat_every: 1,
			repeat_unit: 'week',
		});
		const reply = (await (await patch(`${TODOS}/${todo.id}`, { status: 'done' }, adminHeaders())).json()) as Reply;
		expect(reply.next_todo).toMatchObject({ place_id: place.id, place_trigger: 'leave' });
	});
});
