# Home Todos

A small, self-hosted tracker for the work of running a home: contractor jobs, house
repairs, car service, life admin, and the people you call about each.

It holds three kinds of record.

- **Projects** - an area of life that collects work (`house`, `car`, `family`, `admin`, `networking`, `other`).
- **Todos** - one unit of work in a project, with a status of `open`, `waiting`, or `done`, plus an optional due date, cost, and responsible contact.
- **Contacts** - the roofer, the mechanic, the county office.

`waiting` is the status that makes this useful. Most household work is blocked on
somebody else, and a tracker that only has open and done cannot tell "I have not
started" from "I am waiting on a quote".

One person owns an installation. There is no signup, no sharing, and no second user.

## Status

This release ships the database schema, admin authentication, and a sign-in page.
There is no dashboard yet: the API serves a health probe and the auth routes only.

## Your data is yours

Every record lives in **your** Cloudflare D1 database. Nothing in this repository -
no fixture, no seed, no test - holds a real name, address, phone number, or price,
and nothing is sent anywhere else.

## Stack

| Piece | Technology |
|---|---|
| Web pages | Next.js static export on Cloudflare Pages |
| API | Cloudflare Worker (Hono) |
| Database | Cloudflare D1 (SQLite) |
| Auth | `@latentfreedom/latentedge-auth-package`, single admin account |

You need a Cloudflare account (the free plan is enough), Node.js 22 or later, and
`npx wrangler login` already done.

## Deploy it in ten minutes

Four steps. Run them in order: the database has to exist before the code that reads it.

### 1. Create the database

```bash
git clone https://github.com/LatentFreedom/hometodo.git
cd hometodo
npx wrangler d1 create hometodo-db
```

That prints a `database_id`. Open `worker/wrangler.jsonc` and paste it over
`REPLACE_ME_RUN_WRANGLER_D1_CREATE`. While you are in that file, replace the two
`REPLACE_ME_FRONTEND_URL` values with the URL your site will be served from, and
either set `routes[0].pattern` to the hostname you want the API on or delete the
whole `routes` block to use the free `*.workers.dev` URL instead.

Leaving the database id as the placeholder is safe: `wrangler deploy` refuses it with
Cloudflare error 10021. It is not caught by `--dry-run`, which skips the API call.

### 2. Apply the migrations

Migrations reach the database **before** the code that reads them, always.

```bash
cd worker
npm install
npx wrangler d1 migrations apply hometodo-db --remote
```

Confirm the tables landed:

```bash
npx wrangler d1 execute hometodo-db --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

You should see `projects`, `todos`, `contacts`, and the three auth tables.

### 3. Set the secrets

```bash
# From worker/
npx wrangler secret put JWT_SECRET       # 64 random characters
npx wrangler secret put ADMIN_SETUP_KEY  # another random string, used once in step 4
```

Generate either with `openssl rand -base64 48`.

### 4. Deploy, then create your account

```bash
# From worker/
npx wrangler deploy

# From frontend/
cd ../frontend
npm install
# put the deployed Worker URL in .env.production as NEXT_PUBLIC_API_URL
npm run build
npx wrangler pages deploy out --project-name hometodo
```

Check the API is alive, then create the one and only account:

```bash
curl https://<your-worker-url>/api/v1/health
# {"status":"ok","service":"hometodo-worker"}

curl -X POST https://<your-worker-url>/api/v1/auth/bootstrap \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: <the ADMIN_SETUP_KEY from step 3>" \
  -d '{"email":"you@example.com","password":"a-long-password","name":"Your Name"}'
```

The bootstrap route refuses once an account exists, so nobody who finds the URL later
can create a second one. There is no signup route, and adding one is out of bounds.

Sign in at `https://<your-site>/sign-in/`.

## Run it locally

```bash
# Terminal 1 - API on http://localhost:8787
cd worker
cp .dev.vars.example .dev.vars   # then set JWT_SECRET and ADMIN_SETUP_KEY
npx wrangler d1 migrations apply hometodo-db --local
npm run dev

# Terminal 2 - site on http://localhost:3000
cd frontend
npm install
npm run dev
```

`frontend/.env.development` already points the site at `http://localhost:8787`.

Run the worker tests:

```bash
cd worker
npm test -- --run
```

The test suite applies the real files in `worker/migrations/`, so a schema change that
breaks a query fails a test instead of a deploy.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | Liveness probe. Does not touch the database. |
| `POST` | `/api/v1/auth/bootstrap` | One-time admin creation. Needs `X-Admin-Key`. Refuses once an account exists. |
| `POST` | `/api/v1/auth/login` | Returns an access token, a refresh token, and the user. |
| `POST` | `/api/v1/auth/refresh` | Exchanges a refresh token for a new access token. |
| `POST` | `/api/v1/auth/logout` | Revokes a refresh token. |
| `GET` | `/api/v1/auth/me` | Returns the signed-in user. Needs `Authorization: Bearer`. |

Anything else answers `404`, including `/api/v1/auth/signup`. That is deliberate.

## Layout

```
frontend/            Next.js static export. Sign-in page only, for now.
worker/
  src/index.ts       Routing only
  src/routes/        Route handlers
  src/db/            Database wiring
  migrations/        D1 migrations, applied in order
  test/              Vitest suite, run against the real migrations
```

## Contributing

Issues and pull requests are welcome. Two rules:

1. No real personal data in the repository. Examples use `example.com`.
2. No second user. Multi-user support is out of scope by design, not by omission.

## Licence

MIT. See [LICENSE](LICENSE).
