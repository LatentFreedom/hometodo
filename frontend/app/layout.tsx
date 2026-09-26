import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Home Todos',
  description: 'A small, self-hosted tracker for the work of running a home.',
  // A single-admin tool has no audience to reach. Keep it out of every index.
  // Removing this is a deliberate go-live step, not a cleanup.
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
