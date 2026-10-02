import { ProjectClient } from './project-client';

// One static page serves every project; ProjectClient reads ?id= from the URL. A path
// segment per project would need a build-time list of ids, which only the owner's
// database knows.
export default function ProjectPage() {
  return <ProjectClient />;
}
