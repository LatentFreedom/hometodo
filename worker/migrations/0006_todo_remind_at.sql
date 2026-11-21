-- An exact time to remind the owner about a todo, as a UTC ISO date-time such as
-- 2026-12-01T14:00:00Z. The browser converts from local time before it sends one.
-- No reminder id is stored: live.imnotbot keys each reminder by hometodo:todo:<id>.
ALTER TABLE todos ADD COLUMN remind_at TEXT;
