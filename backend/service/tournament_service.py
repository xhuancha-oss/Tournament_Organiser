"""Application service: coordinates the domain and the repository port."""

from __future__ import annotations

from typing import Any, Mapping

from domain.branding import validate_teams
from domain.bracket import resolve_bracket
from domain.exceptions import ConflictError, NotFoundError, ValidationError
from domain.repository import TournamentRepository
from domain.tournament import Format, Tournament
from domain.workspace import (
    round_robin_pair_counts, validate_check_in, validate_schedule_window, validate_workspace,
)


class TournamentService:
    def __init__(self, repository: TournamentRepository) -> None:
        self._repository = repository

    def create(self, payload: Mapping[str, Any], owner_id=None) -> Tournament:
        tournament = Tournament.from_payload(payload)
        return self._repository.add(tournament, owner_id)

    def list(self) -> list[Tournament]:
        return self._repository.list()

    def get(self, tournament_id: int) -> Tournament:
        tournament = self._repository.get(tournament_id)
        if tournament is None:
            raise NotFoundError(f"Tournament {tournament_id} does not exist.")
        return tournament


    def get_workspace(self, tournament_id: int) -> dict:
        self.get(tournament_id)
        return self._repository.get_workspace(tournament_id)

    @staticmethod
    def preview_bracket(tournament_format, size):
        if tournament_format not in (Format.SINGLE_ELIMINATION, Format.DOUBLE_ELIMINATION):
            raise ValidationError("Choose an elimination format to preview the bracket.")
        if not 2 <= size <= 32:
            raise ValidationError("Choose between 2 and 32 participants.")
        seeds = [f"Seed {number}" for number in range(1, size + 1)]
        return resolve_bracket(seeds, tournament_format, {}, preview=True)["games"]

    def save_workspace(self, tournament_id: int, payload: Mapping[str, Any]) -> dict:
        tournament = self.get(tournament_id)
        workspace = validate_workspace(payload, tournament.format, tournament.entry_type)
        current = self._repository.get_workspace(tournament_id)
        if current["version"] != workspace["version"]:
            raise ConflictError("This tournament changed in another tab. Reload it and try again.")
        if tournament.entry_type == "team":
            workspace["teams"] = validate_teams(payload.get("teams", current.get("teams", {})), workspace["players"])
        if tournament.format == Format.ROUND_ROBIN:
            pairs = round_robin_pair_counts(workspace["matches"])
            if any(count > 1 for count in pairs.values()):
                # Allow edits to previously saved fixtures without adding duplicates.
                existing = round_robin_pair_counts(current["matches"])
                if any(
                    count > max(1, existing[pair]) for pair, count in pairs.items()
                ):
                    participant = "team" if tournament.entry_type == "team" else "player"
                    raise ValidationError(f"A round robin can have only one match per {participant} pair.")
        if "check_in" in payload:
            workspace["check_in"] = validate_check_in(payload["check_in"], workspace["players"])
        elif "check_in" in current:
            attendance = current["check_in"]
            workspace["check_in"] = {
                **attendance,
                "players": [name for name in attendance["players"] if name in workspace["players"]],
            }
        if "bracket" in payload or "bracket" in current:
            self._apply_bracket(tournament, payload.get("bracket"), workspace, current)
        if "registration" in payload or "registration" in current:
            registration = self._registration(payload.get("registration", current.get("registration")))
            if "bracket" in workspace or any(match["scores"] is not None for match in workspace["matches"]):
                registration["open"] = False
            workspace["registration"] = registration
        validate_schedule_window(tournament, workspace)
        return self._repository.save_workspace(tournament_id, workspace)

    def _apply_bracket(self, tournament, submitted, workspace, current):
        if tournament.format == Format.ROUND_ROBIN or workspace["matches"]:
            raise ValidationError("Automatic brackets require an elimination event without manual fixtures.")
        if not isinstance(submitted, dict):
            raise ValidationError("The generated bracket must be included when saving.")
        if "bracket" in current and workspace["players"] != current["players"]:
            raise ValidationError("The seed order is locked once the bracket is generated.")
        if "bracket" in current and workspace.get("teams") != current.get("teams"):
            raise ValidationError("Team lineups are locked once the bracket is generated.")
        bracket = resolve_bracket(workspace["players"], tournament.format, submitted.get("entries", {}))
        if "bracket" in current:
            previous = {game["id"]: game for game in current["bracket"]["games"]}
            next_games = {game["id"]: game for game in bracket["games"]}
            for code, old in previous.items():
                if not old["scores"]:
                    continue
                new = next_games.get(code)
                if new and new["scores"] and (old["home"], old["away"]) != (new["home"], new["away"]):
                    raise ValidationError("Clear scores in affected later games before changing who advances.")
        workspace["bracket"] = bracket

    @staticmethod
    def _registration(value):
        if (not isinstance(value, dict) or type(value.get("open")) is not bool or
                type(value.get("published")) is not bool):
            raise ValidationError("Set valid registration and publication options.")
        return {"open": value["open"], "published": value["published"]}

    def register(self, tournament_id, name, team=None):
        tournament = self.get(tournament_id)
        current = self._repository.get_workspace(tournament_id)
        registration = current.get("registration", {})
        if not (registration.get("open") and registration.get("published")) or "bracket" in current:
            raise ConflictError("Registration is closed.")
        if tournament.entry_type == "team":
            if not isinstance(name, str) or not name.strip():
                raise ValidationError("Enter a team name.")
            name = name.strip()
        draft = {**current, "players": [*current["players"], name]}
        if tournament.entry_type == "team":
            draft["teams"] = {**current.get("teams", {}), name: team}
        return self.save_workspace(tournament_id, draft)

    def public_event(self, tournament_id):
        tournament = self.get(tournament_id)
        workspace = self._repository.get_workspace(tournament_id)
        registration = workspace.get("registration", {})
        if not registration.get("published"):
            raise NotFoundError("This tournament has not been published.")
        return {
            "tournament": self.summarize(tournament, workspace),
            "players": workspace["players"],
            "teams": workspace.get("teams", {}),
            "matches": workspace.get("bracket", {}).get("games", workspace["matches"]),
            "champion": workspace.get("bracket", {}).get("champion"),
            "registration_open": registration.get("open", False) and "bracket" not in workspace,
        }

    @classmethod
    def summarize(cls, tournament, workspace):
        matches = workspace.get("bracket", {}).get("games", workspace["matches"])
        participant_count = len(workspace["players"])
        total = len(matches)
        if tournament.format == Format.ROUND_ROBIN:
            total = max(total, participant_count * (participant_count - 1) // 2)
        return {
            **tournament.to_dict(), "status": cls.event_status(tournament, workspace),
            "participant_count": participant_count,
            "completed_matches": sum(match["scores"] is not None for match in matches),
            "total_matches": total,
        }

    def summary(self, tournament_id):
        return self.summarize(self.get(tournament_id), self._repository.get_workspace(tournament_id))

    def summaries(self, owner_id=None, include_shared=True):
        return [self.summarize(event, workspace) for event, workspace in
                self._repository.list_with_workspaces(owner_id, include_shared)]

    @staticmethod
    def event_status(tournament, workspace):
        if "bracket" in workspace:
            bracket = workspace["bracket"]
            if bracket["champion"]:
                return "completed"
            matches = bracket["games"]
        else:
            matches = workspace["matches"]
            count = len(workspace["players"])
            if (tournament.format == Format.ROUND_ROBIN and count > 1 and
                    len(matches) == len(round_robin_pair_counts(matches)) == count * (count - 1) // 2 and
                    all(match["scores"] is not None for match in matches)):
                return "completed"
        if any(match["scores"] is not None for match in matches):
            return "in_progress"
        return "scheduled" if matches else "upcoming"
