"""Makes the backend packages importable and provides shared fixtures."""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest

from server.app import create_app
from server.config import Settings


@pytest.fixture()
def settings(tmp_path):
    return Settings(db_path=tmp_path / "test.db", pool_size=2)


@pytest.fixture()
def app(settings):
    return create_app(settings)


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def organiser(client):
    response = client.post("/api/account/register", json={
        "username": "TestOrganiser", "password": "test-password-123",
    })
    assert response.status_code == 201
    return client
