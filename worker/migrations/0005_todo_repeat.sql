-- Repeating todos. A rule is three columns set together (mode, every, unit) or all null.
-- fixed counts whole periods from the due date; after_done counts one period from the
-- day the todo is finished. When a todo with a rule moves to done, the Worker inserts the
-- next occurrence with recurs_from_id pointing back at it. The unique index caps each
-- todo at one successor, so reopening and finishing it again never makes a duplicate.
ALTER TABLE todos ADD COLUMN repeat_mode TEXT CHECK (repeat_mode IN ('fixed', 'after_done'));
ALTER TABLE todos ADD COLUMN repeat_every INTEGER CHECK (repeat_every >= 1);
ALTER TABLE todos ADD COLUMN repeat_unit TEXT CHECK (repeat_unit IN ('day', 'week', 'month'));
ALTER TABLE todos ADD COLUMN recurs_from_id TEXT REFERENCES todos (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_todos_recurs_from ON todos (recurs_from_id) WHERE recurs_from_id IS NOT NULL;
