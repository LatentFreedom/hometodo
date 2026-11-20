'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, createTodo, type Todo } from '../lib/api';
import { Icon } from './icons';
import { useSummary } from './summary-context';
import { BUTTON_PRIMARY, INPUT, LABEL } from './ui';

/** Fired after the dialog makes a todo, so an open project page can show it without a reload. */
export const TODO_CREATED_EVENT = 'hometodo:todo-created';

/**
 * "New todo" from anywhere: one native modal dialog that asks only for what the list
 * needs (project, title, due date). Everything else is set on the todo's own page.
 */
export function QuickAddDialog({ open, defaultProjectId, onClose }: { open: boolean; defaultProjectId: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { projects, refresh } = useSummary();
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setProjectId(defaultProjectId ?? projects?.[0]?.id ?? '');
      setTitle('');
      setDueDate('');
      setError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, defaultProjectId, projects]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !projectId) return;
    setBusy(true);
    setError(null);
    try {
      const { todo } = await createTodo({ project_id: projectId, title: trimmed, due_date: dueDate || null, status: 'open' });
      window.dispatchEvent(new CustomEvent<Todo>(TODO_CREATED_EVENT, { detail: todo }));
      refresh();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the todo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself
        if (event.target === ref.current) onClose();
      }}
      className="w-[min(92vw,30rem)] rounded-3xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-foreground/30 backdrop:backdrop-blur-sm"
    >
      <form className="flex flex-col gap-5 p-6 sm:p-8" onSubmit={onSubmit}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-3xl font-medium">New todo</h2>
          <button type="button" aria-label="Close" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <label className="flex flex-col gap-2">
          <span className={LABEL}>What needs doing</span>
          <input className={INPUT} value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Project</span>
            <select className={INPUT} value={projectId} onChange={(event) => setProjectId(event.target.value)} required>
              {(projects ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Due</span>
            <input type="date" className={INPUT} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
        </div>

        {projects !== null && projects.length === 0 ? <p className="text-sm text-muted-foreground">Create a project first.</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <button type="submit" className={BUTTON_PRIMARY} disabled={busy || !projectId}>
          {busy ? 'Adding...' : 'Add todo'}
        </button>
      </form>
    </dialog>
  );
}
