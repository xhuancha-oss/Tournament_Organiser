"""HTTP contract consumed by the static frontend."""


def payload(**overrides):
    data = {
        "name": "2026 Campus Badminton Open",
        "start_time": "2026-11-20T09:00:00+08:00",
        "end_time": "2026-11-20T18:00:00+08:00",
        "format": "single_elimination",
        "description": "Welcome, students",
    }
    data.update(overrides)
    return data


def test_create_returns_201_and_the_tournament(organiser):
    client = organiser
    response = client.post("/api/tournaments", json=payload())

    assert response.status_code == 201
    body = response.get_json()
    assert isinstance(body["id"], int)
    assert body["name"] == "2026 Campus Badminton Open"
    assert body["start_time"] == "2026-11-20T01:00:00Z"
    assert body["end_time"] == "2026-11-20T10:00:00Z"
    assert body["format"] == "single_elimination"
    assert body["description"] == "Welcome, students"
    assert body["status"] == "upcoming"
    assert body["created_at"].endswith("Z")


def test_created_tournament_is_listed_and_readable(organiser):
    client = organiser
    created = client.post("/api/tournaments", json=payload()).get_json()

    listing = client.get("/api/tournaments").get_json()
    assert [item["id"] for item in listing["tournaments"]] == [created["id"]]

    single = client.get(f"/api/tournaments/{created['id']}")
    assert single.status_code == 200
    assert single.get_json() == {
        **created, "participant_count": 0, "completed_matches": 0, "total_matches": 0,
    }


def test_missing_tournament_returns_404_json(client):
    response = client.get("/api/tournaments/999")

    assert response.status_code == 404
    assert response.get_json() == {"message": "Tournament 999 does not exist.", "errors": {}}


def test_invalid_payload_returns_field_errors(organiser):
    client = organiser
    response = client.post("/api/tournaments", json=payload(name=""))

    assert response.status_code == 400
    body = response.get_json()
    assert body["message"] == "Tournament information is incomplete or invalid."
    assert body["errors"] == {"name": "Enter a tournament name."}


def test_time_zone_is_normalised_to_utc(organiser):
    client = organiser
    response = client.post(
        "/api/tournaments",
        json=payload(start_time="2026-11-20T01:00:00Z", end_time="2026-11-20T10:00:00Z"),
    )

    assert response.get_json()["start_time"] == "2026-11-20T01:00:00Z"


def test_non_json_body_is_rejected(organiser):
    client = organiser
    response = client.post("/api/tournaments", data="not json", content_type="application/json")

    assert response.status_code == 400
    assert response.get_json()["message"] == "Request body must be a JSON object."


def test_unknown_route_still_returns_json(client):
    response = client.get("/api/unknown")

    assert response.status_code == 404
    assert response.get_json()["message"] == "The requested URL was not found on the server. If you entered the URL manually please check your spelling and try again."


def test_local_frontend_can_call_the_api(client):
    response = client.get("/api/tournaments")

    assert response.headers["Access-Control-Allow-Origin"] == "*"


def test_home_serves_the_tournament_creation_page_and_assets(client):
    page = client.get("/")
    assert page.status_code == 200
    assert page.mimetype == "text/html"
    assert b'id="tournament-form"' in page.data

    stylesheet = client.get("/css/create-tournament.css")
    assert stylesheet.status_code == 200
    assert stylesheet.mimetype == "text/css"

    for filename in ("create-tournament.js", "config.js", "tournament-model.js",
                     "tournament-service.js"):
        response = client.get(f"/js/{filename}")
        assert response.status_code == 200
        assert response.mimetype in ("text/javascript", "application/javascript")

    assert client.get("/README.md").status_code == 404


def test_existing_tournament_workspace_saves_roster_matches_and_scores(organiser):
    client = organiser
    tournament_id = client.post("/api/tournaments", json=payload(format="round_robin")).get_json()["id"]
    path = f"/api/tournaments/{tournament_id}/workspace"
    assert client.get(path).get_json() == {"version": 0, "players": [], "matches": []}

    match = {
        "home": "Alex", "away": "Bai", "round": "Round 1",
        "starts_at": "2026-11-20T09:30", "scores": [2, 2],
    }
    workspace = {"version": 0, "players": ["Alex", "Bai"], "matches": [match]}
    response = client.put(path, json=workspace)
    assert response.status_code == 200
    saved = {**workspace, "version": 1}
    assert response.get_json() == saved
    assert client.get(path).get_json() == saved
    assert client.put(path, json=workspace).status_code == 409
    assert client.put(path, json={**saved, "players": ["Alex"]}).status_code == 400
    assert client.get(path).get_json() == saved

    corrected = {**match, "scores": [2, 1]}
    response = client.put(path, json={**saved, "matches": [corrected]})
    assert response.status_code == 200
    assert client.get(path).get_json() == {**saved, "version": 2, "matches": [corrected]}


def test_elimination_workspace_rejects_tied_scores(organiser):
    client = organiser
    tournament_id = client.post("/api/tournaments", json=payload()).get_json()["id"]
    response = client.put(f"/api/tournaments/{tournament_id}/workspace", json={
        "version": 0,
        "players": ["Alex", "Bai"],
        "matches": [{"home": "Alex", "away": "Bai", "scores": [1, 1]}],
    })
    assert response.status_code == 400
    assert "cannot end in a tie" in response.get_json()["message"]


def test_invalid_creation_fields_do_not_return_500_or_create_a_record(organiser):
    client = organiser
    invalid_date = client.post("/api/tournaments", json=payload(start_time="0001-01-01T00:00:00+14:00"))
    assert invalid_date.status_code == 400
    assert "start_time" in invalid_date.get_json()["errors"]

    invalid_description = client.post("/api/tournaments", json=payload(description=0))
    assert invalid_description.status_code == 400
    assert "description" in invalid_description.get_json()["errors"]
    assert client.get("/api/tournaments").get_json() == {"tournaments": []}


def test_round_robin_rejects_a_reversed_duplicate_fixture(organiser):
    client = organiser
    tournament_id = client.post("/api/tournaments", json=payload(format="round_robin")).get_json()["id"]
    path = f"/api/tournaments/{tournament_id}/workspace"
    workspace = {
        "version": 0,
        "players": ["Alex", "Bai"],
        "matches": [{"home": "Alex", "away": "Bai"}, {"home": "Bai", "away": "Alex"}],
    }
    assert client.put(path, json=workspace).status_code == 400
    assert client.get(path).get_json()["matches"] == []


def test_roster_save_checks_selected_count_and_persists_names(organiser, settings):
    client = organiser
    import json
    import sqlite3

    tournament_id = client.post("/api/tournaments", json=payload()).get_json()["id"]
    path = f"/api/tournaments/{tournament_id}/workspace"
    data = {"version": 0, "player_count": 3, "players": ["Alex", "Bai"], "matches": []}
    assert client.put(path, json=data).status_code == 400
    assert client.get(path).get_json()["players"] == []

    names = ["Alex", "Bai", "Chen"]
    assert client.put(path, json={**data, "players": names}).status_code == 200
    assert client.get(path).get_json()["players"] == names
    with sqlite3.connect(settings.db_path) as connection:
        row = connection.execute(
            "SELECT details FROM tournament_workspaces WHERE tournament_id = ?", (tournament_id,)
        ).fetchone()
    assert json.loads(row[0])["players"] == names


def test_organizer_check_in_persists_and_validates_roster_members(organiser):
    client = organiser
    tournament_id = client.post("/api/tournaments", json=payload()).get_json()["id"]
    path = f"/api/tournaments/{tournament_id}/workspace"
    original = {"version": 0, "players": ["Alex", "Bai"], "matches": []}
    attendance = {"enabled": True, "players": ["Bai"]}
    saved = client.put(path, json={**original, "check_in": attendance})
    assert saved.status_code == 200
    current = client.get(path).get_json()
    assert current["check_in"] == attendance

    invalid = {**current, "check_in": {**attendance, "players": ["Chen"]}}
    assert client.put(path, json=invalid).status_code == 400
    assert client.get(path).get_json() == current

    updated = client.put(path, json={"version": current["version"], "players": ["Alex"], "matches": []})
    assert updated.status_code == 200
    assert client.get(path).get_json()["check_in"] == {"enabled": True, "players": []}
