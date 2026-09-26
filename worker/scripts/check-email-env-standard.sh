#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# The standard applies only to workers that send email. This worker does not depend on
# the email package, so there is no SENDER_EMAIL to check and the script exits clean.
# It stays in place so the shared CI workflow can run the same step in every project.
if ! grep -q '"@latentfreedom/latentedge-email-package"' package.json; then
	echo "Email package not used by this worker; email env standard check skipped."
	exit 0
fi

# SENDER_EMAIL is non-secret config and lives in wrangler.jsonc vars, not .dev.vars.
grep -q 'SENDER_EMAIL' src/types/env.ts || { echo "Missing SENDER_EMAIL in src/types/env.ts"; exit 1; }
grep -q '"SENDER_EMAIL"' wrangler.jsonc || { echo "Missing SENDER_EMAIL in wrangler.jsonc"; exit 1; }

echo "Email env var standard check passed."
