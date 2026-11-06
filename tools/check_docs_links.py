# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Report broken relative links in Markdown files."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote

LINK_RE = re.compile(r"\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
CODE_SPAN_RE = re.compile(r"`[^`]*`")
SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")


def _markdown_files(root: Path) -> list[Path]:
    files = []
    for path in root.rglob("*.md"):
        parts = path.relative_to(root).parts
        if any(part.startswith(".") for part in parts):
            continue
        if path.is_file():
            files.append(path)
    return sorted(files)


def check_links(root: Path) -> list[str]:
    """Return ``file:line target`` for each relative link whose file is missing."""
    root = Path(root)
    problems: list[tuple[str, int, str]] = []
    for path in _markdown_files(root):
        rel = path.relative_to(root).as_posix()
        in_fence = False
        text = path.read_text(encoding="utf-8")
        for number, line in enumerate(text.splitlines(), start=1):
            if line.lstrip().startswith(("```", "~~~")):
                in_fence = not in_fence
                continue
            if in_fence:
                continue
            for match in LINK_RE.finditer(CODE_SPAN_RE.sub("", line)):
                target = match.group(1)
                if SCHEME_RE.match(target) or target.startswith(("#", "//")):
                    continue
                file_part = unquote(target.split("#", 1)[0].split("?", 1)[0])
                if not file_part:
                    continue
                base = root if file_part.startswith("/") else path.parent
                if not (base / file_part.lstrip("/")).exists():
                    problems.append((rel, number, target))
    problems.sort()
    return [f"{f}:{n} {t}" for f, n, t in problems]


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    root = Path(args[0]) if args else Path.cwd()
    problems = check_links(root)
    for problem in problems:
        print(problem)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
