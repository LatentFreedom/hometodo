import { applyD1Migrations, env } from 'cloudflare:test';

// Runs once per test worker, before any spec. The migrations come from the real
// migrations/ directory via vitest.config.mts.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
