# Tournament Manager — Backend

Flask + SQLite API for the tournament management frontend. The static page in
`tournament-create-frontend/` submits `POST /api/tournaments`; this service
validates, stores and returns the tournament.

## Architecture

```text
            ┌─────────┐
            │ server  │  composition root: settings, pool, wiring, start-up
            └────┬────┘
                 │ constructs / injects
     ┌───────────┼────────────┐
     ▼           ▼            ▼
 ┌───────┐  ┌─────────┐  ┌───────┐
 │  api  │─▶│ service │  │  db   │
 └───────┘  └────┬────┘  └───┬───┘
                 │            │ implements
                 ▼            │
            ┌─────────┐       │
            │ domain  │◀──────┘
            └─────────┘
```

| Layer | Package | Responsibility | May import |
| --- | --- | --- | --- |
| server | `server/` | Settings, composition root, local entry point | everything |
| api | `api/` | HTTP routes, JSON error envelope | service, domain |
| service | `service/` | Use cases; turns a request into a domain operation | domain |
| db | `db/` | SQLite pool, schema, repository implementation | domain |
| domain | `domain/` | `Tournament` aggregate, formats and validation rules | stdlib only |

Dependencies point inward: `api → service → domain`, `db → domain`, and only
`server` knows all of them. The domain never imports Flask or SQLite, so the
rules are testable without a server or a database.

```text
backend/
  server/config.py           Settings (host, port, db path, pool size)
  server/app.py              create_app(): the only place that wires layers
  server/run.py              waitress entry point
  api/tournaments.py         POST /api/tournaments, GET list, GET by id
  api/errors.py              domain/HTTP errors → JSON
  service/tournament_service.py
  db/pool.py                 thread-safe SQLite connection pool (WAL)
  db/schema.sql              tournaments table
  db/tournament_repository.py
  domain/tournament.py       aggregate + validation
  domain/repository.py       TournamentRepository port
  domain/exceptions.py       DomainError / ValidationError / NotFoundError
  tests/                     domain, repository and HTTP tests
```

## Run locally

Keep `backend/` and `tournament-create-frontend/` next to each other in the
project root. From that root, install the dependencies and start the app.

```bash
cd backend
python3 -m pip install -r requirements.txt
python3 -m server.run
```

If you are already in `backend/`, skip `cd backend`. Once the dependencies
are installed, restart the app with `python3 -m server.run`.

Open [the tournament creation page](http://127.0.0.1:5000/) in your browser.
Flask serves the page and API on the same port. Submitting the form calls
`POST /api/tournaments` and saves the tournament to SQLite.

To check the saved records, open [the tournament list API](http://127.0.0.1:5000/api/tournaments).
An empty database returns `{"tournaments":[]}`.

### Run a tournament

1. Create an event and open **Configure matches**, or select an existing event
   from **Tournaments**.
2. In **Players**, select the number of players or teams and fill in the numbered
   fields in seed order. Click **Save players**, or **Save and set up matches**
   to save the roster and continue to Bracket. To collect names through the
   event page, enable **Show read-only event page** and
   **Accept participant sign-ups**, save the options, and open the event page.
   Accepted names go straight into the roster. The event page starts unpublished.
   Under **Organizer check-in**, turn on attendance tracking and mark arrivals.
   Click **Save attendance** to persist the checklist. Tracking attendance does
   not automatically remove entrants from the schedule.
3. In **Bracket**, generate a round robin or a seeded single- or double-elimination
   bracket. For elimination, the roster is locked when the bracket is generated,
   byes advance automatically, and subsequent match slots fill in as scores arrive.
   Double elimination includes a final reset if the lower bracket winner wins the
   first grand final. Existing manual fixtures remain editable.
4. Set match times inside the event window. Use **Record score** on a match in
   **Bracket**, or open **Scores** and filter the match queue by status.
   New times are stored in UTC and displayed in the viewer's local timezone.
   Correct a scored downstream match before changing an earlier result that affects it.
5. Use **Results** to see match results, the elimination champion or the round
   robin standings, and download a JSON results file. The event page displays
   the current schedule and results. The tournament list shows the status
   derived from the saved schedule and scores.

Round robin uses 3 points for a win, 1 for a draw and 0 for a loss. Teams with
equal points are ordered by score difference, then by points scored.

This app is intended for a trusted local environment on `127.0.0.1`. The event
page has a read-only UI and optional name-based sign-up. Organizer API routes
have no login or permissions. For internet use, organizer authentication,
permissions, signup verification and abuse protection are still needed.
Participant self check-in, participant score reporting, dispute handling, Swiss
and multistage formats are outside this version.

### Backend settings

Override the defaults with `TOS_HOST`, `TOS_PORT`, `TOS_DB_PATH` and
`TOS_POOL_SIZE`. The SQLite file defaults to `backend/var/tournaments.db`,
and the server applies the schema on startup.

## API

### `POST /api/tournaments`

```json
{
  "name": "2026 Campus Badminton Open",
  "start_time": "2026-11-20T01:00:00Z",
  "end_time": "2026-11-20T10:00:00Z",
  "format": "single_elimination",
  "description": "Welcome, students"
}
```

- `201 Created` with the stored tournament, including `id`, `status` and
  `created_at`.
- Times are stored in UTC (`...Z`); clients send local time converted to UTC.
- `format` is `single_elimination`, `double_elimination` or `round_robin`.

Validation failures return `400`:

```json
{
  "message": "Tournament information is incomplete or invalid.",
  "errors": { "name": "Enter a tournament name." }
}
```

### `GET /api/tournaments`

```json
{ "tournaments": [ { "id": 1, "name": "..." } ] }
```

### `GET /api/tournaments/<id>`

Returns one tournament, or `404` with a JSON `message`.

### `GET /api/tournaments/<id>/workspace`

Returns the roster, match schedule and saved scores. Existing tournaments with
no configuration start with `{"version":0,"players":[],"matches":[]}`.

### `PUT /api/tournaments/<id>/workspace`

Saves the roster and matches using the current `version`. Each match has
`home`, `away`, `round`, `starts_at` (optional UTC timestamp; older local values
remain readable) and
`scores` (two integers or `null`). The server returns the new version. If another
save has already replaced the submitted version, the request returns `409`.
Optional `bracket.entries` contains the scores and times keyed by game ID.
The server derives bracket participants and winners. Optional `registration`
contains the `published` and `open` flags. Optional `check_in` contains
`enabled` and the list of checked-in roster names in `players`.

### `GET /api/public/tournaments/<id>`

Returns the roster, schedule, score results and status for a published event.

### `POST /api/public/tournaments/<id>/register`

Accepts a JSON object with a `name` while the event's sign-up is open.


## Tests

```bash
cd backend
python3 -m pytest
```

Tests use a temporary SQLite file per test; no running server is required.
