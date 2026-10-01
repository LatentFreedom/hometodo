-- Auth moves from email-and-password accounts to one shared admin key held as a
-- Cloudflare secret (see .latentedge/DECISIONS.md, 2026-10-01). No account was ever
-- created in production, so dropping the auth tables loses nothing.
-- Children first: both token tables reference users.
DROP TABLE IF EXISTS auth_refresh_tokens;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS users;

-- One row per request that sent a wrong admin key. The gate counts rows per IP in a
-- ten-minute window to throttle guessing, and prunes rows older than a day.
-- The guessed value is never stored.
CREATE TABLE access_failures (
	id INTEGER PRIMARY KEY,
	ip TEXT NOT NULL,
	path TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_access_failures_ip_created ON access_failures (ip, created_at);
