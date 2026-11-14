"""Errors raised by the domain layer.

The HTTP layer translates these into JSON responses; the domain never imports
Flask or any other delivery concern.
"""

from typing import Optional


class DomainError(Exception):
    """Base class for failures that belong to the business rules."""

    status_code = 400

    def __init__(self, message: str, errors: Optional[dict[str, str]] = None) -> None:
        super().__init__(message)
        self.message = message
        self.errors = dict(errors or {})


class ValidationError(DomainError):
    """Submitted data does not satisfy the tournament rules."""

    status_code = 400


class NotFoundError(DomainError):
    """The requested aggregate does not exist."""

    status_code = 404


class ConflictError(DomainError):
    """The submitted workspace version has already been replaced."""

    status_code = 409
