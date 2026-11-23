-- A due time to go with due_date, as "HH:MM" in the owner's local time, such as 14:30.
-- Local, not UTC, because due_date is already a local day; the phone and the browser
-- read both in their own zone. Null means a date-only todo. The Worker refuses a
-- due_time without a due_date and clears it when the due date is cleared.
ALTER TABLE todos ADD COLUMN due_time TEXT;
