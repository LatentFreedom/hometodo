import type { Todo } from './api';

/** Today as YYYY-MM-DD in the browser's own time zone, the same shape as due_date. */
export function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Past its due date and not finished. A todo due today is not overdue yet. */
export function isOverdue(todo: Pick<Todo, 'due_date' | 'status'>, today: string = todayLocal()): boolean {
  return todo.status !== 'done' && todo.due_date !== null && todo.due_date < today;
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** "Oct 2, 2026" for a YYYY-MM-DD date, read as a calendar day (no time-zone shift). */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return day;
  return DATE_FORMAT.format(new Date(year, month - 1, date));
}

const UNIT_NAMES = { day: ['day', 'days'], week: ['week', 'weeks'], month: ['month', 'months'] } as const;

/** "Every week, on a schedule" or "Every 90 days after done"; null when the todo does not repeat. */
export function describeRepeat(todo: Pick<Todo, 'repeat_mode' | 'repeat_every' | 'repeat_unit'>): string | null {
  if (!todo.repeat_mode || !todo.repeat_every || !todo.repeat_unit) return null;
  const [one, many] = UNIT_NAMES[todo.repeat_unit];
  const period = todo.repeat_every === 1 ? `Every ${one}` : `Every ${todo.repeat_every} ${many}`;
  return todo.repeat_mode === 'fixed' ? `${period}, on a schedule` : `${period} after done`;
}

/** The worker stores SQLite timestamps in UTC without a zone marker. */
export function formatTimestamp(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

const CURRENCY = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

export function formatCost(cents: number | null): string | null {
  return cents === null ? null : CURRENCY.format(cents / 100);
}

/** Dollars typed by a person to whole cents; null for blank, undefined for nonsense. */
export function parseDollars(input: string): number | null | undefined {
  const trimmed = input.trim().replace(/^\$/, '').replace(/,/g, '');
  if (trimmed === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return undefined;
  return Math.round(Number(trimmed) * 100);
}

/** Notes collapsed to one paragraph for a list preview; the full text stays on the todo view. */
export function notesPreview(notes: string | null): string | null {
  if (!notes) return null;
  const flat = notes.replace(/\s+/g, ' ').trim();
  return flat === '' ? null : flat;
}
