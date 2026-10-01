import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { API_BASE_PATH } from '../src/config/api';
import { adminHeaders, createContact, createProject, createTodo, del, get, patch, post, resetDatabase } from './helpers';

const CONTACTS = `${API_BASE_PATH}/contacts`;

describe('contacts API', () => {
	beforeEach(resetDatabase);

	it('creates, reads, lists, and updates a contact', async () => {
		const response = await post(
			CONTACTS,
			{ name: 'Example Roofing', role: 'roofer', phone: '555-0100', email: 'roofer@example.com', notes: 'Example note' },
			adminHeaders(),
		);
		expect(response.status).toBe(201);
		const { contact } = (await response.json()) as { contact: { id: string } };
		expect(contact).toMatchObject({ name: 'Example Roofing', phone: '555-0100', email: 'roofer@example.com' });

		expect(await (await get(`${CONTACTS}/${contact.id}`, adminHeaders())).json()).toMatchObject({ contact: { role: 'roofer' } });

		const updated = await patch(`${CONTACTS}/${contact.id}`, { phone: null, email: 'office@example.com' }, adminHeaders());
		expect(updated.status).toBe(200);
		expect(await updated.json()).toMatchObject({ contact: { phone: null, email: 'office@example.com' } });

		const list = (await (await get(CONTACTS, adminHeaders())).json()) as { contacts: Array<{ id: string }> };
		expect(list.contacts.map((row) => row.id)).toEqual([contact.id]);
	});

	it('lists contacts by name, ignoring case', async () => {
		await createContact({ name: 'zeta Example' });
		await createContact({ name: 'Alpha Example' });
		await createContact({ name: 'beta Example' });
		const list = (await (await get(CONTACTS, adminHeaders())).json()) as { contacts: Array<{ name: string }> };
		expect(list.contacts.map((row) => row.name)).toEqual(['Alpha Example', 'beta Example', 'zeta Example']);
	});

	it('rejects bad input with 400', async () => {
		const cases: unknown[] = [
			{},
			{ name: '' },
			{ name: 'Example', email: 'not-an-email' },
			{ name: 'Example', email: 7 },
			{ name: 'Example', phone: 5550100 },
			{ name: 'Example', phone: '5'.repeat(51) },
			{ name: 'Example', company: 'Example Co' },
		];
		for (const body of cases) {
			expect((await post(CONTACTS, body, adminHeaders())).status, JSON.stringify(body)).toBe(400);
		}
		const contact = await createContact();
		expect((await patch(`${CONTACTS}/${contact.id}`, {}, adminHeaders())).status).toBe(400);
		expect((await patch(`${CONTACTS}/${contact.id}`, { email: 'nope' }, adminHeaders())).status).toBe(400);
	});

	it('answers 404 for a contact that does not exist', async () => {
		const missing = `${CONTACTS}/00000000-0000-4000-8000-000000000000`;
		expect((await get(missing, adminHeaders())).status).toBe(404);
		expect((await patch(missing, { name: 'Example' }, adminHeaders())).status).toBe(404);
		expect((await del(missing, adminHeaders())).status).toBe(404);
	});

	it('deletes a contact and keeps its todos, unassigned', async () => {
		const project = await createProject();
		const contact = await createContact();
		const todo = await createTodo(project.id, { contact_id: contact.id });

		const response = await del(`${CONTACTS}/${contact.id}`, adminHeaders());
		expect(response.status).toBe(204);
		expect((await get(`${CONTACTS}/${contact.id}`, adminHeaders())).status).toBe(404);

		const row = await env.DB.prepare('SELECT contact_id FROM todos WHERE id = ?').bind(todo.id).first<{ contact_id: string | null }>();
		expect(row).toEqual({ contact_id: null });
	});
});
