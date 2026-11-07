# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Validate per-module provenance records."""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import yaml

from tools.check_manifests import addon_dirs
from tools.gitfiles import tracked_files

REQUIRED_PROVENANCE_KEYS = (
    "module",
    "slice",
    "spec_sha256",
    "ee_build",
    "implementer_sessions",
    "verifier_session",
    "overlap.ratio",
    "overlap.longest_run",
    "overlap.reviewed_matches",
    "audit_log_sha256",
    "escape_test",
    "dates.spec_approved",
    "dates.implemented",
    "dates.verified",
    "approvals",
)
MAX_RATIO = 0.05
MAX_RUN = 5  # exclusive


def _lookup(record: dict, dotted: str):
    """Return (found, value) for a dotted key into nested mappings."""
    value = record
    for part in dotted.split("."):
        if not isinstance(value, dict) or part not in value:
            return False, None
        value = value[part]
    return value is not None, value


def _is_number(value) -> bool:
    """True for a finite int or float; booleans, NaN and infinities are not numbers."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return False
    return math.isfinite(value)


def check_provenance(addons: Path, provenance: Path) -> list[str]:
    provenance = Path(provenance)
    problems = []
    known = tracked_files(provenance) if provenance.is_dir() else None
    for module in addon_dirs(addons):
        name = module.name
        path = provenance / f"{name}.yaml"
        if not path.is_file() or (known is not None and path.name not in known):
            problems.append(f"{name}: provenance record missing ({path.name})")
            continue
        try:
            record = yaml.safe_load(path.read_text(encoding="utf-8"))
        except yaml.YAMLError as exc:
            problems.append(f"{name}: provenance record is not valid YAML ({exc})")
            continue
        if not isinstance(record, dict):
            problems.append(f"{name}: provenance record is not a mapping")
            continue
        for key in REQUIRED_PROVENANCE_KEYS:
            if not _lookup(record, key)[0]:
                problems.append(f"{name}: provenance key missing: {key}")
        found, ratio = _lookup(record, "overlap.ratio")
        if found and (not _is_number(ratio) or not 0 <= ratio <= MAX_RATIO):
            problems.append(f"{name}: overlap.ratio {ratio} exceeds {MAX_RATIO}")
        found, run = _lookup(record, "overlap.longest_run")
        if found and (not _is_number(run) or not 0 <= run < MAX_RUN):
            problems.append(f"{name}: overlap.longest_run {run} must be below {MAX_RUN}")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m tools.check_provenance", description=__doc__)
    parser.add_argument(
        "--allow-missing",
        action="store_true",
        help="report missing records without failing (local commits before the provenance step)",
    )
    args = parser.parse_args(argv)
    root = Path.cwd()
    problems = check_provenance(root / "addons", root / "provenance")
    for problem in problems:
        print(problem)
    if args.allow_missing:
        problems = [p for p in problems if "provenance record missing" not in p]
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
