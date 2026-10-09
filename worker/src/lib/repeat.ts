import type { RepeatMode, RepeatUnit } from './validate';

/**
 * Date maths for repeating todos. Every date is a bare YYYY-MM-DD calendar day, handled
 * in UTC so a day is always 24 hours; the only time zone that matters is the one that
 * decides what "today" is, and todayIn() takes it as an argument.
 */

export interface RepeatRule {
	mode: RepeatMode;
	every: number;
	unit: RepeatUnit;
}

// A daily rule anchored years back needs a few thousand steps; this bound only stops a bad row looping forever
const MAX_STEPS = 100_000;

function parseDay(day: string): { y: number; m: number; d: number } {
	const [y, m, d] = day.split('-').map(Number);
	return { y, m, d };
}

function formatDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** Adds n days, weeks, or months. A month step that overshoots a short month lands on its last day. */
export function addPeriods(day: string, n: number, unit: RepeatUnit): string {
	const { y, m, d } = parseDay(day);
	if (unit === 'day' || unit === 'week') {
		return formatDay(new Date(Date.UTC(y, m - 1, d + n * (unit === 'week' ? 7 : 1))));
	}
	const lastDay = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
	return formatDay(new Date(Date.UTC(y, m - 1 + n, Math.min(d, lastDay))));
}

/**
 * fixed: the anchor plus whole periods, first one after today, so a late finish skips
 * missed dates. Steps are counted from the anchor, not chained, so a monthly rule on the
 * 31st returns to the 31st after February.
 * after_done: one period after today.
 */
export function nextDueDate(rule: RepeatRule, anchor: string | null, today: string): string {
	if (rule.mode === 'after_done' || anchor === null) return addPeriods(today, rule.every, rule.unit);
	for (let step = 1; step <= MAX_STEPS; step++) {
		const candidate = addPeriods(anchor, step * rule.every, rule.unit);
		if (candidate > today) return candidate;
	}
	return addPeriods(today, rule.every, rule.unit);
}

/** The calendar day it is right now in a time zone; en-CA formats as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
