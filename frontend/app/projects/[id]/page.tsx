import { ProjectClient } from './project-client';

// Project ids are created at runtime in the owner's own D1 database, so they cannot
// be enumerated at build time the way the rest of this static export is. This route
// pre-renders one placeholder shell; public/_redirects rewrites every real
// /projects/<id>/ request to that same shell (status 200, not a redirect), and
// ProjectClient reads the real id back out of the browser's URL on mount.
export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function ProjectPage() {
  return <ProjectClient />;
}
