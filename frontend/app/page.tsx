// Placeholder home page, shown only after the admin key unlocks the site. The project
// cards, todo list, and contacts pages are a separate piece of work.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-xl flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-semibold">Home Todos</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        A small, self-hosted tracker for the work of running a home: contractor jobs,
        house repairs, life admin, and the people you call about each.
      </p>
      <p className="text-sm text-neutral-500">Unlocked. There is nothing behind this page yet.</p>
    </main>
  );
}
