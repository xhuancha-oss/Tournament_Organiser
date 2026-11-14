"""Business rules of the tournament aggregate."""

import pytest

from domain.exceptions import ValidationError
from domain.tournament import Tournament


def payload(**overrides):
    data = {
        "name": "  Campus Open  ",
        "start_time": "2026-11-20T09:00:00+08:00",
        "end_time": "2026-11-20T18:00:00+08:00",
        "format": "single_elimination",
        "description": " Welcome ",
    }
    data.update(overrides)
    return data


def test_from_payload_normalises_and_converts_to_utc():
    tournament = Tournament.from_payload(payload())

    assert tournament.id is None
    assert tournament.name == "Campus Open"
    assert tournament.start_time == "2026-11-20T01:00:00Z"
    assert tournament.end_time == "2026-11-20T10:00:00Z"
    assert tournament.format == "single_elimination"
    assert tournament.description == "Welcome"
    assert tournament.status == "upcoming"


def test_from_payload_accepts_utc_zulu_times():
    tournament = Tournament.from_payload(
        payload(start_time="2026-11-20T01:00:00Z", end_time="2026-11-20T10:00:00Z")
    )

    assert tournament.start_time == "2026-11-20T01:00:00Z"
    assert tournament.end_time == "2026-11-20T10:00:00Z"


def test_from_payload_defaults_description():
    tournament = Tournament.from_payload(payload(description=None))

    assert tournament.description == ""


@pytest.mark.parametrize(
    ("overrides", "field", "message"),
    [
        ({"name": "   "}, "name", "Enter a tournament name."),
        ({"name": "x" * 81}, "name", "Tournament name cannot exceed 80 characters."),
        ({"start_time": ""}, "start_time", "Choose a valid start time."),
        ({"start_time": "not-a-date"}, "start_time", "Choose a valid start time."),
        ({"start_time": "2026-11-20T09:00:00"}, "start_time", "Choose a valid start time."),
        ({"end_time": "2026-11-20T08:00:00+08:00"}, "end_time", "End time must be later than start time."),
        ({"format": "group_knockout"}, "format", "Choose a valid tournament format."),
        ({"description": "x" * 1001}, "description", "Tournament description cannot exceed 1000 characters."),
    ],
)
def test_validation_errors_are_reported_per_field(overrides, field, message):
    with pytest.raises(ValidationError) as caught:
        Tournament.from_payload(payload(**overrides))

    assert caught.value.errors == {field: message}
    assert caught.value.message == "Tournament information is incomplete or invalid."


def test_tie_in_end_time_is_the_same_error():
    with pytest.raises(ValidationError) as caught:
        Tournament.from_payload(payload(end_time="2026-11-20T09:00:00+08:00"))

    assert caught.value.errors["end_time"] == "End time must be later than start time."


def test_multiple_errors_are_collected_together():
    with pytest.raises(ValidationError) as caught:
        Tournament.from_payload(payload(name="", format=""))

    assert set(caught.value.errors) == {"name", "format"}


def test_to_dict_exposes_the_api_shape():
    tournament = Tournament.from_payload(payload())

    assert tournament.to_dict() == {
        "id": None,
        "name": "Campus Open",
        "start_time": "2026-11-20T01:00:00Z",
        "end_time": "2026-11-20T10:00:00Z",
        "format": "single_elimination",
        "description": "Welcome",
        "status": "upcoming",
        "created_at": "",
        "entry_type": "individual",
        "logo": "",
    }
