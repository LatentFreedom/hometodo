'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon, KindIcon, type IconName } from '../../components/icons';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, INPUT, LABEL } from '../../components/ui';
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
  type RepeatMode,
  type RepeatUnit,
  type Todo,
  type TodoPatch,
  type TodoStatus,
} from '../../lib/api';
import { describeRepeat, formatClock, formatCost, formatDay, formatTimestamp, isOverdue, parseDollars } from '../../lib/todo-format';

const STATUSES: { value: TodoStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'done', label: 'Done' },
];

const REPEAT_MODES: { value: RepeatMode | ''; label: string }[] = [
  { value: '', label: 'Does not repeat' },
  { value: 'fixed', label: 'On a schedule (from the due date)' },
  { value: 'after_done', label: 'After it is done' },
];

const REPEAT_UNITS: { value: RepeatUnit; label: string }[] = [
  { value: 'day', label: 'day(s)' },
  { value: 'week', label: 'week(s)' },
  { value: 'month', label: 'month(s)' },
];

const MAX_REPEAT_EVERY = 366;


interface Draft {
  title: string;
  notes: string;
  status: TodoStatus;
  due_date: string;
  // HH:MM from a time input; empty means a date-only todo
  due_time: string;
  cost: string;
  contact_id: string;
  project_id: string;
  repeat_mode: RepeatMode | '';
  repeat_every: string;
  repeat_unit: RepeatUnit;
  // Local wall-clock time in the datetime-local form, YYYY-MM-DDTHH:MM
  remind_at: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** The stored UTC instant as the browser's local time, for a datetime-local input. */
function toLocalInput(instant: string | null): string {
  if (!instant) return '';
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A datetime-local value read in the browser's zone, sent as UTC seconds. */
function toUtcInstant(local: string): string | null {
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function toDraft(todo: Todo): Draft {
  return {
    title: todo.title,
    notes: todo.notes ?? '',
    status: todo.status,
    due_date: todo.due_date ?? '',
    due_time: todo.due_time ?? '',
    cost: todo.cost_cents === null ? '' : (todo.cost_cents / 100).toFixed(2),
    contact_id: todo.contact_id ?? '',
    project_id: todo.project_id,
    repeat_mode: todo.repeat_mode ?? '',
    repeat_every: String(todo.repeat_every ?? 1),
    repeat_unit: todo.repeat_unit ?? 'week',
    remind_at: toLocalInput(todo.remind_at),
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
  // The worker clears the time with the date, so a cleared date sends no time
  const dueTime = due ? draft.due_time || null : null;
  if (dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) return 'Enter the due time as hours and minutes.';
  if (due && dueTime !== todo.due_time) changes.due_time = dueTime;
  // Compared as local input text, so an untouched field never resends a reformatted time
  if (draft.remind_at !== toLocalInput(todo.remind_at)) {
    const remind = draft.remind_at ? toUtcInstant(draft.remind_at) : null;
    if (draft.remind_at && !remind) return 'Enter the reminder as a date and a time.';
    changes.remind_at = remind;
  }
  const cents = parseDollars(draft.cost);
  if (cents === undefined) return 'Enter the cost as dollars, for example 125 or 125.50.';
  if (cents !== todo.cost_cents) changes.cost_cents = cents;
  const contact = draft.contact_id || null;
  if (contact !== todo.contact_id) changes.contact_id = contact;
  if (draft.project_id !== todo.project_id) changes.project_id = draft.project_id;
  // The worker takes the three repeat fields together, so any change sends all three
  if (draft.repeat_mode === '') {
    if (todo.repeat_mode !== null) Object.assign(changes, { repeat_mode: null, repeat_every: null, repeat_unit: null });
  } else {
    const every = Number(draft.repeat_every);
    if (!Number.isInteger(every) || every < 1 || every > MAX_REPEAT_EVERY) return `Repeat every must be a whole number from 1 to ${MAX_REPEAT_EVERY}.`;
    if (draft.repeat_mode === 'fixed' && !due) return 'A repeat on a schedule needs a due date to count from.';
    if (draft.repeat_mode !== todo.repeat_mode || every !== todo.repeat_every || draft.repeat_unit !== todo.repeat_unit) {
      Object.assign(changes, { repeat_mode: draft.repeat_mode, repeat_every: every, repeat_unit: draft.repeat_unit });
    }
  }
  return changes;
}

function Field({ label, icon, children }: { label: string; icon: IconName; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-divider px-5 py-4">
      <Icon name={icon} className="mt-0.5 text-subtle" />
      <div className="flex min-w-0 flex-col gap-1">
        <dt className={LABEL}>{label}</dt>
        <dd className="min-w-0 break-words">{children}</dd>
      </div>
    </div>
  );
}

export function TodoClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawId = searchParams.get('id');
  const id = rawId && rawId.trim() !== '' ? rawId : null;
  const [todo, setTodo] = useState<Todo | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [nextTodo, setNextTodo] = useState<Todo | null>(null);

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

  // The "Open it" link on a repeating todo moves to another id without remounting this page
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- reset before loading another todo */
    setTodo(null);
    setNextTodo(null);
    setEditing(false);
    setNotFound(false);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
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
        const { todo: saved, next_todo: next } = await updateTodo(todo.id, changes);
        if (next) setNextTodo(next);
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

  if (!id || notFound) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-12 sm:px-8">
        <h1 className="font-display text-4xl font-medium">Todo not found</h1>
        <p className="text-muted-foreground">It may have been deleted, or the link is incomplete.</p>
        <Link href="/" className="text-sm text-accent hover:underline">
          Back to the overview
        </Link>
      </main>
    );
  }

  if (!todo) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
        {error ? <p className="text-sm text-danger">{error}</p> : <p className="text-sm text-muted-foreground">Loading...</p>}
      </main>
    );
  }

  const project = projects.find((candidate) => candidate.id === todo.project_id) ?? null;
  const contact = contacts.find((candidate) => candidate.id === todo.contact_id) ?? null;
  const overdue = isOverdue(todo);

  return (
    <main className="px-4 pb-16 pt-6 sm:px-8 lg:px-16 lg:pt-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <Link
          href={`/project/?id=${encodeURIComponent(todo.project_id)}`}
          className="inline-flex min-h-11 items-center gap-2 self-start text-[13px] text-muted-foreground hover:text-foreground"
        >
          <Icon name="arrowLeft" size={16} />
          {project ? (
            <span className="inline-flex items-center gap-1.5">
              <KindIcon kind={project.kind} size={15} />
              {project.name}
            </span>
          ) : (
            'Back to the project'
          )}
        </Link>

        {editing && draft ? (
          <form
            className="flex flex-col gap-6"
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
            <h1 className="font-display text-4xl font-medium">Edit todo</h1>

            <label className="flex flex-col gap-2">
              <span className={LABEL}>Title</span>
              <input className={INPUT} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
            </label>

            <label className="flex flex-col gap-2">
              <span className={LABEL}>Notes</span>
              <textarea
                className={`${INPUT} min-h-[12rem] leading-relaxed`}
                rows={Math.min(24, Math.max(8, draft.notes.split('\n').length + 2))}
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                placeholder="Details, measurements, quotes, phone numbers..."
              />
            </label>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className={LABEL}>Status</span>
                <select className={INPUT} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TodoStatus })}>
                  {STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2">
                <span className={LABEL}>Due date</span>
                <input type="date" className={INPUT} value={draft.due_date} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} />
              </label>
              <label className="flex flex-col gap-2">
                <span className={LABEL}>Due time</span>
                <input
                  type="time"
                  className={INPUT}
                  value={draft.due_time}
                  disabled={!draft.due_date}
                  onChange={(event) => setDraft({ ...draft, due_time: event.target.value })}
                />
                <span className="text-xs text-muted-foreground">Optional. Needs a due date.</span>
              </label>
              <label className="flex flex-col gap-2">
                <span className={LABEL}>Remind me</span>
                <input
                  type="datetime-local"
                  className={INPUT}
                  value={draft.remind_at}
                  onChange={(event) => setDraft({ ...draft, remind_at: event.target.value })}
                />
                <span className="text-xs text-muted-foreground">Leave empty to be reminded at the due time, or on the morning of the due date.</span>
              </label>
              <label className="flex flex-col gap-2">
                <span className={LABEL}>Cost (dollars)</span>
                <input
                  className={INPUT}
                  inputMode="decimal"
                  value={draft.cost}
                  onChange={(event) => setDraft({ ...draft, cost: event.target.value })}
                  placeholder="e.g. 125.50"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className={LABEL}>Contact</span>
                <select className={INPUT} value={draft.contact_id} onChange={(event) => setDraft({ ...draft, contact_id: event.target.value })}>
                  <option value="">None</option>
                  {contacts.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 sm:col-span-2">
                <span className={LABEL}>Repeat</span>
                <select
                  className={INPUT}
                  value={draft.repeat_mode}
                  onChange={(event) => setDraft({ ...draft, repeat_mode: event.target.value as RepeatMode | '' })}
                >
                  {REPEAT_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>
              {draft.repeat_mode !== '' ? (
                <>
                  <label className="flex flex-col gap-2">
                    <span className={LABEL}>Every</span>
                    <input
                      className={INPUT}
                      type="number"
                      min={1}
                      max={MAX_REPEAT_EVERY}
                      inputMode="numeric"
                      value={draft.repeat_every}
                      onChange={(event) => setDraft({ ...draft, repeat_every: event.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className={LABEL}>Unit</span>
                    <select className={INPUT} value={draft.repeat_unit} onChange={(event) => setDraft({ ...draft, repeat_unit: event.target.value as RepeatUnit })}>
                      {REPEAT_UNITS.map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
              <label className="flex flex-col gap-2 sm:col-span-2">
                <span className={LABEL}>Project</span>
                <select className={INPUT} value={draft.project_id} onChange={(event) => setDraft({ ...draft, project_id: event.target.value })}>
                  {projects.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="submit" className={BUTTON_PRIMARY} disabled={busy}>
                {busy ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className={BUTTON_SECONDARY}
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
            <div className="flex flex-col gap-5">
              <h1
                className={`break-words font-display text-[40px] font-medium leading-[1.1] sm:text-[48px] ${
                  todo.status === 'done' ? 'text-muted-foreground line-through decoration-subtle decoration-1' : ''
                }`}
              >
                {todo.title}
              </h1>
              <div className="flex flex-wrap items-center gap-3">
                <div role="group" aria-label="Status" className="flex gap-1 rounded-full bg-muted p-1">
                  {STATUSES.map((status) => (
                    <button
                      key={status.value}
                      type="button"
                      disabled={busy || todo.status === status.value}
                      aria-pressed={todo.status === status.value}
                      onClick={() => void save({ status: status.value })}
                      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors ${
                        todo.status === status.value ? 'bg-card text-foreground shadow-sm' : 'text-foreground/70 hover:text-foreground disabled:opacity-50'
                      }`}
                    >
                      <Icon name={status.value} size={16} className={todo.status === status.value ? 'text-accent' : ''} />
                      {status.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={BUTTON_SECONDARY}
                  onClick={() => {
                    setDraft(toDraft(todo));
                    setError(null);
                    setEditing(true);
                  }}
                >
                  <Icon name="pencil" size={16} />
                  Edit
                </button>
              </div>
            </div>

            {nextTodo ? (
              <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-accent-soft px-5 py-4 text-sm">
                <Icon name="repeat" size={16} className="text-accent" />
                Next one made{nextTodo.due_date ? `, due ${formatDay(nextTodo.due_date)}` : ''}.
                <Link href={`/todo/?id=${encodeURIComponent(nextTodo.id)}`} className="font-medium text-accent hover:underline">
                  Open it
                </Link>
              </p>
            ) : null}

            <section className={`${CARD} flex flex-col gap-3 p-5 sm:p-6`}>
              <h2 className={LABEL}>Notes</h2>
              {todo.notes ? (
                <LinkedText text={todo.notes} className="leading-relaxed" />
              ) : (
                <p className="text-sm text-muted-foreground">No notes yet. Use Edit to add some.</p>
              )}
            </section>

            {/* Every field draws its own bottom rule; -mb-px tucks the last row's rule under the card edge */}
            <dl className={`${CARD} overflow-hidden`}>
              <div className="-mb-px grid grid-cols-1 sm:grid-cols-2">
              <Field label="Due" icon="calendar">
                {todo.due_date ? (
                  <span className={overdue ? 'text-danger' : ''}>
                    {formatDay(todo.due_date)}
                    {todo.due_time ? ` at ${formatClock(todo.due_time)}` : ''}
                    {overdue ? ' (overdue)' : ''}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No due date</span>
                )}
              </Field>
              <Field label="Remind me" icon="calendar">
                {todo.remind_at ? (
                  formatTimestamp(todo.remind_at)
                ) : todo.due_date && todo.due_time ? (
                  <span className="text-muted-foreground">At the due time</span>
                ) : todo.due_date ? (
                  <span className="text-muted-foreground">Morning of the due date</span>
                ) : (
                  <span className="text-muted-foreground">No reminder</span>
                )}
              </Field>
              <Field label="Repeats" icon="repeat">
                {describeRepeat(todo) ?? <span className="text-muted-foreground">Does not repeat</span>}
              </Field>
              <Field label="Cost" icon="cost">
                {formatCost(todo.cost_cents) ?? <span className="text-muted-foreground">Not set</span>}
              </Field>
              <Field label="Contact" icon="contact">
                {contact ? (
                  <span>
                    {contact.name}
                    {contact.role ? <span className="text-muted-foreground"> - {contact.role}</span> : null}
                    {contact.phone ? (
                      <a className="block text-accent hover:underline" href={`tel:${contact.phone}`}>
                        {contact.phone}
                      </a>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </Field>
              <Field label="Project" icon={project?.kind ?? 'other'}>
                {project?.name ?? <span className="text-muted-foreground">Unknown</span>}
              </Field>
              <Field label="Source" icon="notes">
                {todo.source === 'reminders' ? 'Imported from Reminders' : 'Added here'}
              </Field>
              <Field label="Created" icon="plus">
                {formatTimestamp(todo.created_at)}
              </Field>
              <Field label="Updated" icon="pencil">
                {formatTimestamp(todo.updated_at)}
              </Field>
              {todo.completed_at ? (
                <Field label="Completed" icon="done">
                  {formatTimestamp(todo.completed_at)}
                </Field>
              ) : null}
              </div>
            </dl>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <button type="button" className="self-start text-sm text-danger underline-offset-4 hover:underline disabled:opacity-50" disabled={busy} onClick={() => void remove()}>
              Delete this todo
            </button>
          </>
        )}
      </div>
    </main>
  );
}
