// Runs `npm audit` at moderate level, but tolerates a short list of advisories
// that have no patched release and only reach build-time tooling. npm audit has
// no ignore flag, so without this one unfixable advisory blocks every PR.
import { spawnSync } from "node:child_process";

const LEVELS = ["info", "low", "moderate", "high", "critical"];
const MIN_LEVEL = "moderate";

// Each entry needs a reason and a date to revisit. Remove an entry as soon as a
// patched version ships; the script prints a reminder when it no longer matches.
const ALLOWED = {
  // braces <=3.0.3 stack-exhaustion DoS; 3.0.3 is the newest release, so no fix
  // exists. Reached only via tailwindcss 3 (chokidar, fast-glob) and
  // eslint-config-next (fast-glob 3.3.1, pinned in every version through 16.x),
  // which run on our own trusted globs at build and lint time and never ship to
  // the browser. Tailwind 4 would not clear it: eslint-config-next still pulls it.
  // Added 2026-10-04, revisit when braces publishes a fix.
  "GHSA-vfj7-8cjw-p6xm": "braces stack exhaustion, build-time only, no patched release",
};

const run = spawnSync("npm", ["audit", "--json"], { encoding: "utf8" });
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error("npm audit did not return JSON:\n" + run.stdout + run.stderr);
  process.exit(1);
}
if (report.error) {
  console.error("npm audit failed:", report.error.summary ?? report.error);
  process.exit(1);
}

// Object entries in `via` are the root advisories; string entries only point at
// another vulnerable package, whose own advisories are listed under its key.
const advisories = new Map();
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via === "object") advisories.set(via.url, via);
  }
}

const idOf = (url) => url.split("/").pop();
const blocking = [];
const allowedSeen = new Set();
for (const adv of advisories.values()) {
  const id = idOf(adv.url);
  if (LEVELS.indexOf(adv.severity) < LEVELS.indexOf(MIN_LEVEL)) continue;
  if (ALLOWED[id]) {
    allowedSeen.add(id);
    continue;
  }
  blocking.push(adv);
}

for (const id of allowedSeen) {
  console.log(`allowed ${id}: ${ALLOWED[id]}`);
}
for (const id of Object.keys(ALLOWED)) {
  if (!allowedSeen.has(id)) {
    console.log(`note: ${id} no longer appears in npm audit; remove it from scripts/audit.mjs`);
  }
}

if (blocking.length > 0) {
  console.error(`\n${blocking.length} advisory(ies) at ${MIN_LEVEL} or above:`);
  for (const adv of blocking) {
    console.error(`  ${adv.severity.padEnd(8)} ${adv.name} ${adv.range}  ${adv.title}  ${adv.url}`);
  }
  process.exit(1);
}
console.log(`npm audit: no unallowed advisories at ${MIN_LEVEL} or above`);
