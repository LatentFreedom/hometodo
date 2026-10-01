import { Hono } from 'hono';
import { deleteContact, getContact, insertContact, listContacts, updateContact } from '../db/contacts';
import { notFound, readJsonObject } from '../lib/http';
import { parseInput, type Field } from '../lib/validate';
import type { Env } from '../types/env';

export const contactRoutes = new Hono<{ Bindings: Env }>();

const FIELDS: Record<string, Field> = {
	name: { type: 'text', max: 200, required: true },
	role: { type: 'text', max: 200 },
	// Free text: a phone number can carry an extension, a country code, or a note.
	phone: { type: 'text', max: 50 },
	email: { type: 'email' },
	notes: { type: 'text', max: 10_000 },
};

contactRoutes.get('/', async (c) => c.json({ contacts: await listContacts(c.env.DB) }));

contactRoutes.post('/', async (c) => {
	const input = parseInput(await readJsonObject(c), FIELDS, 'create');
	return c.json({ contact: await insertContact(c.env.DB, input) }, 201);
});

contactRoutes.get('/:id', async (c) => {
	const contact = await getContact(c.env.DB, c.req.param('id'));
	if (!contact) throw notFound('Contact');
	return c.json({ contact });
});

contactRoutes.patch('/:id', async (c) => {
	const changes = parseInput(await readJsonObject(c), FIELDS, 'update');
	const contact = await updateContact(c.env.DB, c.req.param('id'), changes);
	if (!contact) throw notFound('Contact');
	return c.json({ contact });
});

/** Hard delete. Todos that named this contact survive with contact_id cleared. */
contactRoutes.delete('/:id', async (c) => {
	if (!(await deleteContact(c.env.DB, c.req.param('id')))) throw notFound('Contact');
	return c.body(null, 204);
});
