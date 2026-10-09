import { badRequest } from './http';

/**
 * Input validation for the JSON API. The table CHECK constraints are the last line of
 * defence, but a constraint failure surfaces as a 500; every rule a caller can break
 * is checked here first so the caller gets a 400 that names the field.
 */

export const PROJECT_KINDS = ['house', 'car', 'family', 'admin', 'networking', 'other'] as const;
export const TODO_STATUSES = ['open', 'waiting', 'done'] as const;
export const TODO_SOURCES = ['manual', 'reminders'] as const;
export const REPEAT_MODES = ['fixed', 'after_done'] as const;
export const REPEAT_UNITS = ['day', 'week', 'month'] as const;

export type ProjectKind = (typeof PROJECT_KINDS)[number];
export type TodoStatus = (typeof TODO_STATUSES)[number];
export type TodoSource = (typeof TODO_SOURCES)[number];
export type RepeatMode = (typeof REPEAT_MODES)[number];
export type RepeatUnit = (typeof REPEAT_UNITS)[number];

export type Field =
	| { type: 'text'; max: number; required?: boolean }
	| { type: 'enum'; values: readonly string[]; nullable?: boolean }
	| { type: 'date' }
	| { type: 'cents' }
	| { type: 'count'; max: number }
	| { type: 'email' }
	| { type: 'ref' }
	| { type: 'boolean' };

export type Value = string | number | boolean | null;

const MAX_EMAIL_LENGTH = 254;
const MAX_REF_LENGTH = 128;

/**
 * Checks a body against a field map and returns only the fields it names, normalised.
 * Unknown keys are refused rather than ignored, so a typo such as `stauts` is a 400
 * instead of a silent no-op. On create every required field must be present; on
 * update at least one field must be.
 */
export function parseInput(
	body: Record<string, unknown>,
	fields: Record<string, Field>,
	mode: 'create' | 'update',
): Record<string, Value> {
	for (const key of Object.keys(body)) {
		if (!Object.hasOwn(fields, key)) throw badRequest(`Unknown field: ${key}`, key);
	}

	const output: Record<string, Value> = {};
	for (const [key, field] of Object.entries(fields)) {
		if (!Object.hasOwn(body, key)) {
			if (mode === 'create' && field.type === 'text' && field.required) {
				throw badRequest(`${key} is required`, key);
			}
			continue;
		}
		output[key] = parseValue(key, body[key], field);
	}

	if (mode === 'update' && Object.keys(output).length === 0) {
		throw badRequest('Send at least one field to change');
	}
	return output;
}

function parseValue(key: string, raw: unknown, field: Field): Value {
	switch (field.type) {
		case 'text': {
			if (raw === null || raw === undefined) {
				if (field.required) throw badRequest(`${key} is required`, key);
				return null;
			}
			if (typeof raw !== 'string') throw badRequest(`${key} must be a string`, key);
			const text = raw.trim();
			if (text === '') {
				if (field.required) throw badRequest(`${key} must not be empty`, key);
				return null;
			}
			if (text.length > field.max) throw badRequest(`${key} must be at most ${field.max} characters`, key);
			return text;
		}
		case 'enum': {
			// Most enum columns are NOT NULL, so null resets only one that says it may
			if (raw === null && field.nullable) return null;
			if (typeof raw !== 'string' || !field.values.includes(raw)) {
				throw badRequest(`${key} must be one of: ${field.values.join(', ')}`, key);
			}
			return raw;
		}
		case 'date': {
			if (raw === null) return null;
			if (typeof raw !== 'string' || !isCalendarDate(raw)) {
				throw badRequest(`${key} must be a date in YYYY-MM-DD form`, key);
			}
			return raw;
		}
		case 'cents': {
			if (raw === null) return null;
			if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) {
				throw badRequest(`${key} must be a whole, non-negative number of cents`, key);
			}
			return raw;
		}
		case 'count': {
			if (raw === null) return null;
			if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 1 || raw > field.max) {
				throw badRequest(`${key} must be a whole number from 1 to ${field.max}`, key);
			}
			return raw;
		}
		case 'email': {
			if (raw === null) return null;
			if (typeof raw !== 'string') throw badRequest(`${key} must be a string`, key);
			const email = raw.trim();
			if (email === '') return null;
			if (email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
				throw badRequest(`${key} must be an email address`, key);
			}
			return email;
		}
		case 'ref': {
			if (raw === null) return null;
			if (typeof raw !== 'string' || raw.trim() === '' || raw.length > MAX_REF_LENGTH) {
				throw badRequest(`${key} must be an id string`, key);
			}
			return raw.trim();
		}
		case 'boolean': {
			if (typeof raw !== 'boolean') throw badRequest(`${key} must be true or false`, key);
			return raw;
		}
	}
}

/** True only for a real day: 2026-02-30 matches the pattern but is refused. */
export function isCalendarDate(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;
	const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** A `true`/`false` query flag; absent means false, anything else is a 400. */
export function parseFlag(name: string, raw: string | undefined): boolean {
	if (raw === undefined) return false;
	if (raw === 'true') return true;
	if (raw === 'false') return false;
	throw badRequest(`${name} must be true or false`, name);
}

/** An optional enum query value; absent means no filter. */
export function parseEnumQuery<T extends string>(name: string, raw: string | undefined, values: readonly T[]): T | null {
	if (raw === undefined) return null;
	if (!(values as readonly string[]).includes(raw)) {
		throw badRequest(`${name} must be one of: ${values.join(', ')}`, name);
	}
	return raw as T;
}
