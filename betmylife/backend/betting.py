"""Fixed-odds betting on challenges: live odds lean away from the side holding the money.

Odds are never stored per bet in the challenge row. They are derived on read from three
numbers the challenge row already carries: the ML probability (the opening line) and the
running YES/NO stake totals, so showing live odds costs no extra queries.
"""

import math
import time
from datetime import datetime, timedelta

MIN_STAKE = 10
MAX_STAKE = 200
# Matches PREDICTION_LOCK_BEFORE_DEADLINE_MS in src/utils/predictions.ts.
LOCK_BEFORE_DEADLINE = timedelta(hours=1)
# Virtual points the ML opening line is worth. Keep this well above MAX_STAKE so a single
# bet nudges the odds instead of swinging them.
POOL_LIQUIDITY = 1000
# House edge taken off every price, so the points economy does not inflate from payouts.
# 0.05 pays 95% of fair odds: even money (2.00) is offered at 1.90.
HOUSE_MARGIN = 0.05
MIN_IMPLIED_PROBABILITY = 0.02
MIN_ODDS = 1.01

STAKE_REASON = "BET_STAKE:{}"
PAYOUT_REASON = "BET_PAYOUT:{}"
# Ledger rows the server writes into a user's wallet without that user's client being involved.
SERVER_LEDGER_PREFIXES = ("BET_STAKE:", "BET_PAYOUT:")


def live_yes_probability(probability: float, yes_pool: int, no_pool: int) -> float:
    """Blend the ML probability with the money staked so far."""
    p = (probability * POOL_LIQUIDITY + yes_pool) / (POOL_LIQUIDITY + yes_pool + no_pool)
    return min(max(p, MIN_IMPLIED_PROBABILITY), 1 - MIN_IMPLIED_PROBABILITY)


def live_odds(
    probability: float,
    opening_yes: float,
    opening_no: float,
    yes_pool: int,
    no_pool: int,
) -> tuple[float, float]:
    """Scale the ML opening odds by how far the money has moved the implied probability.

    With empty pools this is the opening odds less the house margin, so the ML model's
    own caps still shape the line until someone bets.
    """
    probability = min(max(probability, MIN_IMPLIED_PROBABILITY), 1 - MIN_IMPLIED_PROBABILITY)
    p_yes = live_yes_probability(probability, yes_pool, no_pool)
    keep = 1 - HOUSE_MARGIN
    yes_odds = opening_yes * probability / p_yes * keep
    no_odds = opening_no * (1 - probability) / (1 - p_yes) * keep
    return max(round(yes_odds, 2), MIN_ODDS), max(round(no_odds, 2), MIN_ODDS)


def challenge_live_odds(row: dict) -> tuple[float, float]:
    return live_odds(
        float(row["probability"]) / 100,
        float(row["yes_odds"]),
        float(row["no_odds"]),
        int(row.get("yes_pool") or 0),
        int(row.get("no_pool") or 0),
    )


def payout(stake: int, locked_odds: float) -> int:
    # Same rounding as calculatePotentialReturn in src/utils/predictions.ts.
    # Math.round rounds halves up; Python round() would round them to even.
    return math.floor(stake * locked_odds + 0.5)


def betting_closes_at(deadline_at: datetime) -> datetime:
    return deadline_at - LOCK_BEFORE_DEADLINE


# Manual "refresh odds" taps are served from memory for a few seconds, so many viewers
# tapping at once cost one database read per challenge, not one per tap. A bet placed
# through this process drops the entry, so the bettor's own refresh is never stale.
ODDS_CACHE_SECONDS = 5
_odds_cache: dict[str, tuple[float, dict]] = {}


def cached_odds(challenge_id: str) -> dict | None:
    entry = _odds_cache.get(challenge_id)
    if entry and time.monotonic() - entry[0] < ODDS_CACHE_SECONDS:
        return entry[1]
    _odds_cache.pop(challenge_id, None)
    return None


def cache_odds(challenge_id: str, odds: dict) -> None:
    if len(_odds_cache) > 10_000:
        _odds_cache.clear()
    _odds_cache[challenge_id] = (time.monotonic(), odds)


def forget_odds(challenge_id: str) -> None:
    _odds_cache.pop(challenge_id, None)
