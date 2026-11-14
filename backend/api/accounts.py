"""Organiser authentication and account-specific settings."""

import json
import re

from flask import Blueprint, current_app, g, jsonify, request
from werkzeug.exceptions import Forbidden, Unauthorized
from werkzeug.security import check_password_hash, generate_password_hash

from db.account_repository import SESSION_AGE
from domain.branding import validate_entry_type, validate_logo
from domain.exceptions import ConflictError, ValidationError


bp = Blueprint("accounts", __name__, url_prefix="/api/account")
COOKIE = "tos_session"
HASH_METHOD = "pbkdf2:sha256:600000"
DUMMY_HASH = generate_password_hash("unused", method=HASH_METHOD)
DRAFT_LIMITS = {"name": 80, "start_time": 32, "end_time": 32, "format": 24, "description": 1000}


def repository():
    return current_app.extensions["account_repository"]


def current_account():
    if "organiser_account" not in g:
        g.organiser_account = repository().for_session(request.cookies.get(COOKIE))
    return g.organiser_account


def require_account(expected_id=None):
    account = current_account()
    if account is None:
        raise Unauthorized("Sign in to continue.")
    if expected_id is not None and (type(expected_id) is not int or expected_id != account["id"]):
        raise ConflictError("The signed-in account changed. Reload the page and try again.")
    return account


@bp.before_app_request
def protect_authenticated_writes():
    if request.method not in ("POST", "PUT", "PATCH", "DELETE") or not request.path.startswith("/api/"):
        return
    if not (request.path.startswith("/api/account") or request.cookies.get(COOKIE)):
        return
    origin = request.headers.get("Origin")
    if origin and origin != request.host_url.rstrip("/"):
        raise Forbidden("Submit account changes from the tournament site.")


def body():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ValidationError("Send a JSON object.")
    return payload


def credentials(payload):
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not re.fullmatch(r"[A-Za-z0-9_]{3,32}", username.strip()):
        raise ValidationError("Use a username with 3–32 letters, digits or underscores.")
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        raise ValidationError("Use a password with 8–128 characters.")
    return username.strip(), password


def settings_for(account):
    return {"sidebar_color": account["sidebar_color"], "night_mode": bool(account["night_mode"])}


def session_response(account_id, status=200):
    token = repository().new_session(account_id, request.cookies.get(COOKIE))
    response = jsonify({"authenticated": True})
    response.status_code = status
    response.set_cookie(COOKIE, token, max_age=SESSION_AGE, httponly=True, samesite="Lax",
                        secure=request.is_secure)
    return response


@bp.post("/register")
def register():
    username, password = credentials(body())
    account_id = repository().create(username, generate_password_hash(password, method=HASH_METHOD))
    return session_response(account_id, 201)


@bp.post("/login")
def login():
    username, password = credentials(body())
    account = repository().by_username(username)
    password_hash = account["password_hash"] if account else DUMMY_HASH
    valid = check_password_hash(password_hash, password)
    if not account or not valid:
        raise Unauthorized("Incorrect username or password.")
    return session_response(account["id"])


@bp.post("/logout")
def logout():
    repository().end_session(request.cookies.get(COOKIE))
    response = jsonify({"authenticated": False})
    response.delete_cookie(COOKIE, httponly=True, samesite="Lax", secure=request.is_secure)
    return response


@bp.get("")
def profile():
    account = current_account()
    if account is None:
        return jsonify({"account": None})
    return jsonify({
        "account": {"id": account["id"], "username": account["username"]},
        "settings": settings_for(account),
        "draft": json.loads(account["draft"]) if account["draft"] else None,
    })


@bp.get("/tournaments")
def tournaments():
    account = require_account()
    service = current_app.extensions["tournament_service"]
    return jsonify({
        "tournaments": service.summaries(owner_id=account["id"], include_shared=False),
        "shared": service.summaries(),
    })


@bp.put("/settings")
def settings():
    account = require_account()
    payload = body()
    require_account(payload.get("account_id"))
    color = payload.get("sidebar_color")
    night = payload.get("night_mode")
    if color not in ("navy", "slate", "plum", "forest") or type(night) is not bool:
        raise ValidationError("Choose a valid sidebar colour and theme.")
    repository().save_settings(account["id"], color, night)
    return jsonify({"sidebar_color": color, "night_mode": night})


@bp.put("/draft")
def draft():
    account = require_account()
    payload = body()
    require_account(payload.get("account_id"))
    if "draft" not in payload:
        raise ValidationError("Provide a draft or null to clear it.")
    value = payload["draft"]
    if value is not None:
        if (not isinstance(value, dict) or not DRAFT_LIMITS.keys() <= value.keys() <= (DRAFT_LIMITS.keys() | {"entry_type", "logo"}) or
                any(not isinstance(value[key], str) or len(value[key]) > limit
                    for key, limit in DRAFT_LIMITS.items())):
            raise ValidationError("The draft contains invalid fields.")
        validate_entry_type(value.get("entry_type", "individual"))
        validate_logo(value.get("logo"))
    repository().save_draft(account["id"], value)
    return jsonify({"draft": value})


@bp.after_request
def disable_cache(response):
    response.cache_control.no_store = True
    return response
