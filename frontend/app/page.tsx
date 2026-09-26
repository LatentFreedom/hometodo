import Link from 'next/link';

// Placeholder home page. The project cards, todo list, and contacts pages are a
// separate piece of work; this release ships the schema, the API health probe, and
// admin sign-in only.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-semibold">Home Todos</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        A small, self-hosted tracker for the work of running a home: contractor jobs,
        house repairs, life admin, and the people you call about each.
      </p>
      <p>
        <Link className="underline underline-offset-4" href="/sign-in/">
          Sign in
        </Link>
      </p>
    </main>
  );
}
