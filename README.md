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

This release ships the database schema, the admin-key gate, and the JSON API: create,
read, update, and archive or delete projects, todos, and contacts, plus a read-only
summary for other apps. There is no dashboard yet.

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

A second, optional secret, `READ_TOKEN`, lets another app read the summary without
the admin key.

- Send it as `Authorization: Bearer <READ_TOKEN>`. It opens `GET /api/v1/summary`
  and nothing else: every other route answers `403` to it.
- The summary holds project names, counts, and due todos. It never holds a contact,
  a phone number, an email address, a note, or a cost, and archived projects and
  their todos are left out.
- A wrong bearer value counts toward the same 20-per-ten-minutes limit as a wrong
  admin key.
- Leave it unset and the summary needs the admin key like every other route. Rotate
  it with `wrangler secret put READ_TOKEN`; the admin key is not affected.

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
npx wrangler secret put READ_TOKEN      # optional: a different long token for other apps
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
cp .dev.vars.example .dev.vars   # then set ADMIN_API_KEY (and READ_TOKEN if you use it)
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

## Import from Apple Reminders

A one-time import that turns an existing Apple Reminders backlog into Home Todos data.
Each Reminders list becomes a project; each reminder becomes a todo with
`source: "reminders"` and its Reminders id kept as `external_id`.

Run both commands on the Mac that holds the lists, from the repo root:

```bash
npm install
node scripts/reminders-export.js
HOMETODO_ADMIN_KEY=your-admin-key npm run import:reminders
```

- `scripts/reminders-export.js` reads every list and reminder from Reminders.app and
  writes `reminders.json` next to it. The first run asks macOS for an Automation
  grant: open **System Settings > Privacy & Security > Automation** and allow the
  terminal app you ran the command from to control Reminders, then run it again.
  `reminders.json` holds private data and is gitignored; it never gets committed.
  Add `--open-only` to skip completed reminders and export only the open backlog:
  `node scripts/reminders-export.js --open-only`.
- `npm run import:reminders` reads `reminders.json` and sends it to the deployed API
  with your admin key. Set `HOMETODO_API_URL` too if you are not importing into
  `https://home.imnotbot.com` (it defaults there).
- The import is safe to re-run: a reminder already imported is matched by its
  Reminders id and updated in place, never duplicated. A completed reminder imports
  as a `done` todo with `completed_at` set.
- This is a one-time seed, not ongoing sync: nothing in Home Todos writes back to
  Reminders, and nothing keeps the two in sync after the import.

## API

Every route below except `/api/v1/health` needs the admin key in `X-Admin-API-Key`.
`/api/v1/summary` also accepts the read token.
Bodies are JSON, and every response is JSON except a `204`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | Liveness probe. Public. Does not touch the database. |
| `GET` | `/api/v1/access` | Key check for the site gate. Returns `{"auth_level":"admin"}`. |
| `GET` | `/api/v1/projects` | Active projects, by name. `?include_archived=true` adds archived ones. |
| `POST` | `/api/v1/projects` | Create: `name` (required), `kind`, `notes`. Returns `201`. |
| `GET` | `/api/v1/projects/:id` | One project, archived or not. |
| `PATCH` | `/api/v1/projects/:id` | Change `name`, `kind`, `notes`, or `archived` (`true` or `false`). |
| `DELETE` | `/api/v1/projects/:id` | Archive. Projects are never deleted; `PATCH {"archived":false}` restores. |
| `GET` | `/api/v1/todos` | Todos in creation order, paged. See below. |
| `POST` | `/api/v1/todos` | Create: `project_id` and `title` (required), `notes`, `status`, `due_date`, `cost_cents`, `contact_id`, `source`, `external_id`. Returns `201`. |
| `GET` | `/api/v1/todos/:id` | One todo. |
| `PATCH` | `/api/v1/todos/:id` | Change `project_id`, `title`, `notes`, `status`, `due_date`, `cost_cents`, or `contact_id`. |
| `DELETE` | `/api/v1/todos/:id` | Delete. Returns `204`. |
| `GET` | `/api/v1/contacts` | All contacts, by name. |
| `POST` | `/api/v1/contacts` | Create: `name` (required), `role`, `phone`, `email`, `notes`. Returns `201`. |
| `GET` | `/api/v1/contacts/:id` | One contact. |
| `PATCH` | `/api/v1/contacts/:id` | Change any contact field. |
| `DELETE` | `/api/v1/contacts/:id` | Delete. Its todos stay, with `contact_id` cleared. Returns `204`. |
| `GET` | `/api/v1/summary` | Per active project: `open_count`, `waiting_count`, `done_count`, and `soonest_due` (the five unfinished todos due soonest). |

Rules the API enforces:

- Ids are UUIDs made by the server. A client never chooses one.
- `kind` is one of `house`, `car`, `family`, `admin`, `networking`, `other`, and
  `status` is one of `open`, `waiting`, `done`. Anything else is a `400`.
- `due_date` is a real calendar day as `YYYY-MM-DD`. `cost_cents` is a whole,
  non-negative number of cents.
- Setting `status` to `done` stamps `completed_at`; moving away from `done` clears it.
- An unknown field, an empty update, bad JSON, or an id that names no project or
  contact is a `400` that names the field. A second todo with the same `source` and
  `external_id` is a `409`. A missing record is a `404`.
- Send `null` to clear an optional field.

`GET /api/v1/todos` takes `project_id`, `status`, and `contact_id` filters, and hides
todos of archived projects unless `include_archived=true`. It returns
`{"todos": [...], "next_cursor": "..."}`: pass `limit` (1 to 200, default 50) and send
`next_cursor` back as `cursor` for the next page. `next_cursor` is `null` on the last
page.

Every other path answers `401` without the key and `404` with it. There is no login,
signup, or session route.

## Layout

```
frontend/            Next.js static export behind a key gate. No dashboard yet.
  components/        The access gate
  lib/api.ts         API calls; attaches the saved key
worker/
  src/index.ts       Routing only
  src/lib/auth.ts    Admin-key and read-token checks
  src/lib/           Input validation, errors, and the page cursor
  src/middleware/    CORS and the admin gate
  src/routes/        Route handlers
  src/db/            SQL, one file per table, plus the summary queries
  migrations/        D1 migrations, applied in order
  test/              Vitest suite, run against the real migrations
```

## Contributing

Issues and pull requests are welcome. Two rules:

1. No real personal data in the repository. Examples use `example.com`.
2. No second user. Multi-user support is out of scope by design, not by omission.

## Licence

MIT. See [LICENSE](LICENSE).
