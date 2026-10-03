#!/usr/bin/env node
// One-time export of every Apple Reminders list into reminders.json.
//
// Run on the Mac that holds the lists:
//   node scripts/reminders-export.js
//   node scripts/reminders-export.js --open-only   # skip completed reminders
//
// macOS prompts for an Automation grant the first time this runs - approve
// "Terminal" (or whichever app ran the command) for Reminders in
// System Settings > Privacy & Security > Automation. See README.md.
//
// Reminders.app has no JSON export, so this shells out to `osascript -l
// JavaScript` (JXA), the one way to read the native reminder store without
// a private API. The JXA source below is a plain string: there is no
// Reminders.app in this sandbox to iterate against directly from Node.
//
// Speed: asking JXA for one property of one reminder at a time is one Apple
// Event per field per reminder, which does not scale past a few hundred
// items. Asking a list for a property across every reminder at once (for
// example `list.reminders.completed()`) is a single Apple Event that
// returns the whole array, so this reads each field in one bulk call per
// list instead of looping reminder-by-reminder.
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const JXA_SOURCE = `
function run(argv) {
	const openOnly = argv.indexOf('--open-only') !== -1;
	const Reminders = Application('Reminders');
	Reminders.includeStandardAdditions = true;
	const output = [];
	const lists = Reminders.lists();
	for (let i = 0; i < lists.length; i++) {
		const list = lists[i];
		const listName = list.name();
		// Always read the whole list in bulk, even for --open-only: filtering
		// with Reminders.app's own \`whose()\` issues one Apple Event per
		// candidate item under the hood, which is the exact slowness this
		// export is meant to avoid. Filtering the already-bulk-fetched arrays
		// below costs nothing extra.
		const scope = list.reminders;
		const count = scope.length;
		const ids = scope.id();
		const names = scope.name();
		const bodies = scope.body();
		const completedFlags = scope.completed();
		let dueDates;
		try {
			dueDates = scope.dueDate();
		} catch (e) {
			dueDates = new Array(count).fill(null);
		}
		let completionDates;
		try {
			completionDates = scope.completionDate();
		} catch (e) {
			completionDates = new Array(count).fill(null);
		}
		for (let j = 0; j < count; j++) {
			const completed = completedFlags[j];
			if (openOnly && completed) continue;
			let dueDate = null;
			try {
				const raw = dueDates[j];
				if (raw) dueDate = raw.toISOString();
			} catch (e) {}
			let completionDate = null;
			try {
				const raw = completionDates[j];
				if (raw) completionDate = raw.toISOString();
			} catch (e) {}
			output.push({
				list: listName,
				id: ids[j],
				title: names[j],
				notes: bodies[j] || null,
				dueDate: dueDate,
				completed: completed,
				completionDate: completionDate,
			});
		}
	}
	return JSON.stringify(output);
}
`;

function exportReminders(openOnly) {
	const scriptPath = path.join(os.tmpdir(), `hometodo-reminders-export-${process.pid}.js`);
	fs.writeFileSync(scriptPath, JXA_SOURCE);
	try {
		const args = ['-l', 'JavaScript', scriptPath];
		if (openOnly) args.push('--open-only');
		const raw = execFileSync('osascript', args, {
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
		});
		return JSON.parse(raw);
	} finally {
		fs.rmSync(scriptPath, { force: true });
	}
}

function main() {
	const openOnly = process.argv.includes('--open-only');

	let reminders;
	try {
		reminders = exportReminders(openOnly);
	} catch (error) {
		console.error('Could not read Reminders.app.');
		console.error(
			'Grant Automation access: System Settings > Privacy & Security > Automation, ' +
				'then allow this terminal app to control Reminders, and run this again.',
		);
		console.error(String((error && error.message) || error));
		process.exitCode = 1;
		return;
	}

	const outPath = path.join(process.cwd(), 'reminders.json');
	fs.writeFileSync(outPath, JSON.stringify(reminders, null, 2));
	console.log(`Wrote ${reminders.length} reminder(s) across ${new Set(reminders.map((r) => r.list)).size} list(s) to ${outPath}`);
}

main();
