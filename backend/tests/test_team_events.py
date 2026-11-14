import pytest

from tests.test_api import payload


LOGO = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAw"
        "CAAAAC0lEQVR42mP8/x8AAwMCAO/aCkQAAAAASUVORK5CYII=")


def test_team_event_branding_and_lineups_survive_public_registration_and_scoring(organiser, app):
    result = organiser.post("/api/tournaments", json=payload(entry_type="team", logo=LOGO))
    assert result.status_code == 201
    event = result.json
    assert (event["entry_type"], event["logo"]) == ("team", LOGO)
    base = f"/api/tournaments/{event['id']}"
    path = base + "/workspace"
    north = {"logo": LOGO, "members": [{"name": "Lan", "logo": LOGO}, {"name": "Wei", "logo": ""}]}
    setup = {"version": 0, "players": ["North"], "matches": [],
             "registration": {"open": True, "published": True}}
    assert organiser.put(path, json=setup).status_code == 400
    assert organiser.put(path, json={**setup, "teams": {"North": north}}).status_code == 200
    visitor = app.test_client()
    public = f"/api/public/tournaments/{event['id']}"
    assert visitor.post(public + "/register", json={"name": "South"}).status_code == 400
    south = {"logo": "", "members": [{"name": "Lin"}]}
    assert visitor.post(public + "/register", json={"name": "South", "team": south}).status_code == 201
    current = organiser.get(path).json
    assert current["players"] == ["North", "South"]
    assert current["teams"]["North"] == north
    assert visitor.get(public).json["teams"] == current["teams"]

    bracket = organiser.put(path, json={**current, "bracket": {"entries": {}}}).json
    assert visitor.post(public + "/register", json={"name": "West", "team": south}).status_code == 409
    modified = {"North": south, "South": current["teams"]["South"]}
    assert organiser.put(path, json={**bracket, "teams": modified}).status_code == 400
    game = bracket["bracket"]["games"][0]
    scores = {"entries": {game["id"]: {"scores": [0, 2]}}}
    saved = organiser.put(path, json={**bracket, "bracket": scores})
    assert saved.status_code == 200
    assert saved.json["teams"] == current["teams"]
    assert visitor.get(public).json["champion"] == "South"
    assert organiser.get(base).json["logo"] == LOGO


@pytest.mark.parametrize("logo", ["https://example.com/a.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,Z2FyYmFnZQ=="])
def test_rejects_untrusted_logo_inputs(organiser, logo):
    response = organiser.post("/api/tournaments", json=payload(logo=logo))
    assert response.status_code == 400
    assert "logo" in response.json["errors"]


def test_logo_and_team_type_persist_in_creation_draft(organiser):
    draft = {"name": "Draft", "start_time": "", "end_time": "", "description": "",
             "format": "round_robin", "entry_type": "team", "logo": LOGO}
    assert organiser.put("/api/account/draft", json={"draft": draft}).status_code == 200
    assert organiser.get("/api/account").json["draft"] == draft
