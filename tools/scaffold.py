# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Create a new Complete module skeleton from ``tools/module_template``."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

NAME_RE = re.compile(r"^complete_[a-z0-9_]+$")
TEMPLATE_DIR = Path(__file__).parent / "module_template"


def scaffold(
    name: str,
    addons_dir: Path,
    summary: str,
    depends: list[str],
    category: str = "Productivity",
) -> Path:
    """Render the template into ``addons_dir/name`` and return that directory."""
    if not NAME_RE.fullmatch(name):
        raise ValueError(f"module name must match {NAME_RE.pattern}: {name!r}")
    target = Path(addons_dir) / name
    if target.exists():
        raise ValueError(f"target already exists: {target}")
    values = {
        "name": name,
        "title": repr(name.removeprefix("complete_").replace("_", " ").title()),
        "summary": repr(summary),
        "summary_text": summary,
        "category": repr(category),
        "depends": repr(list(depends)),
    }
    for template in sorted(TEMPLATE_DIR.rglob("*.tmpl")):
        out = target / template.relative_to(TEMPLATE_DIR).with_suffix("")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(template.read_text(encoding="utf-8").format(**values), encoding="utf-8")
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m tools.scaffold", description=__doc__)
    parser.add_argument("name")
    parser.add_argument("--summary", required=True)
    parser.add_argument("--depends", default="")
    parser.add_argument("--category", default="Productivity")
    parser.add_argument("--addons-dir", default="addons", type=Path)
    args = parser.parse_args(argv)
    depends = [d for d in args.depends.split(",") if d]
    try:
        target = scaffold(args.name, args.addons_dir, args.summary, depends, args.category)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(target)
    return 0


if __name__ == "__main__":
    sys.exit(main())
