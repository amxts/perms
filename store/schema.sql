CREATE TABLE IF NOT EXISTS sessions (
	id TEXT PRIMARY KEY,
	record TEXT NOT NULL,
	expires INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires);
