# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Write the machine-specific Claude Code settings for implementer sessions.

``python -m tools.setup_isolation --workspace <ws> [--force]`` writes
``.claude/settings.local.json`` with the permission rules (layer L1) and the sandbox
configuration (layers L3 and L4) for the workspace at ``<ws>``, which must be the
directory that holds this repository. The committed guard hook (layer L2) needs no
generated settings. See docs/isolation.md.
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
GUARD = REPO_ROOT / ".claude" / "hooks" / "guard.py"


def guard_allowed_hosts(guard: Path = GUARD) -> set[str]:
    """Read ``ALLOWED_HOSTS`` from the guard, the single source of the web allowlist."""
    for node in ast.parse(guard.read_text(encoding="utf-8")).body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "ALLOWED_HOSTS" for target in node.targets
        ):
            return set(ast.literal_eval(node.value))
    raise ValueError(f"{guard} defines no ALLOWED_HOSTS")


def render_local_settings(ws: Path, repo: Path | None = None) -> dict:
    """Return the local settings for the absolute workspace root ``ws``.

    ``repo`` is this repository's directory inside ``ws``; it defaults to
    ``ws/complete``. Permission rules take the ``//`` absolute form; sandbox paths
    are plain absolute paths.
    """
    ws = Path(ws)
    repo = Path(repo) if repo is not None else ws / "complete"
    if not ws.is_absolute() or not repo.is_absolute():
        raise ValueError(f"the workspace and repository must be absolute paths: {ws}, {repo}")
    w = ws.as_posix().lstrip("/")
    r = repo.as_posix().lstrip("/")
    return {
        "permissions": {
            "blockReadsOutsideWorkingDirectories": True,
            "additionalDirectories": [
                str(ws / "odoo-reference/community"),
                str(ws / "complete-specs/slices"),
                str(ws / "complete-specs/templates"),
            ],
            "deny": [
                f"Read(//{w}/odoo-reference/enterprise/**)",
                f"Edit(//{w}/odoo-reference/**)",
                f"Read(//{w}/complete-specs/analysis/**)",
                f"Read(//{w}/complete-specs/env/**)",
                f"Read(//{w}/complete-specs/tools/**)",
                f"Read(//{w}/complete-specs/evidence/**)",
                f"Read(//{w}/complete-specs/inventory/**)",
                f"Read(//{w}/complete-specs/.git/**)",
                f"Read(//{w}/complete-specs/.githooks/**)",
                f"Edit(//{w}/complete-specs/**)",
                f"Edit(//{r}/.claude/**)",
                f"Edit(//{r}/.git/**)",
            ],
        },
        "sandbox": {
            "enabled": True,
            "failIfUnavailable": True,
            "allowUnsandboxedCommands": False,
            "excludedCommands": ["podman *"],
            "filesystem": {
                "denyRead": [str(ws / "odoo-reference/enterprise"), str(ws / "complete-specs")],
                "allowRead": [
                    str(ws / "complete-specs/slices"),
                    str(ws / "complete-specs/templates"),
                ],
                "denyWrite": [
                    str(repo / ".claude"),
                    str(repo / ".git/hooks"),
                    str(repo / ".git/config"),
                ],
            },
            "network": {"allowedDomains": sorted(guard_allowed_hosts())},
        },
    }


def main(argv: list[str] | None = None, repo_root: Path | None = None) -> int:
    """Write ``.claude/settings.local.json``; ``repo_root`` exists for tests only."""
    parser = argparse.ArgumentParser(
        prog="python -m tools.setup_isolation",
        description="Write .claude/settings.local.json for implementer sessions.",
    )
    parser.add_argument(
        "--workspace", required=True, type=Path, help="workspace root that holds complete/"
    )
    parser.add_argument("--force", action="store_true", help="overwrite existing local settings")
    args = parser.parse_args(argv)
    repo = (repo_root or REPO_ROOT).resolve()
    ws = args.workspace.expanduser().resolve()
    if repo.parent != ws:
        print(
            f"error: {repo} is not directly inside the workspace {ws}; the guard hook takes "
            "its workspace root from the repository location, so the settings would not match",
            file=sys.stderr,
        )
        return 2
    target = repo / ".claude" / "settings.local.json"
    if target.exists() and not args.force:
        print(f"{target} already exists; pass --force to overwrite it", file=sys.stderr)
        return 1
    target.parent.mkdir(parents=True, exist_ok=True)
    settings = render_local_settings(ws, repo=repo)
    target.write_text(json.dumps(settings, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
