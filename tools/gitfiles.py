# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""List the files that git knows (tracked or staged) below a directory."""

from __future__ import annotations

import subprocess
from pathlib import Path


def tracked_files(base: Path) -> set[str] | None:
    """Return the posix paths, relative to ``base``, of files in the git index below it.

    The index holds tracked and staged files, so untracked drafts are not in it. Files
    that were deleted from the working tree are left out. Return ``None`` when git is
    unavailable or ``base`` is not inside a repository; callers then walk the tree.
    """
    base = Path(base)
    try:
        result = subprocess.run(
            ["git", "-C", str(base), "ls-files", "--cached", "-z"],
            capture_output=True,
            check=False,
        )
    except (OSError, ValueError):
        return None
    if result.returncode != 0:
        return None
    names = result.stdout.decode("utf-8", errors="surrogateescape").split("\0")
    return {name for name in names if name and (base / name).is_file()}
