import { Suspense } from 'react';
import { TodoClient } from './todo-client';

// One static page serves every todo; TodoClient reads ?id= from the URL, the same way
// the project page does, because a static export cannot list ids at build time.
export default function TodoPage() {
  // useSearchParams needs a Suspense boundary in a static export
  return (
    <Suspense fallback={null}>
      <TodoClient />
    </Suspense>
  );
}
