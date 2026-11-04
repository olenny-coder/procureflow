from __future__ import annotations

from typing import Iterable


def mean_logprob(values: Iterable[float] | None) -> float | None:
    scores = [float(value) for value in (values or []) if value is not None]
    if not scores:
        return None
    return sum(scores) / len(scores)


def band_for(
    score: float | None,
    high_min: float,
    mid_min: float,
) -> str:
    if score is None:
        return "LOW"
    if score >= high_min:
        return "HIGH"
    if score >= mid_min:
        return "MID"
    return "LOW"
