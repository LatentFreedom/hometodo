import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { API_BASE_PATH } from '../src/config/api';
import { adminHeaders, bearerHeaders, createContact, createProject, createTodo, del, get, resetDatabase } from './helpers';

const SUMMARY = `${API_BASE_PATH}/summary`;

interface SummaryProject {
	id: string;
	name: string;
	kind: string;
	open_count: number;
	waiting_count: number;
	done_count: number;
	soonest_due: Array<{ id: string; title: string; status: string; due_date: string }>;
}

/** Every key at any depth of a JSON value. */
function allKeys(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(allKeys);
	if (value !== null && typeof value === 'object') {
		return Object.entries(value).flatMap(([key, inner]) => [key, ...allKeys(inner)]);
	}
	return [];
}

async function readSummary(headers: HeadersInit = bearerHeaders()): Promise<{ text: string; projects: SummaryProject[] }> {
	const response = await get(SUMMARY, headers);
	expect(response.status).toBe(200);
	const text = await response.text();
	return { text, projects: (JSON.parse(text) as { projects: SummaryProject[] }).projects };
}

describe('GET /api/v1/summary', () => {
	beforeEach(resetDatabase);

	it('returns 200 for the read token with no phone or email keys anywhere', async () => {
		const project = await createProject({ name: 'Example house' });
		const contact = await createContact({ phone: '555-0199', email: 'contractor@example.com' });
		await createTodo(project.id, { contact_id: contact.id, due_date: '2026-12-01' });

		const { text, projects } = await readSummary();
		const keys = allKeys(JSON.parse(text));
		expect(keys).not.toContain('phone');
		expect(keys).not.toContain('email');
		expect(keys.some((key) => /phone|email|contact/i.test(key))).toBe(false);
		expect(text).not.toContain('555-0199');
		expect(text).not.toContain('contractor@example.com');
		expect(projects).toHaveLength(1);
	});

	it('ignores deleted todos in counts and soonest due', async () => {
		const project = await createProject({ name: 'Example house' });
		const kept = await createTodo(project.id, { due_date: '2026-12-05' });
		const gone = await createTodo(project.id, { due_date: '2026-12-01' });
		await del(`${API_BASE_PATH}/todos/${gone.id}`, adminHeaders());

		const { projects } = await readSummary();
		expect(projects[0]).toMatchObject({ open_count: 1 });
		expect(projects[0].soonest_due.map((todo) => todo.id)).toEqual([kept.id]);
	});

	it('counts open, waiting, and done per project', async () => {
		const house = await createProject({ name: 'Example house', kind: 'house' });
		const car = await createProject({ name: 'Example car', kind: 'car' });
		const empty = await createProject({ name: 'Example empty', kind: 'admin' });
		for (const status of ['open', 'open', 'waiting', 'done', 'done', 'done']) await createTodo(house.id, { status });
		await createTodo(car.id, { status: 'waiting' });

		const { projects } = await readSummary();
		const byId = new Map(projects.map((project) => [project.id, project]));
		expect(byId.get(house.id)).toMatchObject({ kind: 'house', open_count: 2, waiting_count: 1, done_count: 3 });
		expect(byId.get(car.id)).toMatchObject({ open_count: 0, waiting_count: 1, done_count: 0 });
		expect(byId.get(empty.id)).toMatchObject({ open_count: 0, waiting_count: 0, done_count: 0, soonest_due: [] });
	});

	it('lists the five soonest-due unfinished todos per project, soonest first', async () => {
		const project = await createProject();
		const dates = ['2026-12-20', '2026-12-05', '2026-12-30', '2026-12-01', '2026-12-10', '2026-12-15', '2026-12-25'];
		for (const due_date of dates) await createTodo(project.id, { title: `Example due ${due_date}`, due_date });
		await createTodo(project.id, { title: 'Example done early', due_date: '2026-11-01', status: 'done' });
		await createTodo(project.id, { title: 'Example no date' });
		await createTodo(project.id, { title: 'Example waiting', due_date: '2026-12-02', status: 'waiting' });

		const { projects } = await readSummary();
		expect(projects[0].soonest_due.map((todo) => todo.due_date)).toEqual([
			'2026-12-01',
			'2026-12-02',
			'2026-12-05',
			'2026-12-10',
			'2026-12-15',
		]);
		expect(Object.keys(projects[0].soonest_due[0]).sort()).toEqual(['due_date', 'id', 'status', 'title']);
	});

	it('hides archived projects and their todos', async () => {
		const active = await createProject({ name: 'Example active' });
		const archived = await createProject({ name: 'Example archived' });
		await createTodo(active.id, { due_date: '2026-12-01' });
		const hidden = await createTodo(archived.id, { title: 'Example hidden todo', due_date: '2026-11-01' });
		await del(`${API_BASE_PATH}/projects/${archived.id}`, adminHeaders());

		const { text, projects } = await readSummary();
		expect(projects.map((project) => project.id)).toEqual([active.id]);
		expect(text).not.toContain(archived.id);
		expect(text).not.toContain(hidden.id);
		expect(text).not.toContain('Example hidden todo');
	});

	it('carries no notes and no cost', async () => {
		const project = await createProject({ notes: 'Example private project note' });
		await createTodo(project.id, { notes: 'Example private todo note', cost_cents: 99_999, due_date: '2026-12-01' });

		const { text } = await readSummary();
		expect(text).not.toContain('Example private');
		expect(allKeys(JSON.parse(text))).not.toContain('cost_cents');
	});

	it('gives the admin key the same body as the read token', async () => {
		const project = await createProject();
		await createTodo(project.id, { due_date: '2026-12-01' });
		const viaToken = await readSummary();
		const viaAdmin = await readSummary(adminHeaders());
		expect(viaAdmin.text).toBe(viaToken.text);
	});

	it('returns an empty list when there are no projects', async () => {
		const row = await env.DB.prepare('SELECT COUNT(*) AS total FROM projects').first<{ total: number }>();
		expect(row?.total).toBe(0);
		expect((await readSummary()).projects).toEqual([]);
	});
});
