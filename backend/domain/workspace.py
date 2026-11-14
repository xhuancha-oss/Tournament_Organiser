"""Validation for a tournament's roster, fixtures and results."""

from collections import Counter
from datetime import datetime, timezone

from domain.exceptions import ValidationError


def _text(value, maximum, label, required=False):
    if not isinstance(value, str):
        raise ValidationError(f"{label} must be text.")
    value = value.strip()
    if len(value) > maximum or (required and not value):
        raise ValidationError(f"Enter {label.lower()} with up to {maximum} characters.")
    return value


def _score(value):
    if type(value) is not int or not 0 <= value <= 9999:
        raise ValidationError("Scores must be integers from 0 to 9999.")
    return value


def match_time(value):
    starts_at = _text(value, 32, "Match time")
    if starts_at.endswith("Z"):
        try:
            parsed = datetime.fromisoformat(starts_at[:-1] + "+00:00")
            if parsed.isoformat(timespec="seconds") == starts_at[:-1] + "+00:00":
                return starts_at
        except ValueError:
            pass
        raise ValidationError("Enter a valid match date and time.")
    if starts_at:
        try:
            parsed = datetime.strptime(starts_at, "%Y-%m-%dT%H:%M")
        except ValueError:
            raise ValidationError("Enter a valid local match date and time.") from None
        if parsed.isoformat(timespec="minutes") != starts_at:
            raise ValidationError("Enter a valid local match date and time.")
    return starts_at


def validate_workspace(payload, tournament_format, entry_type="individual"):
    participant = "Team" if entry_type == "team" else "Player"
    version = payload.get("version")
    if type(version) is not int or not 0 <= version < 2**63 - 1:
        raise ValidationError("A valid workspace version is required.")

    raw_players = payload.get("players")
    if not isinstance(raw_players, list) or len(raw_players) > 32:
        raise ValidationError(f"Enter up to 32 {participant.lower()}s.")
    if "player_count" in payload:
        count = payload["player_count"]
        if type(count) is not int or count != len(raw_players):
            raise ValidationError(f"The selected {participant.lower()} count must match the number of names.")
    players = [_text(name, 80, f"{participant} name", required=True) for name in raw_players]
    if len({name.casefold() for name in players}) != len(players):
        raise ValidationError(f"{participant} names must be unique.")
    roster = set(players)

    raw_matches = payload.get("matches")
    if not isinstance(raw_matches, list) or len(raw_matches) > 512:
        raise ValidationError("A tournament can have up to 512 matches.")
    matches = []
    for match in raw_matches:
        if not isinstance(match, dict):
            raise ValidationError("Each match must be an object.")
        home = _text(match.get("home"), 80, f"First {participant.lower()}", required=True)
        away = _text(match.get("away"), 80, f"Second {participant.lower()}", required=True)
        if home == away or home not in roster or away not in roster:
            raise ValidationError(f"Each match must use two different {participant.lower()}s from the roster.")
        starts_at = match_time(match.get("starts_at", ""))
        scores = match.get("scores")
        if scores is not None:
            if not isinstance(scores, list) or len(scores) != 2:
                raise ValidationError(f"Enter a score for both {participant.lower()}s.")
            scores = [_score(value) for value in scores]
            if scores[0] == scores[1] and tournament_format != "round_robin":
                raise ValidationError("Elimination matches cannot end in a tie.")
        matches.append({
            "home": home,
            "away": away,
            "round": _text(match.get("round", ""), 80, "Round"),
            "starts_at": starts_at,
            "scores": scores,
        })
    return {"version": version, "players": players, "matches": matches}


def round_robin_pair_counts(matches):
    """Count fixtures for each unordered pair of players."""
    return Counter(frozenset((match["home"], match["away"])) for match in matches)


def validate_schedule_window(tournament, workspace):
    """Check new UTC match times; older timezone-free values remain readable."""
    start = datetime.fromisoformat(tournament.start_time[:-1] + "+00:00")
    end = datetime.fromisoformat(tournament.end_time[:-1] + "+00:00")
    for match in workspace.get("bracket", {}).get("games", workspace["matches"]):
        time = match["starts_at"]
        if time.endswith("Z"):
            instant = datetime.fromisoformat(time[:-1] + "+00:00").astimezone(timezone.utc)
            if not start <= instant <= end:
                raise ValidationError(
                    f"Invalid match time. Choose a time between {start:%Y-%m-%d %H:%M:%S} "
                    f"and {end:%Y-%m-%d %H:%M:%S} (UTC)."
                )

def validate_check_in(value, players):
    """Validate attendance against the roster used by the same save."""
    if not isinstance(value, dict) or type(value.get("enabled")) is not bool:
        raise ValidationError("Choose whether to enable organizer check-in.")
    names = value.get("players")
    if not isinstance(names, list) or any(not isinstance(name, str) for name in names):
        raise ValidationError("Submit a list of checked-in participants.")
    if len(set(names)) != len(names) or not set(names).issubset(players):
        raise ValidationError("Checked-in names must be unique and on the saved roster.")
    return {"enabled": value["enabled"], "players": names}
