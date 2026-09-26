-- Home Todos core schema: the three records the app is built around.
--
-- Ids are TEXT UUIDs rather than integers so a row can be created client-side or
-- imported from an external system without a round trip for an autoincrement value,
-- and so an id in a URL leaks neither a record count nor a creation order.
-- Timestamps are ISO 8601 DATETIME strings, matching the auth tables in 0002.

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- Areas of life, not a free-text label: a closed set keeps grouping and filtering
  -- honest. Extend the CHECK in a new migration rather than writing around it.
  kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('house', 'car', 'family', 'admin', 'networking', 'other')),
  notes TEXT,
  -- Archived, never deleted. The history of a finished renovation is worth keeping.
  archived_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_kind ON projects(kind);
CREATE INDEX IF NOT EXISTS idx_projects_archived_at ON projects(archived_at);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- What they do for you: 'roofer', 'mechanic', 'county clerk'. Free text on purpose;
  -- the useful values are not knowable in advance.
  role TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  -- 'waiting' is load-bearing. Most household work is blocked on somebody else, and a
  -- tracker with only open and done cannot tell "not started" from "waiting on a quote".
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting', 'done')),
  -- Date only (YYYY-MM-DD). Household work is due on a day, not at a time.
  due_date TEXT,
  -- Money in whole cents. Never a float: 0.1 + 0.2 is not 0.3 in binary floating point,
  -- and a cost total that drifts by a cent is a bug nobody can explain later.
  cost_cents INTEGER,
  contact_id TEXT,
  -- Where the row came from. 'reminders' rows arrive from a one-time import and carry
  -- the source system's identifier in external_id so a re-run cannot duplicate them.
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'reminders')),
  external_id TEXT,
  completed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  -- Deleting a contact must not delete the work. The todo survives, unassigned.
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_todos_project_id ON todos(project_id);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
CREATE INDEX IF NOT EXISTS idx_todos_contact_id ON todos(contact_id);

-- An import must be repeatable. A partial unique index lets every manual row leave
-- external_id NULL while making a second import of the same source row impossible.
CREATE UNIQUE INDEX IF NOT EXISTS idx_todos_source_external_id
  ON todos(source, external_id)
  WHERE external_id IS NOT NULL;
