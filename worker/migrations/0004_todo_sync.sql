-- Todos become soft deleted so a replica (the Master Dashboard desktop app) can learn
-- about a delete on its next pull. The app lists with updated_since, so updated_at
-- gets an index. Deleted rows stay out of every normal read; only include_deleted=true
-- on the sync pull returns them.
ALTER TABLE todos ADD COLUMN deleted_at TEXT;

CREATE INDEX idx_todos_updated_at ON todos (updated_at);
