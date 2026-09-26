export interface Env {
	DB: D1Database;
	/** Signs and verifies session tokens. Secret; set with `wrangler secret put`. */
	JWT_SECRET: string;
	/** Authorises the one-time admin bootstrap. Secret; see README deploy step 4. */
	ADMIN_SETUP_KEY: string;
	/** Comma-separated CORS allow-list. Non-secret; lives in wrangler.jsonc vars. */
	ALLOWED_ORIGINS: string;
	/** Public base URL of the site this worker serves. Non-secret. */
	FRONTEND_URL: string;
}
