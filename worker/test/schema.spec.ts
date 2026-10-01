import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

// The migrations in migrations/ are applied by test/apply-migrations.ts before any
// spec runs, so this suite checks the shipped SQL rather than a copy of it.
describe('migrations', () => {
	it('creates the three core tables', async () => {
		const result = await env.DB.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
		).all<{ name: string }>();
		const tables = result.results.map((row) => row.name);

		expect(tables).toEqual(expect.arrayContaining(['projects', 'todos', 'contacts']));
	});

	it('has no account tables and keeps the wrong-key throttle table', async () => {
		const result = await env.DB.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
		).all<{ name: string }>();
		const tables = result.results.map((row) => row.name);

		expect(tables).toContain('access_failures');
		for (const removed of ['users', 'password_reset_tokens', 'auth_refresh_tokens']) {
			expect(tables).not.toContain(removed);
		}
	});

	it('rejects a project kind outside the allowed set', async () => {
		await expect(
			env.DB.prepare("INSERT INTO projects (id, name, kind) VALUES (?, ?, ?)")
				.bind(crypto.randomUUID(), 'Example project', 'spaceship')
				.run(),
		).rejects.toThrow();
	});

	it('rejects a todo status outside the allowed set', async () => {
		const projectId = crypto.randomUUID();
		await env.DB.prepare("INSERT INTO projects (id, name, kind) VALUES (?, ?, ?)")
			.bind(projectId, 'Example project', 'house')
			.run();

		await expect(
			env.DB.prepare('INSERT INTO todos (id, project_id, title, status) VALUES (?, ?, ?, ?)')
				.bind(crypto.randomUUID(), projectId, 'Example todo', 'maybe')
				.run(),
		).rejects.toThrow();
	});

	it('refuses a second import of the same source row', async () => {
		const projectId = crypto.randomUUID();
		await env.DB.prepare("INSERT INTO projects (id, name, kind) VALUES (?, ?, ?)")
			.bind(projectId, 'Example project', 'admin')
			.run();

		const insert = (id: string) =>
			env.DB.prepare('INSERT INTO todos (id, project_id, title, source, external_id) VALUES (?, ?, ?, ?, ?)')
				.bind(id, projectId, 'Example todo', 'reminders', 'example-external-id')
				.run();

		await insert(crypto.randomUUID());
		await expect(insert(crypto.randomUUID())).rejects.toThrow();
	});

	it('allows many manual rows to leave external_id null', async () => {
		// The uniqueness index is partial on purpose. A plain UNIQUE(source,
		// external_id) would let exactly one manual todo exist.
		const projectId = crypto.randomUUID();
		await env.DB.prepare("INSERT INTO projects (id, name, kind) VALUES (?, ?, ?)")
			.bind(projectId, 'Example project', 'car')
			.run();

		for (let i = 0; i < 3; i += 1) {
			await env.DB.prepare('INSERT INTO todos (id, project_id, title) VALUES (?, ?, ?)')
				.bind(crypto.randomUUID(), projectId, `Example todo ${i}`)
				.run();
		}

		const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM todos WHERE project_id = ?')
			.bind(projectId)
			.first<{ total: number }>();

		expect(count?.total).toBe(3);
	});
});
