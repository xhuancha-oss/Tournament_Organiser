"""Generate elimination games from a fixed seed order and submitted scores."""

from domain.exceptions import ValidationError
from domain.workspace import _score, match_time


def resolve_bracket(players, tournament_format, entries, *, preview=False):
    if len(players) < 2:
        raise ValidationError("Save at least two participants before generating a bracket.")
    if not isinstance(entries, dict):
        raise ValidationError("Bracket entries must be an object.")

    games = []
    outcomes = {}
    used = set()

    def game(code, label, first, second):
        # A bye is known to be empty. A pending slot still has an upstream game.
        if first is None or second is None:
            return (first or second), None
        home, home_label = first
        away, away_label = second
        raw = entries.get(code, {})
        if not isinstance(raw, dict):
            raise ValidationError("Each bracket entry must be an object.")
        starts_at = match_time(raw.get("starts_at", ""))
        scores = raw.get("scores")
        winner = loser = None
        if scores is not None:
            if not home or not away or not isinstance(scores, list) or len(scores) != 2:
                raise ValidationError("Both participants must be decided before recording a score.")
            scores = [_score(score) for score in scores]
            if scores[0] == scores[1]:
                raise ValidationError("Elimination matches cannot end in a tie.")
            winner, loser = (home, away) if scores[0] > scores[1] else (away, home)
        games.append({
            "id": code, "round": label, "home": home, "away": away,
            "home_label": home_label, "away_label": away_label,
            "starts_at": starts_at, "scores": scores,
        })
        used.add(code)
        outcomes[code] = {"starts_at": starts_at, "scores": scores}
        return (winner, f"Winner of {code}"), (loser, f"Loser of {code}")

    seeds = [1, 2]
    while len(seeds) < len(players):
        seeds = [slot for seed in seeds for slot in (seed, len(seeds) * 2 + 1 - seed)]
    slots = [(players[seed - 1], players[seed - 1]) if seed <= len(players) else None for seed in seeds]
    round_number = 1
    losers = []
    while len(slots) > 1:
        winners = []
        dropped = []
        for index in range(0, len(slots), 2):
            winner, loser = game(
                f"W{round_number}-{index // 2 + 1}", f"Winners round {round_number}", *slots[index:index + 2]
            )
            winners.append(winner)
            dropped.append(loser)
        losers.append(dropped)
        slots = winners
        round_number += 1

    champion = slots[0][0]
    if tournament_format == "double_elimination":
        survivors = losers[0]
        lower_round = 1
        for incoming in losers[1:]:
            survivors = [
                game(f"L{lower_round}-{index // 2 + 1}", f"Lower round {lower_round}",
                     *survivors[index:index + 2])[0]
                for index in range(0, len(survivors), 2)
            ]
            lower_round += 1
            # Cross halves where possible to avoid an immediate rematch.
            if len(incoming) > 1 and (lower_round // 2) % 2:
                incoming = incoming[::-1]
            survivors = [
                game(f"L{lower_round}-{index + 1}", f"Lower round {lower_round}", left, right)[0]
                for index, (left, right) in enumerate(zip(survivors, incoming))
            ]
            lower_round += 1

        upper, lower = slots[0], survivors[0]
        grand_winner, _ = game("GF", "Grand final", upper, lower)
        champion = grand_winner[0]
        if champion and champion == lower[0]:
            reset_winner, _ = game("GF2", "Grand final reset", upper, lower)
            champion = reset_winner[0]

        if preview:
            games.append({
                "id": "GF2", "round": "Grand final reset", "home": None, "away": None,
                "home_label": "Upper bracket finalist", "away_label": "Lower bracket finalist",
                "starts_at": "", "scores": None, "conditional": True,
            })

    if any(
        code != "GF2" or not isinstance(entries[code], dict) or entries[code].get("scores") is not None
        for code in set(entries) - used
    ):
        raise ValidationError("A submitted score or time belongs to a game outside the current bracket.")
    return {"entries": outcomes, "games": games, "champion": champion}
