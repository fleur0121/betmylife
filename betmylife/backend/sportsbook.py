"""Fixed-odds sportsbook pricing, kept separate from the ML probability model."""
from __future__ import annotations

from dataclasses import dataclass


BOOKMAKER_OVERROUND = 0.05
MAX_MARKET_SHIFT = 0.12
MIN_PROBABILITY = 0.02
MAX_PROBABILITY = 0.98


@dataclass(frozen=True)
class MarketQuote:
    model_probability: float
    market_probability: float
    quoted_yes_odds: float
    quoted_no_odds: float
    overround: float = BOOKMAKER_OVERROUND


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def quote_market(
    model_probability: float,
    yes_stake: float = 0,
    no_stake: float = 0,
) -> MarketQuote:
    """Turn a fair ML probability into a fixed-odds quote.

    Stakes shift the future market line only. Existing bets retain the quote
    returned at placement time. The overround is applied after the market
    adjustment and is never fed back into the ML probability.
    """
    fair_probability = _clamp(float(model_probability), MIN_PROBABILITY, MAX_PROBABILITY)
    total_stake = max(0.0, float(yes_stake)) + max(0.0, float(no_stake))
    imbalance = 0.0 if total_stake == 0 else (float(yes_stake) - float(no_stake)) / total_stake
    market_probability = _clamp(
        fair_probability + imbalance * MAX_MARKET_SHIFT,
        MIN_PROBABILITY,
        MAX_PROBABILITY,
    )
    yes_implied = _clamp(market_probability * (1 + BOOKMAKER_OVERROUND), 0.001, 0.999)
    no_implied = _clamp((1 - market_probability) * (1 + BOOKMAKER_OVERROUND), 0.001, 0.999)
    return MarketQuote(
        model_probability=round(fair_probability, 6),
        market_probability=round(market_probability, 6),
        quoted_yes_odds=round(max(1.01, 1 / yes_implied), 2),
        quoted_no_odds=round(max(1.01, 1 / no_implied), 2),
    )
