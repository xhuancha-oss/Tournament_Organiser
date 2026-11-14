"""The SQLite repository implements the domain port."""

from pathlib import Path

import pytest

from db.pool import SQLitePool
from db.tournament_repository import SqliteTournamentRepository
from domain.tournament import Tournament

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "db" / "schema.sql"


def make_tournament(name="Campus Open"):
    return Tournament.from_payload(
        {
            "name": name,
            "start_time": "2026-11-20T09:00:00+08:00",
            "end_time": "2026-11-20T18:00:00+08:00",
            "format": "round_robin",
            "description": "Welcome",
        }
    )


@pytest.fixture()
def repository(tmp_path):
    pool = SQLitePool(tmp_path / "repo.db", max_size=2)
    pool.initialize(SCHEMA_PATH)
    return SqliteTournamentRepository(pool)


def test_add_assigns_an_id_and_created_at(repository):
    saved = repository.add(make_tournament())

    assert isinstance(saved.id, int)
    assert saved.created_at.endswith("Z")
    assert saved.name == "Campus Open"
    assert saved.start_time == "2026-11-20T01:00:00Z"


def test_get_returns_the_stored_tournament(repository):
    saved = repository.add(make_tournament())

    assert repository.get(saved.id) == saved


def test_get_returns_none_for_unknown_id(repository):
    assert repository.get(999) is None


def test_list_returns_newest_first(repository):
    first = repository.add(make_tournament("First"))
    second = repository.add(make_tournament("Second"))

    assert [item.id for item in repository.list()] == [second.id, first.id]


def test_rows_survive_a_new_pool(tmp_path):
    db_path = tmp_path / "shared.db"

    pool = SQLitePool(db_path, max_size=2)
    pool.initialize(SCHEMA_PATH)
    saved = SqliteTournamentRepository(pool).add(make_tournament())

    reopened = SQLitePool(db_path, max_size=2)
    reopened.initialize(SCHEMA_PATH)
    assert SqliteTournamentRepository(reopened).get(saved.id) == saved
