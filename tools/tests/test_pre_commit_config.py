# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only

import re
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
CONFIG = REPO / ".pre-commit-config.yaml"
REQUIREMENTS = REPO / "requirements-dev.txt"


def _config():
    return yaml.safe_load(CONFIG.read_text())


def _hooks():
    return {hook["id"]: hook for repo in _config()["repos"] for hook in repo["hooks"]}


def test_hooks_need_no_network():
    # Sandboxed sessions cannot clone hook repositories, so every hook is local.
    remote = [repo["repo"] for repo in _config()["repos"] if repo["repo"] != "local"]
    assert remote == []


def test_ruff_hook_runs_the_pinned_ruff_from_the_venv():
    hook = _hooks()["ruff-check"]
    assert hook["language"] == "system"
    assert hook["entry"] == ".venv/bin/ruff check --force-exclude"
    assert hook["types_or"] == ["python", "pyi", "jupyter"]
    assert hook["require_serial"] is True
    pins = re.findall(r"^ruff==(\S+)$", REQUIREMENTS.read_text(), flags=re.MULTILINE)
    assert len(pins) == 1, "requirements-dev.txt must pin ruff exactly once"


def test_local_checks_are_unchanged():
    hooks = _hooks()
    for name in ("check_headers", "check_manifests", "check_provenance", "check_docs_links"):
        hook = hooks[name.replace("_", "-")]
        assert hook["entry"] == f"python -m tools.{name}"
        assert hook["always_run"] is True
