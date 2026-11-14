"""SQLite implementation of the tournament repository."""

from __future__ import annotations

import json
import sqlite3
from typing import Optional

from db.pool import SQLitePool
from domain.exceptions import ConflictError
from domain.repository import TournamentRepository
from domain.tournament import Tournament



TOURNAMENT_FIELDS = """SELECT tournaments.*,
    COALESCE(tournament_branding.entry_type, 'individual') AS entry_type,
    COALESCE(tournament_branding.logo, '') AS logo"""
BRANDING_JOIN = "LEFT JOIN tournament_branding ON tournament_branding.tournament_id = tournaments.id"


def _to_tournament(row: sqlite3.Row) -> Tournament:
    return Tournament(
        id=row["id"],
        name=row["name"],
        start_time=row["start_time"],
        end_time=row["end_time"],
        format=row["format"],
        description=row["description"],
        status=row["status"],
        created_at=row["created_at"],
        entry_type=row["entry_type"],
        logo=row["logo"],
    )


class SqliteTournamentRepository(TournamentRepository):
    def __init__(self, pool: SQLitePool) -> None:
        self._pool = pool

    def add(self, tournament: Tournament, owner_id: Optional[int] = None) -> Tournament:
        with self._pool.connection() as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            cursor = connection.execute(
                """
                INSERT INTO tournaments (name, start_time, end_time, format, description, status)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    tournament.name,
                    tournament.start_time,
                    tournament.end_time,
                    tournament.format,
                    tournament.description,
                    tournament.status,
                ),
            )
            if owner_id is not None:
                connection.execute("INSERT INTO tournament_owners VALUES (?, ?)", (cursor.lastrowid, owner_id))
            connection.execute(
                "INSERT INTO tournament_branding VALUES (?, ?, ?)",
                (cursor.lastrowid, tournament.entry_type, tournament.logo),
            )
            row = connection.execute(
                f"{TOURNAMENT_FIELDS} FROM tournaments {BRANDING_JOIN} WHERE tournaments.id = ?",
                (cursor.lastrowid,),
            ).fetchone()
        return _to_tournament(row)

    def get(self, tournament_id: int) -> Optional[Tournament]:
        with self._pool.connection() as connection:
            row = connection.execute(
                f"{TOURNAMENT_FIELDS} FROM tournaments {BRANDING_JOIN} WHERE tournaments.id = ?", (tournament_id,)
            ).fetchone()
        return None if row is None else _to_tournament(row)

    def list(self) -> list[Tournament]:
        with self._pool.connection() as connection:
            rows = connection.execute(
                f"{TOURNAMENT_FIELDS} FROM tournaments {BRANDING_JOIN} ORDER BY tournaments.id DESC"
            ).fetchall()
        return [_to_tournament(row) for row in rows]


    def owner_id(self, tournament_id: int) -> Optional[int]:
        with self._pool.connection() as connection:
            row = connection.execute(
                "SELECT account_id FROM tournament_owners WHERE tournament_id = ?", (tournament_id,)
            ).fetchone()
        return row["account_id"] if row else None

    def list_with_workspaces(self, owner_id: Optional[int] = None, include_shared: bool = True) -> list:
        with self._pool.connection() as connection:
            rows = connection.execute(
                f"""
                {TOURNAMENT_FIELDS}, details FROM tournaments
                {BRANDING_JOIN}
                LEFT JOIN tournament_workspaces ON tournament_workspaces.tournament_id = tournaments.id
                LEFT JOIN tournament_owners ON tournament_owners.tournament_id = tournaments.id
                WHERE account_id = ? OR (account_id IS NULL AND ?)
                ORDER BY tournaments.id DESC
                """, (owner_id, include_shared)
            ).fetchall()
        return [
            (_to_tournament(row), json.loads(row["details"]) if row["details"] else {"players": [], "matches": []})
            for row in rows
        ]

    def get_workspace(self, tournament_id: int) -> dict:
        with self._pool.connection() as connection:
            row = connection.execute(
                "SELECT version, details FROM tournament_workspaces WHERE tournament_id = ?",
                (tournament_id,),
            ).fetchone()
        if row is None:
            return {"version": 0, "players": [], "matches": []}
        return {"version": row["version"], **json.loads(row["details"])}

    def save_workspace(self, tournament_id: int, workspace: dict) -> dict:
        version = workspace["version"]
        details = {key: value for key, value in workspace.items() if key != "version"}
        with self._pool.connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO tournament_workspaces (tournament_id, version, details)
                SELECT ?, ?, ?
                WHERE ? = 0 OR EXISTS (
                    SELECT 1 FROM tournament_workspaces WHERE tournament_id = ?
                )
                ON CONFLICT(tournament_id) DO UPDATE
                    SET version = excluded.version, details = excluded.details
                WHERE tournament_workspaces.version = ?
                """,
                (tournament_id, version + 1, json.dumps(details), version, tournament_id, version),
            )
            if cursor.rowcount != 1:
                raise ConflictError("This tournament changed in another tab. Reload it and try again.")
        return {"version": version + 1, **details}
