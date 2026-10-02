'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ApiError,
  createTodo,
  fetchContacts,
  fetchProject,
  fetchTodos,
  updateTodo,
  type Contact,
  type Project,
  type Todo,
  type TodoStatus,
} from '../../lib/api';

// A done todo stays visible for this long, then disappears from the collapsed
// section entirely (the API never deletes it - this is a display-only cutoff).
const DONE_VISIBLE_DAYS = 7;
const DONE_VISIBLE_MS = DONE_VISIBLE_DAYS * 24 * 60 * 60 * 1000;

function isRecentlyDone(todo: Todo): boolean {
  if (todo.status !== 'done') return false;
  if (!todo.completed_at) return true;
  const completed = new Date(todo.completed_at).getTime();
  if (Number.isNaN(completed)) return true;
  return Date.now() - completed <= DONE_VISIBLE_MS;
}

function contactName(contacts: Contact[], contactId: string | null): string | null {
  if (!contactId) return null;
  return contacts.find((contact) => contact.id === contactId)?.name ?? null;
}

function AddTodoForm({
  contacts,
  busy,
  onAdd,
}: {
  contacts: Contact[];
  busy: boolean;
  onAdd: (input: { title: string; due_date: string | null; contact_id: string | null }) => void;
}) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [contactId, setContactId] = useState('');

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) return;
        onAdd({ title: trimmed, due_date: dueDate || null, contact_id: contactId || null });
        setTitle('');
        setDueDate('');
        setContactId('');
      }}
    >
      <label className="flex flex-1 min-w-[10rem] flex-col gap-1">
        <span className="text-sm">New todo</span>
        <input
          className="rounded border border-border bg-input px-3 py-2 text-foreground"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What needs doing?"
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm">Due</span>
        <input
          type="date"
          className="rounded border border-border bg-input px-3 py-2 text-foreground"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm">Contact</span>
        <select
          className="rounded border border-border bg-input px-3 py-2 text-foreground"
          value={contactId}
          onChange={(event) => setContactId(event.target.value)}
        >
          <option value="">None</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded border border-foreground bg-foreground px-3 py-2 text-background disabled:opacity-50"
        disabled={busy}
      >
        {busy ? 'Adding...' : 'Add'}
      </button>
    </form>
  );
}

function TodoRow({
  todo,
  contacts,
  onChange,
}: {
  todo: Todo;
  contacts: Contact[];
  onChange: (todo: Todo) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const [dueDate, setDueDate] = useState(todo.due_date ?? '');
  const [contactId, setContactId] = useState(todo.contact_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (changes: Partial<{ title: string; status: TodoStatus; due_date: string | null; contact_id: string | null }>) => {
      setBusy(true);
      setError(null);
      try {
        const { todo: saved } = await updateTodo(todo.id, changes);
        onChange(saved);
        setEditing(false);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not save the todo.');
      } finally {
        setBusy(false);
      }
    },
    [todo.id, onChange],
  );

  if (editing) {
    return (
      <li className="rounded border border-border bg-card p-3">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void save({ title: title.trim(), due_date: dueDate || null, contact_id: contactId || null });
          }}
        >
          <label className="flex flex-1 min-w-[10rem] flex-col gap-1">
            <span className="text-sm">Title</span>
            <input
              className="rounded border border-border bg-input px-3 py-2 text-foreground"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm">Due</span>
            <input
              type="date"
              className="rounded border border-border bg-input px-3 py-2 text-foreground"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm">Contact</span>
            <select
              className="rounded border border-border bg-input px-3 py-2 text-foreground"
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
            >
              <option value="">None</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded border border-foreground bg-foreground px-3 py-2 text-background disabled:opacity-50"
            disabled={busy}
          >
            Save
          </button>
          <button
            type="button"
            className="text-sm text-muted-foreground underline underline-offset-4"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </form>
        {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </li>
    );
  }

  const linkedContact = contactName(contacts, todo.contact_id);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-card p-3">
      <div className="min-w-0 break-words">
        <p className={todo.status === 'done' ? 'line-through text-muted-foreground' : ''}>{todo.title}</p>
        <p className="text-sm text-muted-foreground">
          {todo.due_date ? `Due ${todo.due_date}` : ''}
          {todo.due_date && linkedContact ? ' - ' : ''}
          {linkedContact ?? ''}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {todo.status !== 'done' ? (
          <>
            {todo.status === 'open' ? (
              <button type="button" className="text-sm underline underline-offset-4" onClick={() => void save({ status: 'waiting' })}>
                Waiting
              </button>
            ) : (
              <button type="button" className="text-sm underline underline-offset-4" onClick={() => void save({ status: 'open' })}>
                Open
              </button>
            )}
            <button type="button" className="text-sm underline underline-offset-4" onClick={() => void save({ status: 'done' })}>
              Done
            </button>
          </>
        ) : (
          <button type="button" className="text-sm underline underline-offset-4" onClick={() => void save({ status: 'open' })}>
            Reopen
          </button>
        )}
        <button type="button" className="text-sm underline underline-offset-4" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
    </li>
  );
}

export function ProjectClient() {
  const [id, setId] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);

  // The id travels in the query string (/project/?id=<id>): this is a static export,
  // so one pre-rendered page serves every project and reads the id in the browser.
  useEffect(() => {
    const real = new URLSearchParams(window.location.search).get('id');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the id from the browser URL
    setId(real && real.trim() !== '' ? real : null);
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([fetchProject(id), fetchTodos(id), fetchContacts()])
      .then(([projectResult, todosResult, contactsResult]) => {
        if (cancelled) return;
        setProject(projectResult.project);
        setTodos(todosResult.todos);
        setContacts(contactsResult.contacts);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && /not found/i.test(err.message)) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : 'Could not load the project.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onTodoChanged = useCallback((updated: Todo) => {
    setTodos((current) => (current ?? []).map((todo) => (todo.id === updated.id ? updated : todo)));
  }, []);

  const groups = useMemo(() => {
    const all = todos ?? [];
    const open = all.filter((todo) => todo.status === 'open');
    const waiting = all.filter((todo) => todo.status === 'waiting');
    const done = all.filter(isRecentlyDone);
    return { open, waiting, done };
  }, [todos]);

  if (notFound) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
        <p>That project does not exist.</p>
        <Link href="/" className="text-sm underline underline-offset-4">
          Back to projects
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
          All projects
        </Link>
        <h1 className="text-2xl font-semibold">{project ? project.name : 'Loading...'}</h1>
        {project ? <p className="text-sm text-muted-foreground">{project.kind}</p> : null}
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {project ? (
        <div className="rounded border border-border bg-card p-4">
          <AddTodoForm
            contacts={contacts}
            busy={addBusy}
            onAdd={async (input) => {
              setAddBusy(true);
              setError(null);
              try {
                const { todo } = await createTodo({ project_id: project.id, ...input, status: 'open' });
                setTodos((current) => [...(current ?? []), todo]);
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Could not create the todo.');
              } finally {
                setAddBusy(false);
              }
            }}
          />
        </div>
      ) : null}

      {todos === null && !error ? <p className="text-sm text-muted-foreground">Loading todos...</p> : null}

      {todos !== null ? (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Open ({groups.open.length})</h2>
            {groups.open.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing open.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {groups.open.map((todo) => (
                  <TodoRow key={todo.id} todo={todo} contacts={contacts} onChange={onTodoChanged} />
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Waiting ({groups.waiting.length})</h2>
            {groups.waiting.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing waiting.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {groups.waiting.map((todo) => (
                  <TodoRow key={todo.id} todo={todo} contacts={contacts} onChange={onTodoChanged} />
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <button
              type="button"
              className="text-left text-sm font-semibold uppercase tracking-wide text-muted-foreground"
              onClick={() => setDoneOpen((open) => !open)}
            >
              {doneOpen ? 'Hide' : 'Show'} done ({groups.done.length})
            </button>
            {doneOpen ? (
              <ul className="flex flex-col gap-2">
                {groups.done.map((todo) => (
                  <TodoRow key={todo.id} todo={todo} contacts={contacts} onChange={onTodoChanged} />
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
