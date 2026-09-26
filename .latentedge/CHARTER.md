# CHARTER - Home Todos

## Project
- Name: Home Todos (`hometodo`)
- Lane: project (stage in `.latentedge/lifecycle.json`)
- Ownership: department agents only; no per-project persona.

## Non-Negotiables
1. Start from an explicit task source before coding.
2. Follow the stage-aware git flow declared in `.latentedge/lifecycle.json`.
3. Use project-local scripts and guardrails when they exist.
4. Commit and push before switching tools - git is the continuity record.
5. Runtime state and logs live under `.latentedge/workspace/`, never in the repo root.

## Project Rules
- This repository is PUBLIC. Real house data, contractor names, phone numbers, and
  addresses live only in D1. Anything committed here - fixtures, seeds, tests, docs -
  holds example data only.
- No organization-internal vocabulary in tracked files. Synced standards files under
  `.latentedge/` are gitignored for the same reason: they carry absolute home paths.
- Every project owns its own database. The D1 binding is `DB`, backed by `hometodo-db`.
- Table names are unprefixed: `projects`, `todos`, `contacts`, plus the auth tables.
- Single admin user. There is no signup route and none may be added.

## Required Runtime Order
1. Read `.latentedge/SKILL.md`.
2. Read this file.
3. Read `.latentedge/DECISIONS.md`.
4. Read `PRD.md`.
