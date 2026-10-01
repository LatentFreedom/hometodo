import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

// Read the real migration files and hand them to the test environment, so the suite
// exercises the SQL that actually ships. A hand-written CREATE TABLE inside a test
// helper drifts from migrations/ silently, and the first sign of the drift is a
// production query that fails against a schema every test said was fine.
const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));

export default defineWorkersConfig({
	test: {
		setupFiles: ['./test/apply-migrations.ts'],
		poolOptions: {
			workers: {
				// Tests resolve every binding against local Miniflare, never live data.
				// @cloudflare/vitest-pool-workers defaults remoteBindings to true, so on a
				// machine holding valid wrangler credentials a plain `vitest run` opens a real
				// Cloudflare remote proxy session before it collects a single spec, and when
				// that call fails the whole suite dies with an error naming no test.
				remoteBindings: false,
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					bindings: {
						TEST_MIGRATIONS: migrations,
						// Test-only secret. Without it the suite reads a developer's untracked
						// .dev.vars and fails anywhere that file is absent, such as CI.
						ADMIN_API_KEY: 'test-admin-key',
						READ_TOKEN: 'test-read-token',
						// wrangler.jsonc vars are the deployed values; this pool reads
						// wrangler.jsonc directly, not .dev.vars, so tests need their own
						// localhost overrides to exercise real local CORS behaviour.
						FRONTEND_URL: 'http://localhost:3000',
						ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
					},
				},
			},
		},
	},
});
