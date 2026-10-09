export interface Env {
	DB: D1Database;
	/** The one shared admin key. Secret; set with `wrangler secret put ADMIN_API_KEY`. */
	ADMIN_API_KEY: string;
	/**
	 * Bearer token that opens GET /api/v1/summary only. Secret; set with
	 * `wrangler secret put READ_TOKEN`. Unset means the summary needs the admin key.
	 */
	READ_TOKEN: string;
	/** Comma-separated CORS allow-list. Non-secret; lives in wrangler.jsonc vars. */
	ALLOWED_ORIGINS: string;
	/** Public base URL of the site this worker serves. Non-secret. */
	FRONTEND_URL: string;
	/** IANA zone that decides "today" for repeating todos. Non-secret; lives in wrangler.jsonc vars. */
	HOME_TZ: string;
}
