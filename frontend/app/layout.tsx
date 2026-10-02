import type { Metadata } from 'next';
import { AccessGate } from '../components/access-gate';
import { ThemeProvider } from '../components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Home Todos',
  description: 'A small, self-hosted tracker for the work of running a home.',
  // A single-admin tool has no audience to reach. Keep it out of every index.
  // Removing this is a deliberate go-live step, not a cleanup.
  robots: { index: false, follow: false, nocache: true },
};

// Runs before paint to set the theme class, preventing a light/dark flash.
// First-visit follows the OS preference when one is available.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var saved=localStorage.getItem('theme');var dark=saved?saved==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',dark);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <AccessGate>{children}</AccessGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
