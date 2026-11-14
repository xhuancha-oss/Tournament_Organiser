"""SQLite persistence for organiser accounts, sessions, preferences and drafts."""

import json
import sqlite3
import time
from hashlib import sha256
from secrets import token_urlsafe

from domain.exceptions import ConflictError


SESSION_AGE = 60 * 60 * 24 * 7


def _digest(token):
    return sha256(token.encode()).hexdigest()


class AccountRepository:
    def __init__(self, pool):
        self._pool = pool

    def create(self, username, password_hash):
        with self._pool.connection() as db:
            try:
                cursor = db.execute(
                    "INSERT INTO accounts (username, password_hash) VALUES (?, ?)",
                    (username, password_hash),
                )
            except sqlite3.IntegrityError:
                raise ConflictError("That username is already taken.") from None
            return cursor.lastrowid

    def by_username(self, username):
        with self._pool.connection() as db:
            return db.execute("SELECT * FROM accounts WHERE username = ?", (username,)).fetchone()

    def for_session(self, token):
        if not token or len(token) > 128:
            return None
        with self._pool.connection() as db:
            return db.execute(
                """SELECT accounts.* FROM accounts JOIN account_sessions ON accounts.id = account_id
                   WHERE token_hash = ? AND expires_at > ?""", (_digest(token), int(time.time())),
            ).fetchone()

    def new_session(self, account_id, previous):
        token = token_urlsafe(32)
        now = int(time.time())
        with self._pool.connection() as db:
            db.execute("DELETE FROM account_sessions WHERE expires_at <= ?", (now,))
            if previous:
                db.execute("DELETE FROM account_sessions WHERE token_hash = ?", (_digest(previous),))
            db.execute(
                "INSERT INTO account_sessions VALUES (?, ?, ?)",
                (_digest(token), account_id, now + SESSION_AGE),
            )
        return token

    def end_session(self, token):
        if token:
            with self._pool.connection() as db:
                db.execute("DELETE FROM account_sessions WHERE token_hash = ?", (_digest(token),))

    def save_settings(self, account_id, sidebar_color, night_mode):
        with self._pool.connection() as db:
            db.execute("UPDATE accounts SET sidebar_color = ?, night_mode = ? WHERE id = ?",
                       (sidebar_color, int(night_mode), account_id))

    def save_draft(self, account_id, draft):
        with self._pool.connection() as db:
            db.execute("UPDATE accounts SET draft = ? WHERE id = ?",
                       (None if draft is None else json.dumps(draft), account_id))
