"""Composition root.

This is the only module allowed to know every layer: it reads settings, opens
the connection pool, builds the repository, injects it into the service and
registers the HTTP blueprint.
"""

from __future__ import annotations

from typing import Optional

from flask import Flask, send_from_directory

from api.accounts import bp as accounts_blueprint
from api.errors import register_error_handlers
from api.tournaments import bp as tournaments_blueprint
from db.account_repository import AccountRepository
from db.pool import SQLitePool
from db.tournament_repository import SqliteTournamentRepository
from server.config import BACKEND_DIR, Settings
from service.tournament_service import TournamentService

SCHEMA_PATH = BACKEND_DIR / "db" / "schema.sql"
FRONTEND_DIR = BACKEND_DIR.parent / "tournament-create-frontend"


def create_app(settings: Optional[Settings] = None) -> Flask:
    settings = settings or Settings.from_env()

    pool = SQLitePool(settings.db_path, max_size=settings.pool_size)
    pool.initialize(SCHEMA_PATH)

    repository = SqliteTournamentRepository(pool)
    service = TournamentService(repository)

    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024
    app.extensions["sqlite_pool"] = pool
    app.extensions["tournament_repository"] = repository
    app.extensions["tournament_service"] = service
    app.extensions["account_repository"] = AccountRepository(pool)
    app.register_blueprint(accounts_blueprint)
    app.register_blueprint(tournaments_blueprint)
    _register_frontend_routes(app)
    register_error_handlers(app)
    _allow_local_frontend_origins(app)
    return app


def _register_frontend_routes(app: Flask) -> None:
    @app.get("/")
    def create_tournament_page():
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.get("/<any(css,js):directory>/<path:filename>")
    def frontend_asset(directory: str, filename: str):
        return send_from_directory(FRONTEND_DIR / directory, filename)


def _allow_local_frontend_origins(app: Flask) -> None:
    """The static frontend is served from its own port during development."""

    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Accept"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, OPTIONS"
        return response
