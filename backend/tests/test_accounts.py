from server.app import create_app


def test_account_sessions_drafts_preferences_and_tournament_access(app, settings):
    alice = app.test_client()
    bob = app.test_client()
    guest = app.test_client()
    credentials = {"username": "Alice_1", "password": "example-pass-123"}
    event = {"name": "Autumn cup", "format": "round_robin",
             "start_time": "2026-11-14T00:00:00Z", "end_time": "2026-11-15T00:00:00Z"}
    assert guest.get("/api/account/tournaments").status_code == 401
    assert guest.post("/api/tournaments", json={**event, "for_account": True}).status_code == 401
    assert guest.post("/api/tournaments", json=event).status_code == 401
    shared = app.extensions["tournament_service"].create(event).to_dict()
    response = alice.post("/api/account/register", json=credentials)
    assert response.status_code == 201
    assert "HttpOnly" in response.headers["Set-Cookie"]
    assert "SameSite=Lax" in response.headers["Set-Cookie"]
    token = response.headers["Set-Cookie"].split(";", 1)[0]
    assert bob.post("/api/account/register", json={**credentials, "username": "alice_1"}).status_code == 409
    assert bob.post("/api/account/register", json={**credentials, "username": "Bob_1"}).status_code == 201

    original = {"name": "Unfinished cup", "format": "round_robin", "description": "",
                "start_time": "", "end_time": ""}
    preferences = {"night_mode": True, "sidebar_color": "forest"}
    assert alice.put("/api/account/draft", json={"draft": original}).status_code == 200
    assert alice.put("/api/account/settings", json=preferences).status_code == 200
    assert alice.put("/api/account/settings", json=preferences,
                     headers={"Origin": "https://other.example"}).status_code == 403
    owned = alice.post("/api/tournaments", json={**event, "for_account": True}).json
    assert [item["id"] for item in alice.get("/api/account/tournaments").json["tournaments"]] == [owned["id"]]
    assert [item["id"] for item in alice.get("/api/account/tournaments").json["shared"]] == [shared["id"]]
    old_id = alice.get("/api/account").json["account"]["id"]
    assert bob.put("/api/account/draft", json={"draft": original, "account_id": old_id}).status_code == 409
    assert bob.post("/api/tournaments", json={**event, "for_account": True, "account_id": old_id}).status_code == 409
    assert bob.get("/api/account").json["draft"] is None
    assert bob.get("/api/account/tournaments").json["tournaments"] == []
    assert [item["id"] for item in bob.get("/api/tournaments").json["tournaments"]] == [shared["id"]]
    path = f"/api/tournaments/{owned['id']}/workspace"
    assert bob.get(path).status_code == 404
    assert bob.put(path, json={}).status_code == 404

    restarted = create_app(settings)
    with restarted.test_client(use_cookies=False) as client:
        assert client.get("/api/account", headers={"Cookie": token}).json["settings"] == preferences
    assert alice.post("/api/account/logout").status_code == 200
    with restarted.test_client(use_cookies=False) as client:
        assert client.get("/api/account", headers={"Cookie": token}).json["account"] is None
    assert alice.post("/api/account/login", json={**credentials, "password": "wrong-password"}).status_code == 401
    assert alice.post("/api/account/login", json=credentials).status_code == 200
    assert alice.get("/api/account").json["draft"] == original
    assert alice.put("/api/account/draft", json={"draft": None}).status_code == 200
    assert alice.get("/api/account").json["draft"] is None

def test_guests_cannot_edit_or_remove_scores_even_for_shared_tournaments(app, organiser):
    guest = app.test_client()
    service = app.extensions["tournament_service"]
    tournament = service.create({
        "name": "Earlier shared cup", "format": "round_robin",
        "start_time": "2026-11-14T00:00:00Z", "end_time": "2026-11-15T00:00:00Z",
    })
    path = f"/api/tournaments/{tournament.id}/workspace"
    match = {"home": "Alex", "away": "Bai", "scores": [11, 7]}
    original = organiser.put(path, json={
        "version": 0, "players": ["Alex", "Bai"], "matches": [match],
    }).json
    assert guest.get(path).json == original
    for matches in ([{**match, "scores": [7, 11]}], [{**match, "scores": None}], []):
        assert guest.put(path, json={**original, "matches": matches}).status_code == 401
    assert organiser.put(path, json={**original, "account_id": -1}).status_code == 409
    assert organiser.post("/api/account/logout").status_code == 200
    assert organiser.put(path, json=original).status_code == 401
    assert guest.get(path).json == original
