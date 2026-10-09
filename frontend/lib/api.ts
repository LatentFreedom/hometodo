/**
 * Base URL of the Cloudflare Worker that serves the API.
 *
 * Inlined at build time from NEXT_PUBLIC_API_URL. This is a static export, so there is
 * no server to read the value at run time: a wrong value here ships to the browser and
 * every request fails against it. Empty means same origin, which is how production runs.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

/** The one browser slot for the admin key. */
export const ADMIN_KEY_STORAGE = 'hometodo_admin_key';
const ADMIN_KEY_HEADER = 'X-Admin-API-Key';

// Storage can throw in private windows or with blocked site data; the gate then just
// asks for the key each visit instead of breaking.
export function readSavedKey(): string {
  try {
    return window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function saveKey(key: string): void {
  try {
    window.localStorage.setItem(ADMIN_KEY_STORAGE, key);
  } catch {
    // Not persisted; the key still works for this page load.
  }
}

export function clearSavedKey(): void {
  try {
    window.localStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    // Nothing saved to clear.
  }
}

/** Fetch an API path with the saved admin key attached. */
export function apiFetch(path: string, init: RequestInit = {}, key: string = readSavedKey()): Promise<Response> {
  const headers = new Headers(init.headers);
  if (key) headers.set(ADMIN_KEY_HEADER, key);
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

export type KeyCheck = 'ok' | 'rejected' | 'throttled' | 'unreachable';

/**
 * Asks the worker whether a key is valid. Only 401 and 403 mean "wrong key"; a 5xx or
 * a network error says nothing about the key, so the caller must not discard it.
 */
export async function verifyKey(key: string): Promise<KeyCheck> {
  try {
    const response = await apiFetch('/api/v1/access', {}, key);
    if (response.ok) return 'ok';
    if (response.status === 401 || response.status === 403) return 'rejected';
    if (response.status === 429) return 'throttled';
    return 'unreachable';
  } catch {
    return 'unreachable';
  }
}

// --- Data model types, mirroring the worker's rows (see worker/src/db/*.ts). ---

export type ProjectKind = 'house' | 'car' | 'family' | 'admin' | 'networking' | 'other';
export type TodoStatus = 'open' | 'waiting' | 'done';

export interface Project {
  id: string;
  name: string;
  kind: ProjectKind;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RepeatMode = 'fixed' | 'after_done';
export type RepeatUnit = 'day' | 'week' | 'month';

export interface Todo {
  id: string;
  project_id: string;
  title: string;
  notes: string | null;
  status: TodoStatus;
  due_date: string | null;
  cost_cents: number | null;
  contact_id: string | null;
  source: 'manual' | 'reminders';
  external_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  repeat_mode: RepeatMode | null;
  repeat_every: number | null;
  repeat_unit: RepeatUnit | null;
  recurs_from_id: string | null;
}

/** POST and PATCH answer with the todo and, when finishing a repeating one, the occurrence it made. */
export interface TodoReply {
  todo: Todo;
  next_todo: Todo | null;
}

export interface Contact {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SummaryTodo {
  id: string;
  title: string;
  status: TodoStatus;
  due_date: string | null;
}

export interface SummaryProject {
  id: string;
  name: string;
  kind: ProjectKind;
  open_count: number;
  waiting_count: number;
  done_count: number;
  soonest_due: SummaryTodo[];
}

/** An API call that did not come back ok, with the worker's own error message when it sent one. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number = 0,
  ) {
    super(message);
  }
}

/** Parses the worker's `{ error, message }` envelope; falls back to the status text. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (typeof body.message === 'string' && body.message) return body.message;
  } catch {
    // Body was not JSON; fall through to the status line below.
  }
  return `Request failed: ${response.status} ${response.statusText}`;
}

/** JSON request/response helper shared by every data call below. */
async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await apiFetch(path, { ...init, headers });
  if (!response.ok) throw new ApiError(await readErrorMessage(response), response.status);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function fetchSummary(): Promise<{ projects: SummaryProject[] }> {
  return apiJson('/api/v1/summary');
}

export function fetchProjects(): Promise<{ projects: Project[] }> {
  return apiJson('/api/v1/projects');
}

export function fetchProject(id: string): Promise<{ project: Project }> {
  return apiJson(`/api/v1/projects/${encodeURIComponent(id)}`);
}

export function createProject(input: { name: string; kind: ProjectKind }): Promise<{ project: Project }> {
  return apiJson('/api/v1/projects', { method: 'POST', body: JSON.stringify(input) });
}

export function fetchTodos(projectId: string): Promise<{ todos: Todo[]; next_cursor: string | null }> {
  const query = new URLSearchParams({ project_id: projectId, limit: '200' });
  return apiJson(`/api/v1/todos?${query.toString()}`);
}

export interface TodoInput {
  project_id: string;
  title: string;
  due_date?: string | null;
  contact_id?: string | null;
  status?: TodoStatus;
}

export function createTodo(input: TodoInput): Promise<TodoReply> {
  return apiJson('/api/v1/todos', { method: 'POST', body: JSON.stringify(input) });
}

export type TodoPatch = Partial<
  Pick<
    Todo,
    'title' | 'notes' | 'status' | 'due_date' | 'cost_cents' | 'contact_id' | 'project_id' | 'repeat_mode' | 'repeat_every' | 'repeat_unit'
  >
>;

export function fetchTodo(id: string): Promise<{ todo: Todo }> {
  return apiJson(`/api/v1/todos/${encodeURIComponent(id)}`);
}

export function deleteTodo(id: string): Promise<void> {
  return apiJson(`/api/v1/todos/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function updateTodo(id: string, changes: TodoPatch): Promise<TodoReply> {
  return apiJson(`/api/v1/todos/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) });
}

export function fetchContacts(): Promise<{ contacts: Contact[] }> {
  return apiJson('/api/v1/contacts');
}

export interface ContactInput {
  name: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export function createContact(input: ContactInput): Promise<{ contact: Contact }> {
  return apiJson('/api/v1/contacts', { method: 'POST', body: JSON.stringify(input) });
}

export function updateContact(id: string, changes: Partial<ContactInput>): Promise<{ contact: Contact }> {
  return apiJson(`/api/v1/contacts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) });
}
