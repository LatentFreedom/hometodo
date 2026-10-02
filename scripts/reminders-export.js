#!/usr/bin/env node
// One-time export of every Apple Reminders list into reminders.json.
//
// Run on the Mac that holds the lists:
//   node scripts/reminders-export.js
//
// macOS prompts for an Automation grant the first time this runs - approve
// "Terminal" (or whichever app ran the command) for Reminders in
// System Settings > Privacy & Security > Automation. See README.md.
//
// Reminders.app has no JSON export, so this shells out to `osascript -l
// JavaScript` (JXA), the one way to read the native reminder store without
// a private API. The JXA source below is a plain string: there is no
// Reminders.app in this sandbox to iterate against directly from Node.
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const JXA_SOURCE = `
function run() {
	const Reminders = Application('Reminders');
	Reminders.includeStandardAdditions = true;
	const output = [];
	const lists = Reminders.lists();
	for (let i = 0; i < lists.length; i++) {
		const list = lists[i];
		const listName = list.name();
		const reminders = list.reminders();
		for (let j = 0; j < reminders.length; j++) {
			const reminder = reminders[j];
			let dueDate = null;
			try {
				const raw = reminder.dueDate();
				if (raw) dueDate = raw.toISOString();
			} catch (e) {}
			let completionDate = null;
			try {
				const raw = reminder.completionDate();
				if (raw) completionDate = raw.toISOString();
			} catch (e) {}
			output.push({
				list: listName,
				id: reminder.id(),
				title: reminder.name(),
				notes: reminder.body() || null,
				dueDate: dueDate,
				completed: reminder.completed(),
				completionDate: completionDate,
			});
		}
	}
	return JSON.stringify(output);
}
`;

function exportReminders() {
	const scriptPath = path.join(os.tmpdir(), `hometodo-reminders-export-${process.pid}.js`);
	fs.writeFileSync(scriptPath, JXA_SOURCE);
	try {
		const raw = execFileSync('osascript', ['-l', 'JavaScript', scriptPath], {
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
		});
		return JSON.parse(raw);
	} finally {
		fs.rmSync(scriptPath, { force: true });
	}
}

function main() {
	let reminders;
	try {
		reminders = exportReminders();
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
