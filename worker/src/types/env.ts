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
	/**
	 * API base of the live.imnotbot notification service, such as
	 * https://live.imnotbot.com/api/v1, with no trailing slash. Non-secret; lives in
	 * wrangler.jsonc vars. Empty or unset turns reminder sync off.
	 */
	LIVE_NOTIFY_URL?: string;
	/**
	 * This app's write token for live.imnotbot, sent as a Bearer token. Secret; set with
	 * `wrangler secret put LIVE_NOTIFY_TOKEN`. Empty or unset turns reminder sync off.
	 */
	LIVE_NOTIFY_TOKEN?: string;
}
