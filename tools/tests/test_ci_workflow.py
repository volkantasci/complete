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


SUMMARY_LINE = (
    "2026-11-08 17:16:47,781 1 INFO ci_modules odoo.tests.result: "
    "{} failed, {} error(s) of {} tests when loading database 'ci_modules'"
)
TEST_LOGGER = "2026-11-08 17:15:50,133 1 ERROR ci_modules odoo.addons.mod.tests.test_mod"


def _module_test_pattern(kind):
    text = WORKFLOW.read_text()
    match = re.search(rf"{kind} '([^']+)' odoo-test\.log", text)
    assert match, f"no {kind} '<pattern>' odoo-test.log check in ci.yml"
    return match.group(1)


def test_ci_failure_check_matches_the_test_runner_markers():
    pattern = _module_test_pattern(r"if grep -E")
    assert re.search(pattern, f"{TEST_LOGGER}: FAIL: TestMod.test_one")
    assert re.search(pattern, f"{TEST_LOGGER}: ERROR: TestMod.test_one")


def test_ci_failure_check_ignores_database_messages_odoo_handles():
    # A read-only request that writes is retried with a read/write cursor; the
    # database message logged on the way is not a test failure.
    pattern = _module_test_pattern(r"if grep -E")
    assert not re.search(pattern, "ERROR: cannot execute INSERT in a read-only transaction")
    assert not re.search(pattern, SUMMARY_LINE.format(0, 0, 108))


def test_ci_requires_a_passing_test_summary():
    pattern = _module_test_pattern(r"if ! grep -qE")
    assert re.search(pattern, SUMMARY_LINE.format(0, 0, 108))
    assert not re.search(pattern, SUMMARY_LINE.format(0, 0, 0))
    assert not re.search(pattern, SUMMARY_LINE.format(1, 0, 108))
    assert not re.search(pattern, SUMMARY_LINE.format(0, 2, 108))
