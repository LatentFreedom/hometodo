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

This release ships the database schema and the admin-key gate.
There is no dashboard yet: the API serves a health probe and a key check only.

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
| Auth | One admin key, held as a Cloudflare secret |

You need a Cloudflare account (the free plan is enough), Node.js 22 or later, and
`npx wrangler login` already done.

## How access works

There are no accounts. One admin key, stored as the `ADMIN_API_KEY` Worker secret,
opens everything.

- The site shows a single "Admin key" field. The key is checked against the API and
  saved in the browser, so you type it once per device.
- Every API route except `/api/v1/health` requires the key in the `X-Admin-API-Key`
  header. Without it, every path answers `401`, including unknown ones.
- After 20 wrong keys from one IP address in ten minutes, the API answers `429` until
  the window passes. A correct key is never throttled. Guesses are never stored.
- The key never expires. To revoke every device at once, set a new value with
  `wrangler secret put ADMIN_API_KEY`.

## Deploy it in ten minutes

Run the steps in order: the database has to exist before the code that reads it.
The site and the API share one hostname. Pages serves the site, and a Worker route
sends `/api/*` on that hostname to the Worker.

### 1. Create the database and set your hostname

```bash
git clone https://github.com/LatentFreedom/hometodo.git
cd hometodo
npx wrangler d1 create hometodo-db
```

That prints a `database_id`. Open `worker/wrangler.jsonc` and:

- paste the id into `d1_databases[0].database_id`;
- set `routes[0].pattern` to `<your-hostname>/api/*` and `zone_name` to your zone;
- set `FRONTEND_URL` and the first `ALLOWED_ORIGINS` entry to `https://<your-hostname>`.

No domain on Cloudflare? Delete the `routes` block, use the Worker's `*.workers.dev`
URL, and put that URL in `frontend/.env.production` as `NEXT_PUBLIC_API_URL`.

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

You should see `projects`, `todos`, `contacts`, and `access_failures`.

### 3. Deploy the Worker and set the key

```bash
# From worker/
npx wrangler deploy
npx wrangler secret put ADMIN_API_KEY   # type a long key you can remember
```

Until the secret exists, every gated route answers `401`. That is deliberate: a
deploy that forgot the key is locked, not open.

### 4. Deploy the site

In the Cloudflare dashboard, create a Pages project connected to your fork of this
repository, with root directory `frontend`, build command `npx next build`, and
output directory `out`. Then add `<your-hostname>` as the project's custom domain.

Check it:

```bash
curl https://<your-hostname>/api/v1/health
# {"status":"ok","service":"hometodo-worker"}
```

Open `https://<your-hostname>/` and enter the key.

## Run it locally

```bash
# Terminal 1 - API on http://localhost:8787
cd worker
cp .dev.vars.example .dev.vars   # then set ADMIN_API_KEY
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
| `GET` | `/api/v1/health` | Liveness probe. Public. Does not touch the database. |
| `GET` | `/api/v1/access` | Key check for the site gate. Returns `{"auth_level":"admin"}`. |

Every other path answers `401` without the key and `404` with it. There is no login,
signup, or session route.

## Layout

```
frontend/            Next.js static export behind a key gate. No dashboard yet.
  components/        The access gate
  lib/api.ts         API calls; attaches the saved key
worker/
  src/index.ts       Routing only
  src/lib/auth.ts    Admin-key check
  src/middleware/    CORS and the admin gate
  src/routes/        Route handlers
  migrations/        D1 migrations, applied in order
  test/              Vitest suite, run against the real migrations
```

## Contributing

Issues and pull requests are welcome. Two rules:

1. No real personal data in the repository. Examples use `example.com`.
2. No second user. Multi-user support is out of scope by design, not by omission.

## Licence

MIT. See [LICENSE](LICENSE).
