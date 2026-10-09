import { describe, expect, it } from 'vitest';
import { addPeriods, nextDueDate, todayIn } from '../src/lib/repeat';

describe('addPeriods', () => {
	it('adds days and weeks across a month end', () => {
		expect(addPeriods('2026-01-30', 3, 'day')).toBe('2026-02-02');
		expect(addPeriods('2026-10-06', 2, 'week')).toBe('2026-10-20');
	});

	it('clamps a month step to the last day of a shorter month', () => {
		expect(addPeriods('2026-01-31', 1, 'month')).toBe('2026-02-28');
		expect(addPeriods('2028-01-31', 1, 'month')).toBe('2028-02-29');
		expect(addPeriods('2026-01-31', 2, 'month')).toBe('2026-03-31');
		expect(addPeriods('2026-11-15', 3, 'month')).toBe('2027-02-15');
	});
});

describe('nextDueDate', () => {
	it('fixed weekly keeps the weekday and lands after today', () => {
		// 2026-10-06 is a Tuesday; finished on Thursday 2026-10-08
		expect(nextDueDate({ mode: 'fixed', every: 1, unit: 'week' }, '2026-10-06', '2026-10-08')).toBe('2026-10-13');
	});

	it('fixed skips periods already in the past instead of making overdue copies', () => {
		expect(nextDueDate({ mode: 'fixed', every: 1, unit: 'week' }, '2026-09-01', '2026-10-08')).toBe('2026-10-13');
	});

	it('fixed finished early moves one period past the due date', () => {
		expect(nextDueDate({ mode: 'fixed', every: 1, unit: 'week' }, '2026-10-13', '2026-10-08')).toBe('2026-10-20');
	});

	it('fixed monthly keeps the day of month after a short month', () => {
		expect(nextDueDate({ mode: 'fixed', every: 1, unit: 'month' }, '2026-01-31', '2026-02-28')).toBe('2026-03-31');
	});

	it('after_done counts one period from today', () => {
		expect(nextDueDate({ mode: 'after_done', every: 90, unit: 'day' }, '2026-01-01', '2026-10-08')).toBe('2027-01-06');
		expect(nextDueDate({ mode: 'after_done', every: 3, unit: 'month' }, null, '2026-10-08')).toBe('2027-01-08');
	});
});

describe('todayIn', () => {
	it('uses the home time zone, not UTC', () => {
		// 02:30 UTC on Oct 9 is still the evening of Oct 8 in Indiana
		expect(todayIn('America/Indiana/Indianapolis', new Date('2026-10-09T02:30:00Z'))).toBe('2026-10-08');
		expect(todayIn('UTC', new Date('2026-10-09T02:30:00Z'))).toBe('2026-10-09');
	});
});
