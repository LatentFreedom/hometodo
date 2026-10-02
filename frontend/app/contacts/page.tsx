'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, createContact, fetchContacts, updateContact, type Contact, type ContactInput } from '../../lib/api';

const EMPTY_FORM: ContactInput = { name: '', role: '', phone: '', email: '', notes: '' };

function ContactForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: ContactInput;
  busy: boolean;
  onSubmit: (input: ContactInput) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<ContactInput>(initial);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!form.name?.trim()) return;
        onSubmit(form);
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm">Name</span>
          <input
            className="rounded border border-border bg-input px-3 py-2 text-foreground"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">Role</span>
          <input
            className="rounded border border-border bg-input px-3 py-2 text-foreground"
            value={form.role ?? ''}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
            placeholder="e.g. Roofer"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">Phone</span>
          <input
            className="rounded border border-border bg-input px-3 py-2 text-foreground"
            value={form.phone ?? ''}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">Email</span>
          <input
            type="email"
            className="rounded border border-border bg-input px-3 py-2 text-foreground"
            value={form.email ?? ''}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm">Notes</span>
        <textarea
          className="rounded border border-border bg-input px-3 py-2 text-foreground"
          value={form.notes ?? ''}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          rows={2}
        />
      </label>
      <div className="flex gap-2">
        <button
          className="rounded border border-foreground bg-foreground px-3 py-2 text-background disabled:opacity-50"
          type="submit"
          disabled={busy}
        >
          {busy ? 'Saving...' : 'Save'}
        </button>
        {onCancel ? (
          <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function ContactRow({ contact, onSaved }: { contact: Contact; onSaved: (contact: Contact) => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (editing) {
    return (
      <li className="rounded border border-border bg-card p-4">
        <ContactForm
          initial={{ name: contact.name, role: contact.role ?? '', phone: contact.phone ?? '', email: contact.email ?? '', notes: contact.notes ?? '' }}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            setBusy(true);
            setError(null);
            try {
              const { contact: saved } = await updateContact(contact.id, input);
              onSaved(saved);
              setEditing(false);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Could not save the contact.');
            } finally {
              setBusy(false);
            }
          }}
        />
        {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded border border-border bg-card p-4">
      <div className="min-w-0 break-words">
        <p className="font-medium">
          {contact.name}
          {contact.role ? <span className="ml-2 text-sm text-muted-foreground">{contact.role}</span> : null}
        </p>
        {contact.phone ? <p className="text-sm text-muted-foreground">{contact.phone}</p> : null}
        {contact.email ? <p className="text-sm text-muted-foreground">{contact.email}</p> : null}
        {contact.notes ? <p className="mt-1 text-sm">{contact.notes}</p> : null}
      </div>
      <button type="button" className="shrink-0 text-sm underline underline-offset-4" onClick={() => setEditing(true)}>
        Edit
      </button>
    </li>
  );
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchContacts()
      .then(({ contacts: loaded }) => {
        if (!cancelled) setContacts(loaded);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load contacts.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSaved = useCallback((contact: Contact) => {
    setContacts((current) => (current ?? []).map((existing) => (existing.id === contact.id ? contact : existing)));
  }, []);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <button type="button" className="rounded border border-border px-3 py-1 text-sm" onClick={() => setAdding((open) => !open)}>
          {adding ? 'Close' : 'Add contact'}
        </button>
      </div>

      {adding ? (
        <div className="rounded border border-border bg-card p-4">
          <ContactForm
            initial={EMPTY_FORM}
            busy={addBusy}
            onCancel={() => setAdding(false)}
            onSubmit={async (input) => {
              setAddBusy(true);
              setAddError(null);
              try {
                const { contact } = await createContact(input);
                setContacts((current) => [...(current ?? []), contact]);
                setAdding(false);
              } catch (err) {
                setAddError(err instanceof ApiError ? err.message : 'Could not create the contact.');
              } finally {
                setAddBusy(false);
              }
            }}
          />
          {addError ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{addError}</p> : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {contacts === null && !error ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      {contacts !== null && contacts.length === 0 ? <p className="text-sm text-muted-foreground">No contacts yet.</p> : null}

      {contacts !== null && contacts.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {contacts.map((contact) => (
            <ContactRow key={contact.id} contact={contact} onSaved={onSaved} />
          ))}
        </ul>
      ) : null}
    </main>
  );
}
