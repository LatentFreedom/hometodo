export interface Env {
	DB: D1Database;
	/** The one shared admin key. Secret; set with `wrangler secret put ADMIN_API_KEY`. */
	ADMIN_API_KEY: string;
	/** Comma-separated CORS allow-list. Non-secret; lives in wrangler.jsonc vars. */
	ALLOWED_ORIGINS: string;
	/** Public base URL of the site this worker serves. Non-secret. */
	FRONTEND_URL: string;
}
