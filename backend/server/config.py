"""Runtime settings for the local server.

Values can be overridden with TOS_HOST, TOS_PORT, TOS_DB_PATH and TOS_POOL_SIZE.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BACKEND_DIR / "var" / "tournaments.db"


@dataclass(frozen=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 5000
    db_path: Path = DEFAULT_DB_PATH
    pool_size: int = 5

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            host=os.environ.get("TOS_HOST", "127.0.0.1"),
            port=int(os.environ.get("TOS_PORT", "5000")),
            db_path=Path(os.environ.get("TOS_DB_PATH", str(DEFAULT_DB_PATH))),
            pool_size=int(os.environ.get("TOS_POOL_SIZE", "5")),
        )
