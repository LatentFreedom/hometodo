#!/usr/bin/env -S npx tsx
// One-time import of scripts/reminders-export.js output into Home Todos.
//
// Run after the export:
//   npm run import:reminders
//
// Required env vars:
//   HOMETODO_ADMIN_KEY  the ADMIN_API_KEY secret for the target deploy
// Optional:
//   HOMETODO_API_URL    defaults to https://home.imnotbot.com/api/v1
//
// Idempotent on (source, external_id): a reminder already imported is
// updated in place, never duplicated, so this is safe to re-run.

import { readFileSync } from 'node:fs';
import path from 'node:path';

interface ExportedReminder {
	list: string;
	id: string;
	title: string;
	notes: string | null;
	dueDate: string | null;
	completed: boolean;
	completionDate: string | null;
}

interface ProjectRow {
	id: string;
	name: string;
	archived_at: string | null;
}

interface TodoRow {
	id: string;
	project_id: string;
	source: string;
	external_id: string | null;
}

const API_URL = (process.env.HOMETODO_API_URL || 'https://home.imnotbot.com/api/v1').replace(/\/+$/, '');
const ADMIN_KEY = process.env.HOMETODO_ADMIN_KEY || '';

if (!ADMIN_KEY) {
	console.error('Set HOMETODO_ADMIN_KEY to the deploy\'s ADMIN_API_KEY before running this.');
	process.exit(1);
}

async function api(method: string, pathname: string, body?: unknown): Promise<unknown> {
	const response = await fetch(`${API_URL}${pathname}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			'X-Admin-API-Key': ADMIN_KEY,
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (response.status === 204) return null;
	const text = await response.text();
	const data = text ? JSON.parse(text) : null;
	if (!response.ok) {
		throw new Error(`${method} ${pathname} -> ${response.status}: ${text}`);
	}
	return data;
}

async function findOrCreateProject(name: string, cache: Map<string, ProjectRow>): Promise<ProjectRow> {
	const existing = cache.get(name);
	if (existing) return existing;
	const { project } = (await api('POST', '/projects', { name, kind: 'other' })) as { project: ProjectRow };
	cache.set(name, project);
	return project;
}

/** Every todo already imported from Reminders for one project, keyed by external_id. */
async function loadImportedTodos(projectId: string): Promise<Map<string, TodoRow>> {
	const byExternalId = new Map<string, TodoRow>();
	let cursor: string | null = null;
	do {
		const query = new URLSearchParams({ project_id: projectId, include_archived: 'true', limit: '200' });
		if (cursor) query.set('cursor', cursor);
		const page = (await api('GET', `/todos?${query.toString()}`)) as { todos: TodoRow[]; next_cursor: string | null };
		for (const todo of page.todos) {
			if (todo.source === 'reminders' && todo.external_id) byExternalId.set(todo.external_id, todo);
		}
		cursor = page.next_cursor;
	} while (cursor);
	return byExternalId;
}

function toDueDate(iso: string | null): string | null {
	return iso ? iso.slice(0, 10) : null;
}

async function main(): Promise<void> {
	const exportPath = path.join(process.cwd(), 'reminders.json');
	const reminders: ExportedReminder[] = JSON.parse(readFileSync(exportPath, 'utf8'));

	const { projects } = (await api('GET', '/projects?include_archived=true')) as { projects: ProjectRow[] };
	const projectsByName = new Map(projects.map((project) => [project.name, project]));

	const byList = new Map<string, ExportedReminder[]>();
	for (const reminder of reminders) {
		const bucket = byList.get(reminder.list) ?? [];
		bucket.push(reminder);
		byList.set(reminder.list, bucket);
	}

	let created = 0;
	let updated = 0;

	for (const [listName, listReminders] of byList) {
		const project = await findOrCreateProject(listName, projectsByName);
		const imported = await loadImportedTodos(project.id);

		for (const reminder of listReminders) {
			const title = reminder.title.trim() || '(untitled reminder)';
			const fields = {
				project_id: project.id,
				title,
				notes: reminder.notes,
				status: reminder.completed ? 'done' : 'open',
				due_date: toDueDate(reminder.dueDate),
			};

			const existing = imported.get(reminder.id);
			if (existing) {
				await api('PATCH', `/todos/${existing.id}`, {
					title: fields.title,
					notes: fields.notes,
					status: fields.status,
					due_date: fields.due_date,
				});
				updated += 1;
			} else {
				await api('POST', '/todos', { ...fields, source: 'reminders', external_id: reminder.id });
				created += 1;
			}
		}
	}

	console.log(`Imported ${reminders.length} reminder(s) across ${byList.size} list(s): ${created} created, ${updated} updated.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
