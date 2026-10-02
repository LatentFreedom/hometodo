'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LinkedText } from '../../components/linked-text';
import {
  ApiError,
  clearSavedKey,
  deleteTodo,
  fetchContacts,
  fetchProjects,
  fetchTodo,
  updateTodo,
  type Contact,
  type Project,
  type Todo,
  type TodoPatch,
  type TodoStatus,
} from '../../lib/api';
import { formatCost, formatDay, formatTimestamp, isOverdue, parseDollars } from '../../lib/todo-format';

const STATUSES: { value: TodoStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'done', label: 'Done' },
];

const INPUT = 'w-full rounded border border-border bg-input px-3 py-2 text-foreground';
const PRIMARY = 'rounded border border-foreground bg-foreground px-3 py-2 text-background disabled:opacity-50';
const SECONDARY = 'rounded border border-border px-3 py-2 disabled:opacity-50';

interface Draft {
  title: string;
  notes: string;
  status: TodoStatus;
  due_date: string;
  cost: string;
  contact_id: string;
  project_id: string;
}

function toDraft(todo: Todo): Draft {
  return {
    title: todo.title,
    notes: todo.notes ?? '',
    status: todo.status,
    due_date: todo.due_date ?? '',
    cost: todo.cost_cents === null ? '' : (todo.cost_cents / 100).toFixed(2),
    contact_id: todo.contact_id ?? '',
    project_id: todo.project_id,
  };
}

/** Only the fields that changed, so a save never rewrites values it did not touch. */
function diff(todo: Todo, draft: Draft): TodoPatch | string {
  const changes: TodoPatch = {};
  const title = draft.title.trim();
  if (!title) return 'The title cannot be empty.';
  if (title !== todo.title) changes.title = title;
  const notes = draft.notes.trim() === '' ? null : draft.notes;
  if (notes !== todo.notes) changes.notes = notes;
  if (draft.status !== todo.status) changes.status = draft.status;
  const due = draft.due_date || null;
  if (due !== todo.due_date) changes.due_date = due;
  const cents = parseDollars(draft.cost);
  if (cents === undefined) return 'Enter the cost as dollars, for example 125 or 125.50.';
  if (cents !== todo.cost_cents) changes.cost_cents = cents;
  const contact = draft.contact_id || null;
  if (contact !== todo.contact_id) changes.contact_id = contact;
  if (draft.project_id !== todo.project_id) changes.project_id = draft.project_id;
  return changes;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function TodoClient() {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [todo, setTodo] = useState<Todo | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // A rejected key mid-session means the key was rotated: drop it and let the gate ask again.
  const handleError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 401) {
      clearSavedKey();
      window.location.reload();
      return;
    }
    if (err instanceof ApiError && err.status === 404) {
      setNotFound(true);
      return;
    }
    setError(err instanceof ApiError ? err.message : fallback);
  }, []);

  useEffect(() => {
    const real = new URLSearchParams(window.location.search).get('id');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the id from the browser URL
    setId(real && real.trim() !== '' ? real : null);
    if (!real) setNotFound(true);
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([fetchTodo(id), fetchProjects(), fetchContacts()])
      .then(([todoResult, projectsResult, contactsResult]) => {
        if (cancelled) return;
        setTodo(todoResult.todo);
        setProjects(projectsResult.projects);
        setContacts(contactsResult.contacts);
      })
      .catch((err) => {
        if (!cancelled) handleError(err, 'Could not load this todo.');
      });
    return () => {
      cancelled = true;
    };
  }, [id, handleError]);

  const save = useCallback(
    async (changes: TodoPatch) => {
      if (!todo || Object.keys(changes).length === 0) {
        setEditing(false);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const { todo: saved } = await updateTodo(todo.id, changes);
        if (changes.project_id) {
          router.push(`/project/?id=${encodeURIComponent(saved.project_id)}`);
          return;
        }
        setTodo(saved);
        setEditing(false);
      } catch (err) {
        handleError(err, 'Could not save the todo.');
      } finally {
        setBusy(false);
      }
    },
    [todo, handleError, router],
  );

  async function remove() {
    if (!todo) return;
    if (!window.confirm(`Delete "${todo.title}"? This cannot be undone. Marking it done keeps it instead.`)) return;
    setBusy(true);
    try {
      await deleteTodo(todo.id);
      router.push(`/project/?id=${encodeURIComponent(todo.project_id)}`);
    } catch (err) {
      handleError(err, 'Could not delete the todo.');
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">Todo not found</h1>
        <p className="text-muted-foreground">It may have been deleted, or the link is incomplete.</p>
        <Link href="/" className="underline underline-offset-4">
          Back to all projects
        </Link>
      </main>
    );
  }

  if (!todo) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        {error ? <p className="text-sm text-danger">{error}</p> : <p className="text-sm text-muted-foreground">Loading...</p>}
      </main>
    );
  }

  const project = projects.find((candidate) => candidate.id === todo.project_id) ?? null;
  const contact = contacts.find((candidate) => candidate.id === todo.contact_id) ?? null;
  const overdue = isOverdue(todo);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <Link href={`/project/?id=${encodeURIComponent(todo.project_id)}`} className="self-start text-sm underline underline-offset-4">
        {project ? `Back to ${project.name}` : 'Back to the project'}
      </Link>

      {editing && draft ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const changes = diff(todo, draft);
            if (typeof changes === 'string') {
              setError(changes);
              return;
            }
            void save(changes);
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-sm">Title</span>
            <input className={INPUT} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm">Notes</span>
            <textarea
              className={`${INPUT} min-h-[12rem] font-sans leading-relaxed`}
              rows={Math.min(24, Math.max(8, draft.notes.split('\n').length + 2))}
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              placeholder="Details, measurements, quotes, phone numbers..."
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm">Status</span>
              <select className={INPUT} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TodoStatus })}>
                {STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Due date</span>
              <input type="date" className={INPUT} value={draft.due_date} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Cost (dollars)</span>
              <input
                className={INPUT}
                inputMode="decimal"
                value={draft.cost}
                onChange={(event) => setDraft({ ...draft, cost: event.target.value })}
                placeholder="e.g. 125.50"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Contact</span>
              <select className={INPUT} value={draft.contact_id} onChange={(event) => setDraft({ ...draft, contact_id: event.target.value })}>
                <option value="">None</option>
                {contacts.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm">Project</span>
              <select className={INPUT} value={draft.project_id} onChange={(event) => setDraft({ ...draft, project_id: event.target.value })}>
                {projects.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={PRIMARY} disabled={busy}>
              {busy ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              className={SECONDARY}
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </form>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <h1 className={`break-words text-2xl font-semibold ${todo.status === 'done' ? 'text-muted-foreground line-through' : ''}`}>{todo.title}</h1>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((status) => (
                <button
                  key={status.value}
                  type="button"
                  disabled={busy || todo.status === status.value}
                  aria-pressed={todo.status === status.value}
                  className={todo.status === status.value ? PRIMARY : SECONDARY}
                  onClick={() => void save({ status: status.value })}
                >
                  {status.label}
                </button>
              ))}
              <button
                type="button"
                className={SECONDARY}
                onClick={() => {
                  setDraft(toDraft(todo));
                  setError(null);
                  setEditing(true);
                }}
              >
                Edit
              </button>
            </div>
          </div>

          <section className="rounded border border-border bg-card p-4">
            <h2 className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Notes</h2>
            {todo.notes ? (
              <LinkedText text={todo.notes} className="leading-relaxed" />
            ) : (
              <p className="text-sm text-muted-foreground">No notes yet. Use Edit to add some.</p>
            )}
          </section>

          <dl className="grid grid-cols-1 gap-4 rounded border border-border bg-card p-4 sm:grid-cols-2">
            <Field label="Due">
              {todo.due_date ? (
                <span className={overdue ? 'text-danger' : ''}>
                  {formatDay(todo.due_date)}
                  {overdue ? ' (overdue)' : ''}
                </span>
              ) : (
                <span className="text-muted-foreground">No due date</span>
              )}
            </Field>
            <Field label="Cost">{formatCost(todo.cost_cents) ?? <span className="text-muted-foreground">Not set</span>}</Field>
            <Field label="Contact">
              {contact ? (
                <span>
                  {contact.name}
                  {contact.role ? <span className="text-muted-foreground"> - {contact.role}</span> : null}
                  {contact.phone ? (
                    <a className="block underline underline-offset-4" href={`tel:${contact.phone}`}>
                      {contact.phone}
                    </a>
                  ) : null}
                </span>
              ) : (
                <span className="text-muted-foreground">None</span>
              )}
            </Field>
            <Field label="Project">{project?.name ?? <span className="text-muted-foreground">Unknown</span>}</Field>
            <Field label="Source">{todo.source === 'reminders' ? 'Imported from Reminders' : 'Added here'}</Field>
            <Field label="Created">{formatTimestamp(todo.created_at)}</Field>
            <Field label="Updated">{formatTimestamp(todo.updated_at)}</Field>
            {todo.completed_at ? <Field label="Completed">{formatTimestamp(todo.completed_at)}</Field> : null}
          </dl>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <button type="button" className="self-start text-sm text-danger underline underline-offset-4 disabled:opacity-50" disabled={busy} onClick={() => void remove()}>
            Delete this todo
          </button>
        </>
      )}
    </main>
  );
}
