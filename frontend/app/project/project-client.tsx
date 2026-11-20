'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import { Icon, KIND_LABELS, KindIcon, type IconName } from '../../components/icons';
import { TODO_CREATED_EVENT } from '../../components/quick-add';
import { useSummary } from '../../components/summary-context';
import { CARD, DISPLAY_H1 } from '../../components/ui';
import { describeRepeat, formatCost, isOverdue, notesPreview, relativeDue } from '../../lib/todo-format';

// A done todo stays visible for this long, then disappears from the Done tab
// entirely (the API never deletes it - this is a display-only cutoff).
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

const COMPACT_INPUT = 'min-h-11 rounded-xl border border-border bg-input px-3 text-sm text-foreground focus:border-accent';

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
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-divider px-4 py-3 sm:px-5"
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
      <Icon name="plus" size={22} className="text-accent" />
      <label className="min-w-[12rem] flex-1">
        <span className="sr-only">New todo</span>
        <input
          className="min-h-11 w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground/80"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a todo"
          required
        />
      </label>
      {title.trim() !== '' ? (
        <div className="flex w-full flex-wrap items-center gap-2 pl-9 sm:w-auto sm:pl-0">
          <label>
            <span className="sr-only">Due</span>
            <input type="date" className={COMPACT_INPUT} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <label>
            <span className="sr-only">Contact</span>
            <select className={COMPACT_INPUT} value={contactId} onChange={(event) => setContactId(event.target.value)}>
              <option value="">No contact</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-50">
            {busy ? 'Adding...' : 'Add'}
          </button>
        </div>
      ) : null}
    </form>
  );
}

function Meta({ icon, children, danger = false }: { icon: IconName; children: ReactNode; danger?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${danger ? 'font-medium text-danger' : ''}`}>
      <Icon name={icon} size={14} />
      {children}
    </span>
  );
}

function TodoRow({
  todo,
  contacts,
  onChange,
}: {
  todo: Todo;
  contacts: Contact[];
  onChange: (todo: Todo, next: Todo | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setStatus = useCallback(
    async (status: TodoStatus) => {
      setBusy(true);
      setError(null);
      try {
        const { todo: saved, next_todo: next } = await updateTodo(todo.id, { status });
        onChange(saved, next);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not save the todo.');
      } finally {
        setBusy(false);
      }
    },
    [todo.id, onChange],
  );

  const href = `/todo/?id=${encodeURIComponent(todo.id)}`;
  const linkedContact = contactName(contacts, todo.contact_id);
  const preview = notesPreview(todo.notes);
  const cost = formatCost(todo.cost_cents);
  const overdue = isOverdue(todo);
  const repeat = describeRepeat(todo);
  const done = todo.status === 'done';
  const waiting = todo.status === 'waiting';

  return (
    <li className="flex items-start gap-3.5 border-b border-divider px-4 py-4 last:border-b-0 sm:px-5">
      <button
        type="button"
        disabled={busy}
        aria-label={done ? `Reopen "${todo.title}"` : `Mark "${todo.title}" done`}
        onClick={() => void setStatus(done ? 'open' : 'done')}
        className={`group inline-flex h-7 w-7 shrink-0 items-center justify-center disabled:opacity-50 ${
          done ? 'text-accent' : waiting ? 'text-accent' : overdue ? 'text-danger' : 'text-subtle hover:text-accent'
        }`}
      >
        {done ? (
          <Icon name="done" size={22} />
        ) : (
          <>
            <Icon name={waiting ? 'waiting' : 'open'} size={22} className="group-hover:hidden" />
            <Icon name="done" size={22} className="hidden group-hover:block" />
          </>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
        <Link href={href} className={`break-words font-medium hover:text-accent ${done ? 'text-muted-foreground line-through decoration-subtle' : ''}`}>
          {todo.title}
        </Link>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
          {todo.due_date ? (
            <Meta icon="calendar" danger={overdue}>
              {relativeDue(todo.due_date)}
            </Meta>
          ) : null}
          {repeat ? <Meta icon="repeat">{repeat}</Meta> : null}
          {linkedContact ? <Meta icon="contact">{linkedContact}</Meta> : null}
          {cost ? <Meta icon="cost">{cost}</Meta> : null}
        </div>
        {preview ? <p className="line-clamp-1 break-words text-[13px] text-foreground/70">{preview}</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>

      {!done ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void setStatus(waiting ? 'open' : 'waiting')}
          className="hidden min-h-9 shrink-0 gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 sm:inline-flex sm:items-center"
        >
          <Icon name={waiting ? 'open' : 'waiting'} size={14} />
          {waiting ? 'Back to open' : 'Mark waiting'}
        </button>
      ) : null}
    </li>
  );
}

type Tab = 'open' | 'waiting' | 'done';

export function ProjectClient() {
  const searchParams = useSearchParams();
  const rawId = searchParams.get('id');
  const id = rawId && rawId.trim() !== '' ? rawId : null;
  const { refresh } = useSummary();
  const [project, setProject] = useState<Project | null>(null);
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('open');

  // The id travels in the query string (/project/?id=<id>): this is a static export,
  // so one pre-rendered page serves every project. The sidebar moves between projects
  // without remounting this page, so a new id resets everything.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- reset before loading another project */
    setProject(null);
    setTodos(null);
    setNotFound(false);
    setError(null);
    setTab('open');
    /* eslint-enable react-hooks/set-state-in-effect */
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

  // A todo made from the "New todo" dialog joins this list if it belongs here
  useEffect(() => {
    const onCreated = (event: Event) => {
      const todo = (event as CustomEvent<Todo>).detail;
      if (todo.project_id === id) setTodos((current) => [...(current ?? []), todo]);
    };
    window.addEventListener(TODO_CREATED_EVENT, onCreated);
    return () => window.removeEventListener(TODO_CREATED_EVENT, onCreated);
  }, [id]);

  // Finishing a repeating todo also returns the next occurrence, so it shows without a reload
  const onTodoChanged = useCallback(
    (updated: Todo, next: Todo | null = null) => {
      setTodos((current) => {
        const list = (current ?? []).map((todo) => (todo.id === updated.id ? updated : todo));
        return next && next.project_id === updated.project_id && !list.some((todo) => todo.id === next.id) ? [...list, next] : list;
      });
      refresh();
    },
    [refresh],
  );

  const groups = useMemo(() => {
    const all = todos ?? [];
    return {
      open: all.filter((todo) => todo.status === 'open'),
      waiting: all.filter((todo) => todo.status === 'waiting'),
      done: all.filter(isRecentlyDone),
    };
  }, [todos]);

  if (!id || notFound) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-12 sm:px-8">
        <h1 className="font-display text-4xl font-medium">Project not found</h1>
        <Link href="/" className="text-sm text-accent hover:underline">
          Back to the overview
        </Link>
      </main>
    );
  }

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: 'open', label: 'Open', count: groups.open.length },
    { value: 'waiting', label: 'Waiting', count: groups.waiting.length },
    { value: 'done', label: 'Done', count: groups.done.length },
  ];
  const shown = groups[tab];
  const empty = { open: 'Nothing open. Enjoy the quiet.', waiting: 'Nothing waiting on anyone.', done: `Nothing finished in the last ${DONE_VISIBLE_DAYS} days.` }[tab];

  return (
    <main className="px-4 pb-16 pt-6 sm:px-8 lg:px-16 lg:pt-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 self-start text-[13px] text-muted-foreground hover:text-foreground">
          <Icon name="arrowLeft" size={16} />
          Overview
        </Link>

        <header className="flex items-center gap-5">
          <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            {project ? <KindIcon kind={project.kind} size={30} /> : null}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className={`${DISPLAY_H1} break-words`}>{project ? project.name : ' '}</h1>
            {project && project.name !== KIND_LABELS[project.kind] ? <p className="text-[13px] text-muted-foreground">{KIND_LABELS[project.kind]}</p> : null}
          </div>
        </header>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div role="tablist" aria-label="Status" className="flex gap-1 self-start rounded-full bg-muted p-1">
          {tabs.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={tab === option.value}
              onClick={() => setTab(option.value)}
              className={`min-h-10 rounded-full px-4 text-sm font-medium transition-colors sm:px-5 ${
                tab === option.value ? 'bg-card text-foreground shadow-sm' : 'text-foreground/70 hover:text-foreground'
              }`}
            >
              {option.label} <span className="text-muted-foreground">{todos === null ? '' : option.count}</span>
            </button>
          ))}
        </div>

        <div className={CARD}>
          {project ? (
            <AddTodoForm
              contacts={contacts}
              busy={addBusy}
              onAdd={async (input) => {
                setAddBusy(true);
                setError(null);
                try {
                  const { todo } = await createTodo({ project_id: project.id, ...input, status: 'open' });
                  setTodos((current) => [...(current ?? []), todo]);
                  setTab('open');
                  refresh();
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : 'Could not create the todo.');
                } finally {
                  setAddBusy(false);
                }
              }}
            />
          ) : null}

          {todos === null && !error ? <p className="px-5 py-6 text-sm text-muted-foreground">Loading...</p> : null}

          {todos !== null && shown.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">{empty}</p> : null}

          {todos !== null && shown.length > 0 ? (
            <ul>
              {shown.map((todo) => (
                <TodoRow key={todo.id} todo={todo} contacts={contacts} onChange={onTodoChanged} />
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </main>
  );
}
