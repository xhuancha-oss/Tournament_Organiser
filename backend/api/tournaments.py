"""Tournament HTTP endpoints."""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from api.accounts import current_account, require_account
from domain.exceptions import NotFoundError, ValidationError
from service.tournament_service import TournamentService

bp = Blueprint("tournaments", __name__)


def _service() -> TournamentService:
    return current_app.extensions["tournament_service"]


def _account_id():
    account = current_account()
    return account["id"] if account else None


def _check_access(tournament_id, account_id):
    repository = current_app.extensions["tournament_repository"]
    owner = repository.owner_id(tournament_id)
    if owner is not None and owner != account_id:
        raise NotFoundError(f"Tournament {tournament_id} does not exist.")


@bp.post("/api/tournaments")
def create_tournament():
    require_account()
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object.")
    owner_id = require_account(payload.get("account_id"))["id"]
    tournament = _service().create(payload, owner_id=owner_id)
    return jsonify(tournament.to_dict()), 201


@bp.get("/api/tournaments")
def list_tournaments():
    return jsonify({"tournaments": _service().summaries(owner_id=_account_id())})


@bp.get("/api/tournaments/bracket-preview")
def preview_bracket():
    size = request.args.get("size", type=int)
    if size is None:
        raise ValidationError("Choose a valid participant count.")
    return jsonify({"games": _service().preview_bracket(request.args.get("format"), size)})


@bp.get("/api/tournaments/<int:tournament_id>")
def get_tournament(tournament_id: int):
    _check_access(tournament_id, _account_id())
    return jsonify(_service().summary(tournament_id))


@bp.get("/api/tournaments/<int:tournament_id>/workspace")
def get_workspace(tournament_id: int):
    _check_access(tournament_id, _account_id())
    return jsonify(_service().get_workspace(tournament_id))


@bp.put("/api/tournaments/<int:tournament_id>/workspace")
def save_workspace(tournament_id: int):
    account = require_account()
    _check_access(tournament_id, account["id"])
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object.")
    require_account(payload.get("account_id"))
    return jsonify(_service().save_workspace(tournament_id, payload))


@bp.get("/api/public/tournaments/<int:tournament_id>")
def public_tournament(tournament_id: int):
    return jsonify(_service().public_event(tournament_id))


@bp.post("/api/public/tournaments/<int:tournament_id>/register")
def register(tournament_id: int):
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object.")
    _service().register(tournament_id, payload.get("name"), payload.get("team"))
    return jsonify({"message": "Registration saved."}), 201


@bp.after_request
def disable_private_cache(response):
    if request.path.startswith("/api/tournaments"):
        response.cache_control.no_store = True
    return response
