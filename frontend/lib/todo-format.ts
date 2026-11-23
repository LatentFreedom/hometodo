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

const SHORT_DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const DAY_MS = 24 * 60 * 60 * 1000;

/** "Today", "Tomorrow", "Sat" within the week, "Nov 28" further out, "3 days late" when past. */
export function relativeDue(day: string, today: string = todayLocal()): string {
  const [year, month, date] = day.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  if (!year || !month || !date || !ty || !tm || !td) return day;
  const target = new Date(year, month - 1, date);
  const days = Math.round((target.getTime() - new Date(ty, tm - 1, td).getTime()) / DAY_MS);
  if (days < 0) return days === -1 ? '1 day late' : `${-days} days late`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return WEEKDAY.format(target);
  return SHORT_DAY.format(target);
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

/** A stored "HH:MM" due time in the browser's own clock style, such as 2:30 PM. */
export function formatClock(clock: string): string {
  const [hours, minutes] = clock.split(':').map(Number);
  if (hours === undefined || minutes === undefined || Number.isNaN(hours) || Number.isNaN(minutes)) return clock;
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
