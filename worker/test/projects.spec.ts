import { beforeEach, describe, expect, it } from 'vitest';
import { API_BASE_PATH } from '../src/config/api';
import { adminHeaders, createProject, createTodo, del, get, patch, post, postRaw, resetDatabase } from './helpers';

const PROJECTS = `${API_BASE_PATH}/projects`;

describe('projects API', () => {
	beforeEach(resetDatabase);

	it('creates a project with a UUID id and the default kind', async () => {
		const response = await post(PROJECTS, { name: '  Example roof job  ' }, adminHeaders());
		expect(response.status).toBe(201);
		const { project } = (await response.json()) as { project: Record<string, unknown> };
		expect(project.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		expect(project).toMatchObject({ name: 'Example roof job', kind: 'other', notes: null, archived_at: null });
	});

	it('reads, lists, and updates a project', async () => {
		const project = await createProject({ name: 'Example car', kind: 'car' });

		const read = await get(`${PROJECTS}/${project.id}`, adminHeaders());
		expect(read.status).toBe(200);
		expect(await read.json()).toMatchObject({ project: { id: project.id, kind: 'car' } });

		const updated = await patch(`${PROJECTS}/${project.id}`, { name: 'Example van', notes: 'Example note' }, adminHeaders());
		expect(updated.status).toBe(200);
		expect(await updated.json()).toMatchObject({ project: { name: 'Example van', notes: 'Example note', kind: 'car' } });

		const list = (await (await get(PROJECTS, adminHeaders())).json()) as { projects: Array<{ id: string }> };
		expect(list.projects.map((row) => row.id)).toEqual([project.id]);
	});

	it('rejects an unknown project kind with 400 on create and update', async () => {
		const created = await post(PROJECTS, { name: 'Example', kind: 'spaceship' }, adminHeaders());
		expect(created.status).toBe(400);
		expect(await created.json()).toMatchObject({ error: 'VALIDATION_ERROR', field: 'kind' });

		const project = await createProject();
		expect((await patch(`${PROJECTS}/${project.id}`, { kind: 'spaceship' }, adminHeaders())).status).toBe(400);
		expect((await patch(`${PROJECTS}/${project.id}`, { kind: null }, adminHeaders())).status).toBe(400);
	});

	it('rejects bad input with 400', async () => {
		const cases: unknown[] = [
			{},
			{ name: '' },
			{ name: '   ' },
			{ name: 42 },
			{ name: 'x'.repeat(201) },
			{ name: 'Example', colour: 'red' },
			{ name: 'Example', id: 'chosen-by-client' },
			{ name: 'Example', archived_at: '2026-01-01' },
			[],
			'a string',
		];
		for (const body of cases) {
			const response = await post(PROJECTS, body, adminHeaders());
			expect(response.status, JSON.stringify(body)).toBe(400);
		}
		expect((await postRaw(PROJECTS, '{not json', adminHeaders())).status).toBe(400);
	});

	it('rejects an empty or invalid update with 400', async () => {
		const project = await createProject();
		expect((await patch(`${PROJECTS}/${project.id}`, {}, adminHeaders())).status).toBe(400);
		expect((await patch(`${PROJECTS}/${project.id}`, { name: null }, adminHeaders())).status).toBe(400);
		expect((await patch(`${PROJECTS}/${project.id}`, { archived: 'yes' }, adminHeaders())).status).toBe(400);
	});

	it('answers 404 for a project that does not exist', async () => {
		const missing = `${PROJECTS}/00000000-0000-4000-8000-000000000000`;
		expect((await get(missing, adminHeaders())).status).toBe(404);
		expect((await patch(missing, { name: 'Example' }, adminHeaders())).status).toBe(404);
		expect((await del(missing, adminHeaders())).status).toBe(404);
	});

	it('archives on DELETE, keeps the row and its todos, and hides it from the default list', async () => {
		const kept = await createProject({ name: 'Example kept' });
		const archived = await createProject({ name: 'Example archived' });
		const todo = await createTodo(archived.id);

		const response = await del(`${PROJECTS}/${archived.id}`, adminHeaders());
		expect(response.status).toBe(200);
		const body = (await response.json()) as { project: { archived_at: string | null } };
		expect(body.project.archived_at).not.toBeNull();

		const active = (await (await get(PROJECTS, adminHeaders())).json()) as { projects: Array<{ id: string }> };
		expect(active.projects.map((row) => row.id)).toEqual([kept.id]);

		const all = (await (await get(`${PROJECTS}?include_archived=true`, adminHeaders())).json()) as { projects: Array<{ id: string }> };
		expect(all.projects.map((row) => row.id).sort()).toEqual([kept.id, archived.id].sort());

		expect((await get(`${API_BASE_PATH}/todos/${todo.id}`, adminHeaders())).status).toBe(200);
		expect((await get(`${PROJECTS}/${archived.id}`, adminHeaders())).status).toBe(200);
	});

	it('keeps the first archive stamp and restores with archived false', async () => {
		const project = await createProject();
		const first = (await (await del(`${PROJECTS}/${project.id}`, adminHeaders())).json()) as { project: { archived_at: string } };
		const second = (await (await patch(`${PROJECTS}/${project.id}`, { archived: true }, adminHeaders())).json()) as {
			project: { archived_at: string };
		};
		expect(second.project.archived_at).toBe(first.project.archived_at);

		const restored = await patch(`${PROJECTS}/${project.id}`, { archived: false }, adminHeaders());
		expect(await restored.json()).toMatchObject({ project: { archived_at: null } });
	});

	it('rejects a bad include_archived flag with 400', async () => {
		expect((await get(`${PROJECTS}?include_archived=yes`, adminHeaders())).status).toBe(400);
	});
});
