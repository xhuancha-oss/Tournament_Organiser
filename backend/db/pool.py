"""A small thread-safe SQLite connection pool.

SQLite has no server-side pool, so the composition root owns this object and
hands connections out per unit of work. WAL mode lets readers continue while a
writer holds the lock.
"""

from __future__ import annotations

import queue
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Union


class SQLitePool:
    def __init__(self, db_path: Union[str, Path], max_size: int = 5, timeout: float = 5.0) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._max_size = max_size
        self._timeout = timeout
        self._idle: queue.LifoQueue[sqlite3.Connection] = queue.LifoQueue(maxsize=max_size)
        self._created = 0
        self._lock = threading.Lock()

    @property
    def created(self) -> int:
        """How many connections the pool has opened so far."""

        return self._created

    def initialize(self, schema_path: Union[str, Path]) -> None:
        """Apply the schema; safe to run on every start because it is idempotent."""

        schema = Path(schema_path).read_text(encoding="utf-8")
        with self.connection() as connection:
            connection.executescript(schema)

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = self._checkout()
        try:
            yield connection
        finally:
            self._checkin(connection)

    def _open(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            str(self._db_path),
            timeout=self._timeout,
            isolation_level=None,
            check_same_thread=False,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=NORMAL")
        connection.execute("PRAGMA busy_timeout=5000")
        return connection

    def _checkout(self) -> sqlite3.Connection:
        try:
            return self._idle.get_nowait()
        except queue.Empty:
            pass

        with self._lock:
            may_create = self._created < self._max_size
            if may_create:
                self._created += 1

        if may_create:
            try:
                return self._open()
            except BaseException:
                with self._lock:
                    self._created -= 1
                raise

        try:
            return self._idle.get(timeout=self._timeout)
        except queue.Empty:
            raise TimeoutError("No SQLite connection became available within the pool timeout.") from None

    def _checkin(self, connection: sqlite3.Connection) -> None:
        try:
            self._idle.put_nowait(connection)
        except queue.Full:
            connection.close()
            with self._lock:
                self._created -= 1
