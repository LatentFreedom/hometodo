'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from './theme-toggle';

/**
 * The one header for every unlocked page: site name, the Contacts link, the theme
 * toggle, and the Key menu (there are no accounts, so this stands in for the
 * account menu). `onChangeKey` and `onClearKey` are owned by access-gate.tsx, the
 * only place that knows the gate state.
 */
export function SiteHeader({ onChangeKey, onClearKey }: { onChangeKey: () => void; onClearKey: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
      <nav className="flex items-center gap-4">
        <Link href="/" className="text-sm font-semibold">
          Home Todos
        </Link>
        <Link href="/contacts/" className="text-sm text-muted-foreground hover:text-foreground">
          Contacts
        </Link>
      </nav>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <div className="relative">
          <button
            type="button"
            className="rounded border border-border px-3 py-1 text-sm"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            Key
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-10 mt-2 flex w-44 flex-col rounded border border-border bg-card py-1 text-sm shadow">
              <button
                type="button"
                className="px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  setMenuOpen(false);
                  onChangeKey();
                }}
              >
                Change key
              </button>
              <button
                type="button"
                className="px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  setMenuOpen(false);
                  onClearKey();
                }}
              >
                Clear saved key
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
