# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Report source files that lack the Complete SPDX header."""

from __future__ import annotations

import sys
from pathlib import Path

from tools.gitfiles import tracked_files

EXTENSIONS = {".py", ".js", ".xml", ".scss", ".css"}
SCAN_DIRS = ("addons", "tools")
COPYRIGHT = "Copyright 2026 Complete contributors"
AGPL = "SPDX-License-Identifier: AGPL-3.0-only"
LGPL = "SPDX-License-Identifier: LGPL-3.0-only"


def _has_header(path: Path) -> bool:
    lines: list[str] = []
    with path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if line.strip():
                lines.append(line)
            if len(lines) == 2:
                break
    if len(lines) < 2:
        return False
    first, second = lines
    if COPYRIGHT in first and AGPL in second:
        return True
    return "Copyright" in first and LGPL in second


def check_headers(root: Path) -> list[str]:
    """Return root-relative paths whose first two non-empty lines are not a valid header.

    Only files that git knows (tracked or staged) are checked; without git the tree is walked.
    """
    root = Path(root)
    known = tracked_files(root)
    problems = []
    for name in SCAN_DIRS:
        base = root / name
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*")):
            rel = path.relative_to(root)
            if any(part.startswith(".") for part in rel.parts):
                continue
            if path.suffix not in EXTENSIONS or not path.is_file():
                continue
            if known is not None and rel.as_posix() not in known:
                continue
            if not _has_header(path):
                problems.append(rel.as_posix())
    return problems


def main() -> int:
    problems = check_headers(Path.cwd())
    for problem in problems:
        print(f"{problem}: missing or invalid SPDX header")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
