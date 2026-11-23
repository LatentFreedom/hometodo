-- Saved places for location reminders: a short list the owner keeps (home, the hardware
-- store), each a circle of radius_m metres. The phone watches the circles; the Worker
-- only stores them. radius_m starts at 100 because iOS does not fire reliably for
-- smaller regions. Places soft delete and carry updated_at, so the phone can keep a
-- cache with the same updated_since pull as todos.
CREATE TABLE places (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
	longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
	radius_m INTEGER NOT NULL DEFAULT 150 CHECK (radius_m BETWEEN 100 AND 2000),
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	deleted_at DATETIME
);

CREATE INDEX idx_places_updated_at ON places (updated_at);

-- A todo points at one place and says whether to remind on arrival or on departure.
-- Both are null together; deleting a place clears them on its todos.
ALTER TABLE todos ADD COLUMN place_id TEXT REFERENCES places (id);
ALTER TABLE todos ADD COLUMN place_trigger TEXT CHECK (place_trigger IN ('arrive', 'leave'));
