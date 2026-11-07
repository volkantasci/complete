# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from __future__ import annotations

import ast

import pytest

from tools.scaffold import main, scaffold


def test_creates_expected_tree(tmp_path):
    root = scaffold("complete_demo", tmp_path, "Demo", ["web"])
    assert sorted(p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()) == [
        "README.md",
        "__init__.py",
        "__manifest__.py",
        "models/__init__.py",
        "static/description/index.html",
        "tests/__init__.py",
        "tests/test_install.py",
    ]


def test_every_source_file_has_spdx_header(tmp_path):
    for p in scaffold("complete_demo", tmp_path, "Demo", ["web"]).rglob("*.py"):
        assert p.read_text().splitlines()[:2] == [
            "# Copyright 2026 Complete contributors",
            "# SPDX-License-Identifier: AGPL-3.0-only",
        ]


def test_manifest_values(tmp_path):
    root = scaffold("complete_demo", tmp_path, "Demo", ["web", "mail"])
    m = ast.literal_eval((root / "__manifest__.py").read_text().split("\n", 2)[2])
    assert (m["version"], m["license"], m["depends"]) == ("20.0.1.0.0", "AGPL-3", ["web", "mail"])
    assert m["author"] == "Complete contributors"
    assert m["website"] == "https://github.com/volkantasci/complete"
    assert m["installable"] is True
    assert m["application"] is False
    assert m["summary"] == "Demo"
    assert m["category"] == "Productivity"


@pytest.mark.parametrize("bad", ["timer", "complete_Timer", "complete-timer"])
def test_rejects_bad_name(tmp_path, bad):
    with pytest.raises(ValueError):
        scaffold(bad, tmp_path, "x", [])


def test_refuses_existing_dir(tmp_path):
    scaffold("complete_demo", tmp_path, "Demo", [])
    with pytest.raises(ValueError):
        scaffold("complete_demo", tmp_path, "Demo", [])


def test_summary_with_quotes_stays_valid(tmp_path):
    root = scaffold("complete_demo", tmp_path, 'It\'s "quoted"', [])
    m = ast.literal_eval((root / "__manifest__.py").read_text().split("\n", 2)[2])
    assert m["summary"] == 'It\'s "quoted"'


def test_cli_creates_module(tmp_path):
    code = main(["complete_cli", "--summary", "Cli", "--depends", "base,mail",
                 "--addons-dir", str(tmp_path)])
    assert code == 0
    text = (tmp_path / "complete_cli" / "__manifest__.py").read_text()
    assert ast.literal_eval(text.split("\n", 2)[2])["depends"] == ["base", "mail"]


def test_description_page_replaces_rst_rendering_of_readme(tmp_path):
    root = scaffold("complete_demo", tmp_path, "A <b>&</b> summary", [])
    page = (root / "static/description/index.html").read_text()
    assert "A &lt;b&gt;&amp;&lt;/b&gt; summary" in page
    assert "<b>" not in page
    assert "Demo" in page
