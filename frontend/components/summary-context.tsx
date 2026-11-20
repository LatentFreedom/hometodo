'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ApiError, fetchSummary, type SummaryProject } from '../lib/api';

interface SummaryState {
  projects: SummaryProject[] | null;
  error: string | null;
  refresh: () => void;
  addProject: (project: SummaryProject) => void;
}

const SummaryContext = createContext<SummaryState | null>(null);

/**
 * One copy of the per-project summary for the whole app: the sidebar, the overview, and
 * the quick-add dialog all read it. It reloads on every page change and whenever a page
 * calls refresh() after a write, so the counts in the sidebar never drift for long.
 */
export function SummaryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [projects, setProjects] = useState<SummaryProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchSummary()
      .then(({ projects: loaded }) => {
        if (cancelled) return;
        setProjects(loaded);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load projects.');
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, version]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);
  const addProject = useCallback((project: SummaryProject) => {
    setProjects((current) => [...(current ?? []), project]);
  }, []);

  return <SummaryContext.Provider value={{ projects, error, refresh, addProject }}>{children}</SummaryContext.Provider>;
}

export function useSummary(): SummaryState {
  const ctx = useContext(SummaryContext);
  if (!ctx) throw new Error('useSummary must be used within SummaryProvider');
  return ctx;
}
