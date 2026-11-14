"""Tournament aggregate and the business rules it enforces.

Pure Python: no database, HTTP or framework imports live here.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Mapping, Optional

from domain.branding import validate_entry_type, validate_logo
from domain.exceptions import ValidationError

MAX_NAME_LENGTH = 80
MAX_DESCRIPTION_LENGTH = 1000
DEFAULT_STATUS = "upcoming"
INVALID_PAYLOAD_MESSAGE = "Tournament information is incomplete or invalid."


class Format(str, Enum):
    """Competition formats the manager supports."""

    SINGLE_ELIMINATION = "single_elimination"
    DOUBLE_ELIMINATION = "double_elimination"
    ROUND_ROBIN = "round_robin"


FORMAT_VALUES = frozenset(item.value for item in Format)


def format_timestamp(moment: datetime) -> str:
    """Render an aware datetime as UTC ISO 8601, e.g. 2026-11-20T01:00:00Z."""

    return moment.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _parse_timestamp(value: Any, field: str, errors: dict[str, str]) -> Optional[datetime]:
    message = "Choose a valid start time." if field == "start_time" else "Choose a valid end time."
    if not isinstance(value, str) or not value.strip():
        errors[field] = message
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        if parsed.tzinfo is not None:
            return parsed.astimezone(timezone.utc)
    except (ValueError, OverflowError):
        pass
    errors[field] = message
    return None


@dataclass(frozen=True)
class Tournament:
    """A tournament as stored by the manager.

    Times are always UTC ISO 8601 strings; clients enter local times and convert
    them before submitting.
    """

    id: Optional[int]
    name: str
    start_time: str
    end_time: str
    format: str
    description: str
    status: str
    created_at: str
    entry_type: str = "individual"
    logo: str = ""

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "Tournament":
        """Build a new tournament, raising ValidationError with field errors."""

        errors: dict[str, str] = {}

        name = payload.get("name")
        if not isinstance(name, str) or not name.strip():
            errors["name"] = "Enter a tournament name."
        else:
            name = name.strip()
            if len(name) > MAX_NAME_LENGTH:
                errors["name"] = "Tournament name cannot exceed 80 characters."

        start = _parse_timestamp(payload.get("start_time"), "start_time", errors)
        end = _parse_timestamp(payload.get("end_time"), "end_time", errors)
        if start is not None and end is not None and end <= start:
            errors["end_time"] = "End time must be later than start time."

        tournament_format = payload.get("format")
        if not isinstance(tournament_format, str) or tournament_format not in FORMAT_VALUES:
            errors["format"] = "Choose a valid tournament format."

        description = payload.get("description")
        if description is None:
            description = ""
        if not isinstance(description, str):
            errors["description"] = "Tournament description must be text."
        else:
            description = description.strip()
            if len(description) > MAX_DESCRIPTION_LENGTH:
                errors["description"] = "Tournament description cannot exceed 1000 characters."

        entry_type = payload.get("entry_type", "individual")
        logo = payload.get("logo")
        for key, validator, value in (("entry_type", validate_entry_type, entry_type), ("logo", validate_logo, logo)):
            try:
                validator(value)
            except ValidationError as error:
                errors[key] = error.message

        if errors:
            raise ValidationError(INVALID_PAYLOAD_MESSAGE, errors)

        return cls(
            id=None,
            name=name,
            start_time=format_timestamp(start),
            end_time=format_timestamp(end),
            format=tournament_format,
            description=description,
            status=DEFAULT_STATUS,
            created_at="",
            entry_type=entry_type,
            logo=logo or "",
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "format": self.format,
            "description": self.description,
            "status": self.status,
            "created_at": self.created_at,
            "entry_type": self.entry_type,
            "logo": self.logo,
        }
