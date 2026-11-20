'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ApiError, createProject, updateTodo, type ProjectKind, type SummaryProject, type SummaryTodo } from '../lib/api';
import { Icon, KIND_LABELS, KindIcon } from '../components/icons';
import { useSummary } from '../components/summary-context';
import { BUTTON_PRIMARY, BUTTON_QUIET, CARD, DISPLAY_H1, DISPLAY_H2, INPUT, LABEL } from '../components/ui';
import { isOverdue, relativeDue, todayLocal } from '../lib/todo-format';

const KIND_OPTIONS: ProjectKind[] = ['house', 'car', 'family', 'admin', 'networking', 'other'];
const COMING_UP_LIMIT = 6;

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning.';
  if (hour < 18) return 'Good afternoon.';
  return 'Good evening.';
}

const TODAY_LABEL = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

type UpcomingTodo = SummaryTodo & { project: SummaryProject };

function ComingUpRow({ todo, onDone }: { todo: UpcomingTodo; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const overdue = isOverdue(todo);
  const waiting = todo.status === 'waiting';

  async function markDone() {
    setBusy(true);
    try {
      await updateTodo(todo.id, { status: 'done' });
      onDone();
    } catch {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-4 border-b border-divider px-4 py-3.5 last:border-b-0 sm:px-5">
      {waiting ? (
        <span role="img" aria-label="Waiting" className="inline-flex h-7 w-7 items-center justify-center text-accent">
          <Icon name="waiting" size={22} />
        </span>
      ) : (
        <button
          type="button"
          aria-label={`Mark "${todo.title}" done`}
          disabled={busy}
          onClick={() => void markDone()}
          className={`group inline-flex h-7 w-7 items-center justify-center disabled:opacity-50 ${overdue ? 'text-danger' : 'text-subtle hover:text-accent'}`}
        >
          <Icon name="open" size={22} className="group-hover:hidden" />
          <Icon name="done" size={22} className="hidden group-hover:block" />
        </button>
      )}
      <Link href={`/todo/?id=${encodeURIComponent(todo.id)}`} className="min-w-0 flex-1 truncate font-medium hover:text-accent">
        {todo.title}
      </Link>
      <span className="hidden items-center gap-1.5 text-[13px] text-muted-foreground sm:flex">
        <KindIcon kind={todo.project.kind} size={15} />
        {todo.project.name}
      </span>
      <span className={`shrink-0 text-right sm:w-24 text-[13px] ${overdue ? 'font-medium text-danger' : 'text-foreground/75'}`}>
        {todo.due_date ? relativeDue(todo.due_date) : ''}
      </span>
    </li>
  );
}

function ProjectCard({ project }: { project: SummaryProject }) {
  const next = project.soonest_due[0] ?? null;
  const overdue = next !== null && isOverdue(next);
  const counts = [`${project.open_count} open`, project.waiting_count > 0 ? `${project.waiting_count} waiting` : null].filter(Boolean).join(' · ');

  return (
    <Link
      href={`/project/?id=${encodeURIComponent(project.id)}`}
      className={`${CARD} group flex flex-col gap-5 p-5 transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg hover:shadow-foreground/5 sm:p-6`}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
          <KindIcon kind={project.kind} size={20} />
        </span>
        <Icon name="chevronRight" className="text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="break-words font-display text-[26px] font-semibold leading-tight">{project.name}</span>
        <span className="text-[13px] text-muted-foreground">{counts}</span>
      </div>
      <p className={`truncate border-t border-divider pt-3.5 text-[13px] ${overdue ? 'text-danger' : 'text-foreground/75'}`}>
        {next ? `${overdue ? 'Overdue' : 'Next'}: ${next.title}${next.due_date && !overdue ? ` · ${relativeDue(next.due_date)}` : ''}` : 'Nothing due'}
      </p>
    </Link>
  );
}

function NewProjectCard() {
  const { addProject } = useSummary();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ProjectKind>('house');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setWorking(true);
    setError(null);
    try {
      const { project } = await createProject({ name: trimmed, kind });
      addProject({ id: project.id, name: project.name, kind: project.kind, open_count: 0, waiting_count: 0, done_count: 0, soonest_due: [] });
      setName('');
      setKind('house');
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the project.');
    } finally {
      setWorking(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[200px] flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-accent hover:text-accent"
      >
        <Icon name="plus" size={22} />
        New project
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className={`${CARD} flex flex-col gap-4 p-5 sm:p-6`}>
      <label className="flex flex-col gap-2">
        <span className={LABEL}>Name</span>
        <input className={INPUT} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Garden" required autoFocus />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className={`${LABEL} mb-2`}>Kind</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {KIND_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              onClick={() => setKind(option)}
              className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border text-[11px] transition-colors ${
                kind === option ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <KindIcon kind={option} size={18} />
              {KIND_LABELS[option]}
            </button>
          ))}
        </div>
      </fieldset>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex items-center gap-4">
        <button className={BUTTON_PRIMARY} type="submit" disabled={working}>
          {working ? 'Adding...' : 'Add project'}
        </button>
        <button type="button" className={BUTTON_QUIET} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function HomePage() {
  const { projects, error, refresh } = useSummary();
  const now = new Date();

  const { upcoming, openTotal, waitingTotal, overdueTotal } = useMemo(() => {
    const list = projects ?? [];
    const today = todayLocal();
    const due: UpcomingTodo[] = list.flatMap((project) => project.soonest_due.map((todo) => ({ ...todo, project })));
    due.sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
    return {
      upcoming: due.slice(0, COMING_UP_LIMIT),
      openTotal: list.reduce((sum, project) => sum + project.open_count, 0),
      waitingTotal: list.reduce((sum, project) => sum + project.waiting_count, 0),
      // The summary carries each project's five soonest-due todos, so this counts what it can see
      overdueTotal: due.filter((todo) => isOverdue(todo, today)).length,
    };
  }, [projects]);

  return (
    <main className="px-4 pb-16 pt-10 sm:px-8 lg:px-16 lg:pt-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-12">
        <header className="flex flex-col gap-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{TODAY_LABEL.format(now)}</p>
          <h1 className={DISPLAY_H1}>{greeting(now.getHours())}</h1>
        </header>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        {projects === null && !error ? <p className="text-sm text-muted-foreground">Loading...</p> : null}

        {projects !== null ? (
          <>
            <section aria-label="At a glance" className="grid grid-cols-3 border-y border-border">
              {[
                { value: openTotal, label: 'Open', danger: false },
                { value: waitingTotal, label: 'Waiting on others', danger: false },
                { value: overdueTotal, label: 'Overdue', danger: overdueTotal > 0 },
              ].map((stat, index) => (
                <div key={stat.label} className={`flex flex-col gap-1 py-5 ${index > 0 ? 'border-l border-border pl-4 sm:pl-6' : ''}`}>
                  <span className={`font-display text-[40px] font-medium leading-none lining-nums ${stat.danger ? 'text-danger' : ''}`}>{stat.value}</span>
                  <span className="text-[13px] text-muted-foreground">{stat.label}</span>
                </div>
              ))}
            </section>

            {upcoming.length > 0 ? (
              <section className="flex flex-col gap-4">
                <h2 className={DISPLAY_H2}>Coming up</h2>
                <ul className={CARD}>
                  {upcoming.map((todo) => (
                    <ComingUpRow key={todo.id} todo={todo} onDone={refresh} />
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="flex flex-col gap-4">
              <h2 className={DISPLAY_H2}>Projects</h2>
              {projects.length === 0 ? <p className="text-sm text-muted-foreground">No projects yet. Create the first one to start tracking work.</p> : null}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {projects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
                <NewProjectCard />
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
