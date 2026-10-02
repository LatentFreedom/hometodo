'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ApiError, createProject, fetchSummary, type ProjectKind, type SummaryProject } from '../lib/api';

const KIND_OPTIONS: ProjectKind[] = ['house', 'car', 'family', 'admin', 'networking', 'other'];

function formatDue(due: string | null): string {
  if (!due) return '';
  const date = new Date(`${due}T00:00:00`);
  return Number.isNaN(date.getTime()) ? due : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ProjectCard({ project }: { project: SummaryProject }) {
  const next = project.soonest_due[0] ?? null;
  return (
    <Link
      href={`/project/?id=${encodeURIComponent(project.id)}`}
      className="flex flex-col gap-2 rounded border border-border bg-card p-4 text-card-foreground hover:border-foreground"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 break-words font-semibold">{project.name}</span>
        <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
          {project.kind}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {project.open_count} open{project.waiting_count > 0 ? ` - ${project.waiting_count} waiting` : ''}
      </p>
      <p className="text-sm">
        {next ? (
          <>
            Next: {next.title}
            {next.due_date ? ` (${formatDue(next.due_date)})` : ''}
          </>
        ) : (
          <span className="text-muted-foreground">Nothing due</span>
        )}
      </p>
    </Link>
  );
}

function NewProjectForm({ onCreated }: { onCreated: (project: SummaryProject) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ProjectKind>('house');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) return;
      setWorking(true);
      setError(null);
      try {
        const { project } = await createProject({ name: trimmed, kind });
        onCreated({ id: project.id, name: project.name, kind: project.kind, open_count: 0, waiting_count: 0, done_count: 0, soonest_due: [] });
        setName('');
        setKind('house');
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create the project.');
      } finally {
        setWorking(false);
      }
    },
    [name, kind, onCreated],
  );

  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={onSubmit}>
      <label className="flex flex-col gap-1">
        <span className="text-sm">Project name</span>
        <input
          className="rounded border border-border bg-input px-3 py-2 text-foreground"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. House"
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm">Kind</span>
        <select
          className="rounded border border-border bg-input px-3 py-2 text-foreground"
          value={kind}
          onChange={(event) => setKind(event.target.value as ProjectKind)}
        >
          {KIND_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <button
        className="rounded border border-foreground bg-foreground px-3 py-2 text-background disabled:opacity-50"
        type="submit"
        disabled={working}
      >
        {working ? 'Adding...' : 'Add project'}
      </button>
      {error ? <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </form>
  );
}

export default function HomePage() {
  const [projects, setProjects] = useState<SummaryProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSummary()
      .then(({ projects: loaded }) => {
        if (!cancelled) setProjects(loaded);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load projects.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onCreated = useCallback((project: SummaryProject) => {
    setProjects((current) => [...(current ?? []), project]);
  }, []);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold">Home Todos</h1>
        <p className="text-sm text-muted-foreground">The work of running a home, by area of life.</p>
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {projects === null && !error ? <p className="text-sm text-muted-foreground">Loading...</p> : null}

      {projects !== null && projects.length === 0 ? (
        <div className="flex flex-col gap-4 rounded border border-border bg-card p-4">
          <p className="text-sm">No projects yet. Create the first one to start tracking work.</p>
          <NewProjectForm onCreated={onCreated} />
        </div>
      ) : null}

      {projects !== null && projects.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
          <details className="rounded border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">Add another project</summary>
            <div className="mt-3">
              <NewProjectForm onCreated={onCreated} />
            </div>
          </details>
        </>
      ) : null}
    </main>
  );
}
