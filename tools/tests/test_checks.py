# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from tools.check_headers import check_headers
from tools.check_manifests import check_manifests
from tools.check_provenance import REQUIRED_PROVENANCE_KEYS, check_provenance
from tools.check_provenance import main as provenance_main

HEADER_PY = (
    "# Copyright 2026 Complete contributors\n"
    "# SPDX-License-Identifier: AGPL-3.0-only\n"
)


def write(path: Path, text) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not isinstance(text, str):
        text = yaml.safe_dump(text)
    path.write_text(text, encoding="utf-8")


def manifest(**values) -> str:
    data = {
        "name": "X",
        "version": "20.0.1.0.0",
        "license": "AGPL-3",
        "installable": True,
    }
    data.update(values)
    return repr(data) + "\n"


def full_record(**overrides) -> dict:
    record = {
        "module": "complete_x",
        "slice": "s1",
        "spec_sha256": "0" * 64,
        "ee_build": "20261106",
        "implementer_sessions": ["a"],
        "verifier_session": "b",
        "overlap": {"ratio": 0.01, "longest_run": 2, "reviewed_matches": []},
        "audit_log_sha256": "1" * 64,
        "escape_test": "passed",
        "dates": {
            "spec_approved": "2026-11-06",
            "implemented": "2026-11-07",
            "verified": "2026-11-08",
        },
        "approvals": ["owner"],
    }
    record.update(overrides)
    return record


def test_header_missing_reported(tmp_path):
    write(tmp_path / "addons/complete_x/a.py", "x = 1\n")
    write(tmp_path / "addons/complete_x/b.py", HEADER_PY + "x = 1\n")
    assert check_headers(tmp_path) == ["addons/complete_x/a.py"]


def test_header_scope_and_variants(tmp_path):
    write(tmp_path / "addons/.hidden/a.py", "x = 1\n")
    write(tmp_path / "docker/a.py", "x = 1\n")
    write(tmp_path / "tools/a.txt", "x\n")
    write(tmp_path / "tools/a.tmpl", "x\n")
    lgpl = "\n# Copyright Upstream Authors\n# SPDX-License-Identifier: LGPL-3.0-only\n"
    xml = (
        "<!-- Copyright 2026 Complete contributors -->\n"
        "<!-- SPDX-License-Identifier: AGPL-3.0-only -->\n<x/>\n"
    )
    bad = "// Copyright 2026 Complete contributors\n// SPDX-License-Identifier: MIT\n"
    write(tmp_path / "tools/lgpl.py", lgpl)
    write(tmp_path / "tools/ok.xml", xml)
    write(tmp_path / "tools/bad.js", bad)
    assert check_headers(tmp_path) == ["tools/bad.js"]


def test_missing_dirs_are_fine(tmp_path):
    assert check_headers(tmp_path) == []
    assert check_manifests(tmp_path / "addons") == []
    assert check_provenance(tmp_path / "addons", tmp_path / "provenance") == []


def test_manifest_rules(tmp_path):
    ok = manifest(version="20.0.1.0.0", license="AGPL-3")
    bad = manifest(version="19.0.1.0.0", license="OEEL-1")
    write(tmp_path / "complete_ok/__manifest__.py", ok)
    write(tmp_path / "complete_bad/__manifest__.py", bad)
    problems = check_manifests(tmp_path)
    assert len(problems) == 2 and all(p.startswith("complete_bad") for p in problems)


def test_manifest_name_installable_and_skips(tmp_path):
    write(tmp_path / ".gitkeep", "")
    write(tmp_path / ".hidden/x", "")
    write(tmp_path / "Bad-Name/__manifest__.py", manifest())
    write(tmp_path / "complete_off/__manifest__.py", manifest(installable=False))
    write(tmp_path / "complete_none/readme.txt", "")
    problems = check_manifests(tmp_path)
    assert any(p.startswith("Bad-Name") and "name" in p for p in problems)
    assert any(p.startswith("complete_off") and "installable" in p for p in problems)
    assert any(p.startswith("complete_none") and "manifest" in p for p in problems)
    assert len(problems) == 3


def test_provenance_missing_file_and_threshold(tmp_path):
    (tmp_path / "addons/complete_a").mkdir(parents=True)
    (tmp_path / "addons/complete_b").mkdir()
    write(tmp_path / "provenance/complete_b.yaml",
          full_record(overlap={"ratio": 0.07, "longest_run": 2, "reviewed_matches": []}))
    problems = check_provenance(tmp_path / "addons", tmp_path / "provenance")
    assert any("complete_a" in p and "missing" in p for p in problems)
    assert any("complete_b" in p and "ratio" in p for p in problems)


def test_provenance_valid_and_longest_run_and_keys(tmp_path):
    (tmp_path / "addons/.gitkeep").parent.mkdir(parents=True)
    (tmp_path / "addons/.gitkeep").write_text("")
    for name in ("complete_ok", "complete_run", "complete_key"):
        (tmp_path / "addons" / name).mkdir()
    write(tmp_path / "provenance/README.md", "not a record\n")
    write(tmp_path / "provenance/complete_ok.yaml", full_record())
    write(tmp_path / "provenance/complete_run.yaml",
          full_record(overlap={"ratio": 0.0, "longest_run": 5, "reviewed_matches": []}))
    record = full_record()
    del record["dates"]["verified"]
    del record["approvals"]
    write(tmp_path / "provenance/complete_key.yaml", record)
    problems = check_provenance(tmp_path / "addons", tmp_path / "provenance")
    assert not any("complete_ok" in p for p in problems)
    assert any("complete_run" in p and "longest_run" in p for p in problems)
    assert any("complete_key" in p and "dates.verified" in p for p in problems)
    assert any("complete_key" in p and "approvals" in p for p in problems)
    assert len(REQUIRED_PROVENANCE_KEYS) == 15


@pytest.mark.parametrize(
    "ratio,run",
    [
        (float("nan"), 2),
        (float("inf"), 2),
        (float("-inf"), 2),
        (True, 2),
        (False, 2),
        (0.01, float("nan")),
        (0.01, True),
        (0.01, False),
        (0.01, float("-inf")),
    ],
)
def test_provenance_rejects_non_finite_and_boolean_numbers(tmp_path, ratio, run):
    (tmp_path / "addons/complete_x").mkdir(parents=True)
    write(
        tmp_path / "provenance/complete_x.yaml",
        full_record(overlap={"ratio": ratio, "longest_run": run, "reviewed_matches": []}),
    )
    problems = check_provenance(tmp_path / "addons", tmp_path / "provenance")
    assert any("complete_x" in p and "overlap." in p for p in problems)


def test_provenance_allow_missing_reports_but_passes(tmp_path, monkeypatch, capsys):
    (tmp_path / "addons/complete_a").mkdir(parents=True)
    (tmp_path / "addons/complete_b").mkdir()
    write(tmp_path / "provenance/complete_b.yaml", full_record())
    monkeypatch.chdir(tmp_path)
    assert provenance_main(["--allow-missing"]) == 0
    assert "complete_a: provenance record missing" in capsys.readouterr().out
    assert provenance_main([]) == 1


def test_provenance_allow_missing_still_fails_bad_records(tmp_path, monkeypatch):
    (tmp_path / "addons/complete_b").mkdir(parents=True)
    write(tmp_path / "provenance/complete_b.yaml",
          full_record(overlap={"ratio": 0.07, "longest_run": 2, "reviewed_matches": []}))
    monkeypatch.chdir(tmp_path)
    assert provenance_main(["--allow-missing"]) == 1
