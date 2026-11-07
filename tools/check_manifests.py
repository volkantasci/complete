# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Validate addon manifests."""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

from tools.gitfiles import tracked_files

NAME_RE = re.compile(r"^complete_[a-z0-9_]+$")
# Original module names that an approved spec package requires for database and
# dependency compatibility ([DB] in its model.md). Each entry needs the owner's
# approval at the slice's checkpoint.
COMPATIBILITY_NAMES = frozenset({
    "timer",  # slice 000
    "test_timer",  # slice 000
    "web_enterprise",  # slice 001a
})
LICENSES = {"AGPL-3", "LGPL-3"}


def addon_dirs(addons: Path) -> list[Path]:
    """Return module directories; a missing directory, dotfiles and files are skipped.

    With git, a directory counts only when it holds a tracked or staged file.
    """
    addons = Path(addons)
    if not addons.is_dir():
        return []
    known = tracked_files(addons)
    modules = (p for p in addons.iterdir() if p.is_dir() and not p.name.startswith("."))
    if known is not None:
        owners = {name.split("/", 1)[0] for name in known if "/" in name}
        modules = (p for p in modules if p.name in owners)
    return sorted(modules)


def check_manifests(addons: Path) -> list[str]:
    problems = []
    known = tracked_files(addons)
    for module in addon_dirs(addons):
        name = module.name
        if not NAME_RE.match(name) and name not in COMPATIBILITY_NAMES:
            problems.append(f"{name}: module name must match {NAME_RE.pattern}")
        manifest = module / "__manifest__.py"
        if not manifest.is_file() or (known is not None and f"{name}/__manifest__.py" not in known):
            problems.append(f"{name}: __manifest__.py missing")
            continue
        try:
            data = ast.literal_eval(manifest.read_text(encoding="utf-8"))
        except (ValueError, SyntaxError) as exc:
            problems.append(f"{name}: manifest is not a literal dict ({exc})")
            continue
        if not isinstance(data, dict):
            problems.append(f"{name}: manifest is not a dict")
            continue
        if not str(data.get("version", "")).startswith("20.0."):
            problems.append(f"{name}: version must start with 20.0.")
        if data.get("license") not in LICENSES:
            problems.append(f"{name}: license must be one of {sorted(LICENSES)}")
        if data.get("installable") is not True:
            problems.append(f"{name}: installable must be true")
    return problems


def main() -> int:
    problems = check_manifests(Path.cwd() / "addons")
    for problem in problems:
        print(problem)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
