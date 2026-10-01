# Decisions

This file captures decisions that would be costly to re-litigate and cannot be derived from code, git history, PRD.md, or CHARTER.md.

**What belongs here:** explicit choices made under constraint — legal, business, stakeholder, or technical dead-ends — where the *why* is not obvious from the code and losing it would cause a future session to repeat the mistake or undo the decision.

**What does not belong here:** facts derivable from code, package versions, file paths, architecture patterns, anything already in PRD.md or CHARTER.md, or anything in git commit messages.

If you're unsure whether something belongs here, ask: "Would a future session that reads the code and git log still not know this?" If no — skip it.

---

## Decisions

<!-- Format: [YYYY-MM-DD] <decision> — <why> -->

- [2026-10-01] Auth is one shared admin key held as the `ADMIN_API_KEY` Worker secret, not email-and-password accounts. Why: the app has exactly one owner, so a users table, sessions, refresh tokens, and a bootstrap route were all cost and no benefit. The key never expires; revoking every device means setting a new secret. It also removed the private auth package dependency. The first release shipped accounts for one day; migration 0003 drops those tables (no account was ever created in production). Do not reintroduce accounts or a login route.
- [2026-10-01] Wrong-key throttle: 20 failures per IP in ten minutes, then 429. Why: a single long-lived key invites guessing. A correct key is checked before the throttle so the owner is never locked out, and guesses are never stored.
