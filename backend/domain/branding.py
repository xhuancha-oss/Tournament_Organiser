"""Validation shared by event logos and team portraits."""

import base64
import binascii

from domain.exceptions import ValidationError

MAX_LOGO_SIZE = 48_000


def validate_logo(value):
    if value is None or value == "":
        return ""
    message = "Upload a PNG, JPEG or WebP image up to 48 KB after resizing."
    if not isinstance(value, str) or len(value) > MAX_LOGO_SIZE:
        raise ValidationError(message)
    header, _, encoded = value.partition(",")
    signatures = {
        "data:image/png;base64": b"\x89PNG\r\n\x1a\n",
        "data:image/jpeg;base64": b"\xff\xd8\xff",
        "data:image/webp;base64": b"RIFF",
    }
    signature = signatures.get(header)
    if signature is None:
        raise ValidationError(message)
    try:
        image = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise ValidationError(message) from None
    if (not image.startswith(signature) or
            (header == "data:image/webp;base64" and image[8:12] != b"WEBP")):
        raise ValidationError(message)
    return value


def validate_entry_type(value):
    if value not in ("individual", "team"):
        raise ValidationError("Choose Individual or Team.")
    return value


def validate_teams(value, players):
    if not isinstance(value, dict) or set(value) != set(players):
        raise ValidationError("Provide a member list for every team.")
    teams = {}
    for name in players:
        team = value[name]
        members = team.get("members") if isinstance(team, dict) else None
        if not isinstance(members, list) or not 1 <= len(members) <= 16:
            raise ValidationError(f"Enter 1–16 members for {name}.")
        roster = []
        seen = set()
        for member in members:
            member_name = member.get("name") if isinstance(member, dict) else None
            if not isinstance(member_name, str) or not 1 <= len(member_name.strip()) <= 80:
                raise ValidationError(f"Enter a name for every member of {name}.")
            member_name = member_name.strip()
            if member_name.casefold() in seen:
                raise ValidationError(f"Member names must be unique within {name}.")
            seen.add(member_name.casefold())
            roster.append({"name": member_name, "logo": validate_logo(member.get("logo"))})
        teams[name] = {"logo": validate_logo(team.get("logo")), "members": roster}
    return teams
