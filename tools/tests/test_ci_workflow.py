# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WORKFLOW = REPO / ".github" / "workflows" / "ci.yml"
VERSIONS = REPO / "docker" / "versions.env"


def _pinned_lines():
    return [
        line
        for line in VERSIONS.read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def _defined_names():
    return {line.split("=", 1)[0] for line in _pinned_lines()}


def _loader_pattern():
    text = WORKFLOW.read_text()
    match = re.search(r"grep -E '([^']+)' docker/versions\.env", text)
    assert match, "no grep -E '<pattern>' docker/versions.env command in ci.yml"
    return match.group(1)


def test_ci_loads_every_pinned_version():
    pattern = _loader_pattern()
    lines = _pinned_lines()
    for line in lines:
        assert re.search(pattern, line), f"pattern {pattern!r} misses {line!r}"
    loaded = {line.split("=", 1)[0] for line in lines if re.search(pattern, line)}
    assert loaded == _defined_names()


def test_ci_build_args_are_pinned():
    references = set(
        re.findall(r"\$\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}", WORKFLOW.read_text())
    )
    assert references, "ci.yml references no ${{ env.NAME }} variables"
    assert references <= _defined_names(), references - _defined_names()
