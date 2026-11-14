from collections import Counter

import pytest

from domain.bracket import resolve_bracket
from domain.exceptions import ValidationError


def event(client, format):
    response = client.post("/api/tournaments", json={
        "name": "Campus Open",
        "format": format,
        "start_time": "2026-11-20T01:00:00Z",
        "end_time": "2026-11-20T10:00:00Z",
    })
    assert response.status_code == 201
    return response.get_json()["id"]


@pytest.mark.parametrize("count", range(2, 33))
@pytest.mark.parametrize("format", ["single_elimination", "double_elimination"])
def test_elimination_completes_with_byes_and_expected_number_of_losses(count, format):
    players = [f"Player {i}" for i in range(count)]
    entries = {}
    losses = Counter()
    while True:
        bracket = resolve_bracket(players, format, entries)
        assert len(entries) <= 2 * count - 1
        if bracket["champion"]:
            break
        game = next(g for g in bracket["games"] if g["home"] and g["away"] and not g["scores"])
        assert game["home"] != game["away"]
        home_wins = game["id"] != "GF"
        losses[game["away"] if home_wins else game["home"]] += 1
        entries[game["id"]] = {"scores": [2, 1] if home_wins else [1, 2]}

    expected = 1 if format == "single_elimination" else 2
    assert all(losses[player] == expected for player in players if player != bracket["champion"])
    assert losses[bracket["champion"]] < expected
    if format == "double_elimination":
        assert "GF2" in entries


def test_public_signup_bracket_advancement_and_results_share_the_same_record(organiser, app):
    client = organiser
    visitor = app.test_client()
    tournament_id = event(client, "single_elimination")
    workspace = f"/api/tournaments/{tournament_id}/workspace"
    public = f"/api/public/tournaments/{tournament_id}"
    assert client.get(public).status_code == 404
    assert visitor.post(public + "/register", json={"name": "Alex"}).status_code == 409
    response = client.put(workspace, json={
        "version": 0, "players": ["Alex", "Bai"], "matches": [],
        "registration": {"open": True, "published": True},
    })
    assert response.status_code == 200
    assert visitor.post(public + "/register", json={"name": "Chen"}).status_code == 201
    assert visitor.post(public + "/register", json={"name": "CHEN"}).status_code == 400
    current = client.get(workspace).get_json()
    assert current["players"] == ["Alex", "Bai", "Chen"]
    generated = client.put(workspace, json={**current, "bracket": {"entries": {}}})
    assert generated.status_code == 200
    current = generated.get_json()
    registration = client.get(public).get_json()
    assert registration["tournament"]["status"] == "scheduled"
    assert registration["registration_open"] is False
    assert visitor.post(public + "/register", json={"name": "Drew"}).status_code == 409
    first, final = current["bracket"]["games"]
    entries = {**current["bracket"]["entries"], final["id"]: {"scores": [2, 1]}}
    assert client.put(workspace, json={**current, "bracket": {"entries": entries}}).status_code == 400
    entries[first["id"]] = {"scores": [2, 1]}
    response = client.put(workspace, json={**current, "bracket": {"entries": entries}})
    assert response.status_code == 200
    public_result = client.get(public).get_json()
    assert public_result["tournament"]["status"] == "completed"
    assert public_result["champion"] == "Alex"
    entries[first["id"]] = {"scores": [1, 2]}
    assert client.put(workspace, json={**response.get_json(), "bracket": {"entries": entries}}).status_code == 400


def test_new_match_times_must_fit_the_tournament_window(organiser):
    client = organiser
    tournament_id = event(client, "round_robin")
    path = f"/api/tournaments/{tournament_id}/workspace"
    match = {"home": "Alex", "away": "Bai", "starts_at": "2026-11-20T00:30:00Z"}
    data = {"version": 0, "players": ["Alex", "Bai"], "matches": [match]}
    response = client.put(path, json=data)
    assert response.status_code == 400
    assert response.get_json()["message"] == (
        "Invalid match time. Choose a time between 2026-11-20 01:00:00 "
        "and 2026-11-20 10:00:00 (UTC)."
    )
    match["starts_at"] = "2026-11-20T02:00:00Z"
    assert client.put(path, json=data).status_code == 200


def test_elimination_only_unlocks_matches_with_two_qualified_players():
    players = [f"Player {i}" for i in range(1, 9)]
    entries = {"W1-1": {"scores": [11, 2]}}
    games = {game["id"]: game for game in resolve_bracket(players, "single_elimination", entries)["games"]}
    assert (games["W2-1"]["home"], games["W2-1"]["away"]) == ("Player 1", None)
    assert (games["W2-2"]["home"], games["W2-2"]["away"]) == (None, None)
    assert (games["W3-1"]["home"], games["W3-1"]["away"]) == (None, None)
    with pytest.raises(ValidationError, match="Both participants must be decided"):
        resolve_bracket(players, "single_elimination", {**entries, "W2-1": {"scores": [11, 6]}})
    entries["W1-2"] = {"scores": [3, 11]}
    games = {game["id"]: game for game in resolve_bracket(players, "single_elimination", entries)["games"]}
    assert (games["W2-1"]["home"], games["W2-1"]["away"]) == ("Player 1", "Player 5")
    assert not games["W1-3"]["scores"]


def test_bracket_preview_matches_seeded_draw_and_only_previews_reset(client):
    path = "/api/tournaments/bracket-preview"
    assert client.get(path, query_string={"format": "round_robin", "size": 4}).status_code == 400
    assert client.get(path, query_string={"format": "double_elimination", "size": 33}).status_code == 400
    response = client.get(path, query_string={"format": "double_elimination", "size": 5})
    assert response.status_code == 200
    preview = response.json["games"]
    games = resolve_bracket([f"Seed {i}" for i in range(1, 6)], "double_elimination", {})["games"]
    assert preview[:-1] == games
    assert any(game["id"].startswith("L") and "Loser of" in
               f"{game['home_label']} {game['away_label']}" for game in games)
    assert preview[-1]["id"] == "GF2"
    assert preview[-1]["conditional"] is True
    assert preview[-1]["scores"] is None
