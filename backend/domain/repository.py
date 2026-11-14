"""Persistence port for tournaments.

The db layer implements this interface; service depends only on the abstraction.
"""

from abc import ABC, abstractmethod
from typing import Optional

from domain.tournament import Tournament


class TournamentRepository(ABC):
    @abstractmethod
    def add(self, tournament: Tournament, owner_id: Optional[int] = None) -> Tournament:
        """Persist a new tournament and return it with a generated id."""

    @abstractmethod
    def get(self, tournament_id: int) -> Optional[Tournament]:
        """Return one tournament, or None when it does not exist."""

    @abstractmethod
    def list(self) -> list[Tournament]:
        """Return all tournaments, newest first."""


    @abstractmethod
    def get_workspace(self, tournament_id: int) -> dict:
        """Return saved match configuration or an empty workspace."""

    @abstractmethod
    def save_workspace(self, tournament_id: int, workspace: dict) -> dict:
        """Replace match configuration if the submitted version is current."""


    @abstractmethod
    def list_with_workspaces(self, owner_id: Optional[int] = None, include_shared: bool = True) -> list:
        """Return tournaments paired with their current configuration."""
