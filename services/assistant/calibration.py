#!/usr/bin/env python3
"""Suggest HIGH/MID confidence thresholds from a labeled JSONL sample.

Input rows:
  {"logprob": -0.21, "label": 1}   # 1 = accepted, 0 = should review/reject
  {"logprob": -1.30, "label": 0}

The script chooses thresholds from observed scores. It is intentionally small:
replace it with a larger calibration set from your own documents/conversations.
"""
from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path


def load(path: Path) -> list[tuple[float, int]]:
    rows: list[tuple[float, int]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        score = item.get("logprob", item.get("mean_logprob"))
        label = item.get("label", item.get("accepted"))
        if score is None or label is None:
            continue
        rows.append((float(score), int(label)))
    return rows


def suggest(rows: list[tuple[float, int]]) -> dict:
    scores = sorted({round(score, 3) for score, _ in rows}, reverse=True)
    best = None
    for high in scores:
        high_rows = [label for score, label in rows if score >= high]
        if not high_rows:
            continue
        precision = sum(high_rows) / len(high_rows)
        coverage = len(high_rows) / len(rows)
        # Favor high precision, then coverage; this is deliberately conservative.
        candidate = (precision, coverage, high)
        if best is None or candidate > best:
            best = candidate

    high_min = best[2] if best else -0.35
    accepted = [score for score, label in rows if label == 1 and score < high_min]
    mid_min = statistics.quantiles(accepted, n=4)[0] if len(accepted) >= 4 else -1.0
    high_rows = [label for score, label in rows if score >= high_min]
    mid_rows = [label for score, label in rows if mid_min <= score < high_min]
    low_rows = [label for score, label in rows if score < mid_min]

    return {
        "high_min_logprob": round(high_min, 3),
        "mid_min_logprob": round(mid_min, 3),
        "sample_size": len(rows),
        "bands": {
            "HIGH": {
                "count": len(high_rows),
                "precision": round(sum(high_rows) / len(high_rows), 3) if high_rows else None,
            },
            "MID": {"count": len(mid_rows)},
            "LOW": {"count": len(low_rows)},
        },
        "note": "Thresholds are suggestions; review against a held-out set.",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = suggest(load(args.input))
    text = json.dumps(result, indent=2)
    print(text)
    if args.output:
        args.output.write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
