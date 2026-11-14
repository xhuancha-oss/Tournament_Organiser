CREATE TABLE IF NOT EXISTS tournaments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    start_time  TEXT    NOT NULL,
    end_time    TEXT    NOT NULL,
    format      TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    status      TEXT    NOT NULL DEFAULT 'upcoming',
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tournament_workspaces (
    tournament_id INTEGER PRIMARY KEY REFERENCES tournaments (id) ON DELETE CASCADE,
    version       INTEGER NOT NULL,
    details       TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    sidebar_color TEXT NOT NULL DEFAULT 'navy',
    night_mode INTEGER NOT NULL DEFAULT 0,
    draft TEXT
);

CREATE TABLE IF NOT EXISTS account_sessions (
    token_hash TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS account_session_expiry ON account_sessions(expires_at);

CREATE TABLE IF NOT EXISTS tournament_owners (
    tournament_id INTEGER PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tournaments_by_owner ON tournament_owners(account_id);

CREATE TABLE IF NOT EXISTS tournament_branding (
    tournament_id INTEGER PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('individual', 'team')),
    logo TEXT NOT NULL DEFAULT ''
);
