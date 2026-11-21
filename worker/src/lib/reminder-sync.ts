import type { TodoRow } from '../db/todos';
import type { Env } from '../types/env';

/**
 * The only code that talks to live.imnotbot, the portfolio's one notification path.
 * Each todo owns at most one reminder there, found by the key hometodo:todo:<id>, so
 * this app stores no reminder id. The contract is the "Notifications" section of
 * SPEC.md in the live.imnotbot repo.
 *
 * Only the title and a link leave this app; notes, cost, and contacts never do.
 */

// live.imnotbot refuses any other key, so a todo id that would break it is skipped
const KEY_PATTERN = /^[A-Za-z0-9:_.-]{1,200}$/;

// waitUntil already caps the task, but a hung call should not hold the isolate that long
const TIMEOUT_MS = 5_000;

export interface ReminderBody {
	note: string;
	remind_at: string;
	timed: boolean;
	link_url: string;
}

export type ReminderPlan = { kind: 'put'; body: ReminderBody } | { kind: 'done' };

// Only waitUntil is needed, and Hono's context type differs from the runtime global one
export interface WaitUntil {
	waitUntil(promise: Promise<unknown>): void;
}

/** A todo row, or the id of a todo that was just deleted. */
export type SyncTarget = TodoRow | { id: string; deleted: true };

export function reminderKey(todoId: string): string {
	return `hometodo:todo:${todoId}`;
}

function trimSlash(value: string): string {
	return value.replace(/\/+$/, '');
}

/**
 * What live.imnotbot should hold for a todo. An exact remind time wins; otherwise the
 * bare due date, which live.imnotbot fires that morning. A waiting todo still counts as
 * unfinished. Done, deleted, or a todo with neither value means no reminder.
 */
export function planReminder(target: SyncTarget, frontendUrl: string): ReminderPlan {
	if ('deleted' in target || target.deleted_at !== null || target.status === 'done') return { kind: 'done' };
	const link = `${trimSlash(frontendUrl)}/todo/?id=${target.id}`;
	if (target.remind_at) return { kind: 'put', body: { note: target.title, remind_at: target.remind_at, timed: true, link_url: link } };
	if (target.due_date) return { kind: 'put', body: { note: target.title, remind_at: target.due_date, timed: false, link_url: link } };
	return { kind: 'done' };
}

/** Sends one todo's reminder state. Never throws: a failure is logged and dropped. */
export async function syncReminder(env: Env, target: SyncTarget): Promise<void> {
	const base = env.LIVE_NOTIFY_URL?.trim();
	const token = env.LIVE_NOTIFY_TOKEN?.trim();
	// A copy with no reminder service configured works exactly as it did before
	if (!base || !token) return;

	const key = reminderKey(target.id);
	if (!KEY_PATTERN.test(key)) {
		console.error('[reminder-sync] skipped a todo whose id cannot form a reminder key', { todo_id: target.id });
		return;
	}

	const plan = planReminder(target, env.FRONTEND_URL);
	const url = `${trimSlash(base)}/reminders/by-key/${key}${plan.kind === 'done' ? '/done' : ''}`;
	const init: RequestInit = {
		method: plan.kind === 'put' ? 'PUT' : 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		signal: AbortSignal.timeout(TIMEOUT_MS),
	};
	if (plan.kind === 'put') init.body = JSON.stringify(plan.body);

	try {
		const response = await fetch(url, init);
		if (!response.ok) {
			console.error('[reminder-sync] live.imnotbot refused the call', { todo_id: target.id, action: plan.kind, status: response.status });
		}
	} catch (error) {
		console.error('[reminder-sync] live.imnotbot call failed', {
			todo_id: target.id,
			action: plan.kind,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Runs the sync after the response is sent, so a slow or failed call never delays or
 * fails the save. Targets run in order, so a finished todo is closed before its next
 * occurrence is armed.
 */
export function scheduleReminderSync(ctx: WaitUntil, env: Env, targets: ReadonlyArray<SyncTarget | null>): void {
	const present = targets.filter((target): target is SyncTarget => target !== null);
	if (present.length === 0 || !env.LIVE_NOTIFY_URL?.trim() || !env.LIVE_NOTIFY_TOKEN?.trim()) return;
	ctx.waitUntil(
		(async () => {
			for (const target of present) await syncReminder(env, target);
		})(),
	);
}
