"""Local entry point: serve the frontend and API on 127.0.0.1 with waitress."""

from waitress import serve

from server.app import create_app
from server.config import Settings


def main() -> None:
    settings = Settings.from_env()
    app = create_app(settings)
    print(f"Tournament Manager listening on http://{settings.host}:{settings.port}")
    serve(app, host=settings.host, port=settings.port, threads=8)


if __name__ == "__main__":
    main()
