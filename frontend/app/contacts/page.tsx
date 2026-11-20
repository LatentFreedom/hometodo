'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, createContact, fetchContacts, updateContact, type Contact, type ContactInput } from '../../lib/api';
import { Icon } from '../../components/icons';
import { BUTTON_PRIMARY, BUTTON_QUIET, BUTTON_SECONDARY, CARD, DISPLAY_H1, INPUT, LABEL } from '../../components/ui';

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
      className="flex flex-col gap-4"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!form.name?.trim()) return;
        onSubmit(form);
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className={LABEL}>Name</span>
          <input
            className={INPUT}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={LABEL}>Role</span>
          <input
            className={INPUT}
            value={form.role ?? ''}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
            placeholder="e.g. Roofer"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={LABEL}>Phone</span>
          <input
            className={INPUT}
            value={form.phone ?? ''}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={LABEL}>Email</span>
          <input
            type="email"
            className={INPUT}
            value={form.email ?? ''}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>
      </div>
      <label className="flex flex-col gap-2">
        <span className={LABEL}>Notes</span>
        <textarea
          className={INPUT}
          value={form.notes ?? ''}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          rows={2}
        />
      </label>
      <div className="flex items-center gap-4">
        <button className={BUTTON_PRIMARY} type="submit" disabled={busy}>
          {busy ? 'Saving...' : 'Save'}
        </button>
        {onCancel ? (
          <button type="button" className={BUTTON_QUIET} onClick={onCancel}>
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
      <li className="border-b border-divider p-5 last:border-b-0 sm:p-6">
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
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </li>
    );
  }

  const initials = contact.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

  return (
    <li className="flex items-start gap-4 border-b border-divider px-5 py-5 last:border-b-0 sm:px-6">
      <span aria-hidden="true" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-lg font-semibold text-accent">
        {initials}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 break-words">
        <p className="font-medium">
          {contact.name}
          {contact.role ? <span className="ml-2 text-[13px] font-normal text-muted-foreground">{contact.role}</span> : null}
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
          {contact.phone ? (
            <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 text-foreground/80 hover:text-accent">
              <Icon name="phone" size={14} />
              {contact.phone}
            </a>
          ) : null}
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className="inline-flex min-w-0 items-center gap-1.5 break-all text-foreground/80 hover:text-accent">
              <Icon name="mail" size={14} />
              {contact.email}
            </a>
          ) : null}
        </div>
        {contact.notes ? <p className="text-[13px] text-muted-foreground">{contact.notes}</p> : null}
      </div>
      <button
        type="button"
        aria-label={`Edit ${contact.name}`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => setEditing(true)}
      >
        <Icon name="pencil" size={16} />
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
    <main className="px-4 pb-16 pt-10 sm:px-8 lg:px-16 lg:pt-12">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">The people you call</p>
            <h1 className={DISPLAY_H1}>Contacts</h1>
          </div>
          {!adding ? (
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} />
              Add contact
            </button>
          ) : null}
        </header>

        {adding ? (
          <div className={`${CARD} p-5 sm:p-6`}>
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
            {addError ? <p className="mt-2 text-sm text-danger">{addError}</p> : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {contacts === null && !error ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
        {contacts !== null && contacts.length === 0 ? <p className="text-sm text-muted-foreground">No contacts yet.</p> : null}

        {contacts !== null && contacts.length > 0 ? (
          <ul className={CARD}>
            {contacts.map((contact) => (
              <ContactRow key={contact.id} contact={contact} onSaved={onSaved} />
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
