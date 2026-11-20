'use client';

import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Icon, KindIcon, type IconName } from './icons';
import { QuickAddDialog } from './quick-add';
import { SummaryProvider, useSummary } from './summary-context';
import { useTheme } from './theme-provider';

interface ShellProps {
  children: ReactNode;
  onChangeKey: () => void;
  onClearKey: () => void;
}

/**
 * The frame around every unlocked page: a quiet sidebar on wide screens and a bottom
 * tab bar on phones, both with the same places (Overview, Contacts, every project) and
 * the same "New todo" action. `onChangeKey` and `onClearKey` are owned by
 * access-gate.tsx, the only place that knows the gate state.
 */
export function AppShell(props: ShellProps) {
  return (
    <SummaryProvider>
      <Suspense fallback={null}>
        <Shell {...props} />
      </Suspense>
    </SummaryProvider>
  );
}

function Shell({ children, onChangeKey, onClearKey }: ShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [adding, setAdding] = useState(false);
  // On a project page the dialog starts on that project, which is what you almost always want
  const currentProjectId = pathname.startsWith('/project') ? searchParams.get('id') : null;

  return (
    <div className="min-h-screen md:flex">
      <Sidebar pathname={pathname} currentProjectId={currentProjectId} onAdd={() => setAdding(true)} onChangeKey={onChangeKey} onClearKey={onClearKey} />
      <div className="min-w-0 flex-1 pb-28 md:pb-0">{children}</div>
      <TabBar pathname={pathname} onAdd={() => setAdding(true)} onChangeKey={onChangeKey} onClearKey={onClearKey} />
      <QuickAddDialog open={adding} defaultProjectId={currentProjectId} onClose={() => setAdding(false)} />
    </div>
  );
}

function NavLink({ href, icon, active, children, trailing }: { href: string; icon: ReactNode; active: boolean; children: ReactNode; trailing?: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors ${
        active ? 'bg-muted font-medium text-foreground' : 'text-foreground/75 hover:bg-muted/60 hover:text-foreground'
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </Link>
  );
}

function Sidebar({
  pathname,
  currentProjectId,
  onAdd,
  onChangeKey,
  onClearKey,
}: {
  pathname: string;
  currentProjectId: string | null;
  onAdd: () => void;
  onChangeKey: () => void;
  onClearKey: () => void;
}) {
  const { projects } = useSummary();

  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-9 overflow-y-auto border-r border-border px-5 py-9 md:flex">
      <Link href="/" className="flex items-center gap-2.5 px-3 text-foreground">
        <Icon name="house" size={22} className="text-accent" />
        <span className="font-display text-[26px] font-semibold tracking-[0.01em]">Home</span>
      </Link>

      <div className="flex flex-col gap-0.5">
        <NavLink href="/" icon={<Icon name="overview" />} active={pathname === '/'}>
          Overview
        </NavLink>
        <NavLink href="/contacts/" icon={<Icon name="contact" />} active={pathname.startsWith('/contacts')}>
          Contacts
        </NavLink>
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Projects</p>
        {(projects ?? []).map((project) => (
          <NavLink
            key={project.id}
            href={`/project/?id=${encodeURIComponent(project.id)}`}
            icon={<KindIcon kind={project.kind} />}
            active={currentProjectId === project.id}
            trailing={project.open_count > 0 ? <span className="text-[13px] text-muted-foreground">{project.open_count}</span> : null}
          >
            {project.name}
          </NavLink>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-4">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          <Icon name="plus" size={16} strokeWidth={1.75} />
          New todo
        </button>
        <SettingsMenu placement="up" onChangeKey={onChangeKey} onClearKey={onClearKey} />
      </div>
    </nav>
  );
}

function TabBar({ pathname, onAdd, onChangeKey, onClearKey }: { pathname: string; onAdd: () => void; onChangeKey: () => void; onClearKey: () => void }) {
  const tab = (href: string, icon: IconName, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-11 w-16 flex-col items-center gap-1 text-[11px] ${active ? 'text-accent' : 'text-muted-foreground'}`}
    >
      <Icon name={icon} size={22} />
      {label}
    </Link>
  );

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-border bg-background/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md md:hidden"
    >
      {tab('/', 'overview', 'Overview', pathname === '/')}
      {tab('/contacts/', 'contact', 'Contacts', pathname.startsWith('/contacts'))}
      <button
        type="button"
        aria-label="New todo"
        onClick={onAdd}
        className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent text-background shadow-lg shadow-accent/20"
      >
        <Icon name="plus" size={22} strokeWidth={1.75} />
      </button>
      <ThemeTab />
      <SettingsMenu placement="up-end" onChangeKey={onChangeKey} onClearKey={onClearKey} compact />
    </nav>
  );
}

function ThemeTab() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" onClick={toggleTheme} className="flex min-h-11 w-16 flex-col items-center gap-1 text-[11px] text-muted-foreground">
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={22} />
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}

/**
 * Theme and the access key in one small menu. There are no accounts, so this stands in
 * for the account menu.
 */
function SettingsMenu({
  placement,
  compact = false,
  onChangeKey,
  onClearKey,
}: {
  placement: 'up' | 'up-end';
  compact?: boolean;
  onChangeKey: () => void;
  onClearKey: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const item = 'flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-foreground/85 hover:bg-muted hover:text-foreground';

  return (
    <div ref={ref} className="relative">
      {compact ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex min-h-11 w-16 flex-col items-center gap-1 text-[11px] text-muted-foreground">
          <Icon name="key" size={22} />
          Key
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button
            type="button"
            aria-label="Access key"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <Icon name="key" />
          </button>
        </div>
      )}
      {open ? (
        <div
          className={`absolute bottom-full z-30 mb-2 w-52 overflow-hidden rounded-2xl border border-border bg-card py-1.5 shadow-xl ${
            placement === 'up-end' ? 'right-0' : 'left-0'
          }`}
        >
          <button
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              onChangeKey();
            }}
          >
            <Icon name="key" size={16} />
            Change key
          </button>
          <button
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              onClearKey();
            }}
          >
            <Icon name="close" size={16} />
            Clear saved key
          </button>
        </div>
      ) : null}
    </div>
  );
}
