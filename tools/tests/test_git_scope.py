# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""The check hooks look only at files that git knows (tracked or staged)."""

from __future__ import annotations

import subprocess
from pathlib import Path

import yaml

from tools import gitfiles
from tools.check_docs_links import check_links
from tools.check_headers import check_headers
from tools.check_manifests import check_manifests
from tools.check_provenance import check_provenance
from tools.tests.test_checks import HEADER_PY, full_record, manifest, write


def git(root: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True)


def init_repo(root: Path) -> None:
    git(root, "init", "-q")


def test_headers_ignore_untracked_but_see_staged_and_tracked(tmp_path):
    init_repo(tmp_path)
    write(tmp_path / "addons/complete_x/draft.py", "x = 1\n")  # untracked
    write(tmp_path / "addons/complete_x/staged.py", "x = 1\n")
    git(tmp_path, "add", "addons/complete_x/staged.py")
    assert check_headers(tmp_path) == ["addons/complete_x/staged.py"]


def test_headers_skip_tracked_file_deleted_from_tree(tmp_path):
    init_repo(tmp_path)
    write(tmp_path / "tools/gone.py", "x = 1\n")
    git(tmp_path, "add", "tools/gone.py")
    (tmp_path / "tools/gone.py").unlink()
    assert check_headers(tmp_path) == []


def test_headers_fall_back_to_tree_walk_without_git_repo(tmp_path):
    write(tmp_path / "addons/complete_x/a.py", "x = 1\n")
    assert check_headers(tmp_path) == ["addons/complete_x/a.py"]


def test_headers_fall_back_when_git_is_missing(tmp_path, monkeypatch):
    init_repo(tmp_path)
    write(tmp_path / "addons/complete_x/a.py", "x = 1\n")
    monkeypatch.setenv("PATH", "")
    assert gitfiles.tracked_files(tmp_path) is None
    assert check_headers(tmp_path) == ["addons/complete_x/a.py"]


def test_manifests_ignore_untracked_module(tmp_path):
    init_repo(tmp_path)
    write(tmp_path / "addons/complete_ok/__manifest__.py", manifest())
    git(tmp_path, "add", "addons/complete_ok/__manifest__.py")
    write(tmp_path / "addons/complete_draft/notes.txt", "wip\n")  # untracked, no manifest
    assert check_manifests(tmp_path / "addons") == []


def test_manifests_report_staged_module_without_manifest(tmp_path):
    init_repo(tmp_path)
    write(tmp_path / "addons/complete_bad/a.txt", "x\n")
    git(tmp_path, "add", "addons/complete_bad/a.txt")
    assert check_manifests(tmp_path / "addons") == ["complete_bad: __manifest__.py missing"]


def test_manifests_untracked_manifest_does_not_count(tmp_path):
    init_repo(tmp_path)
    write(tmp_path / "addons/complete_m/a.txt", "x\n")
    git(tmp_path, "add", "addons/complete_m/a.txt")
    write(tmp_path / "addons/complete_m/__manifest__.py", manifest())  # untracked
    assert check_manifests(tmp_path / "addons") == ["complete_m: __manifest__.py missing"]


def test_manifests_fall_back_without_git_repo(tmp_path):
    write(tmp_path / "addons/complete_draft/notes.txt", "wip\n")
    assert check_manifests(tmp_path / "addons") == ["complete_draft: __manifest__.py missing"]


def test_provenance_ignores_untracked_module_and_requires_tracked_record(tmp_path):
    init_repo(tmp_path)
    write(tmp_path / "addons/complete_a/__manifest__.py", manifest())
    git(tmp_path, "add", "addons/complete_a/__manifest__.py")
    write(tmp_path / "addons/complete_draft/__manifest__.py", manifest())  # untracked
    write(tmp_path / "provenance/complete_a.yaml", yaml.safe_dump(full_record()))  # untracked
    problems = check_provenance(tmp_path / "addons", tmp_path / "provenance")
    assert problems == ["complete_a: provenance record missing (complete_a.yaml)"]
    git(tmp_path, "add", "provenance/complete_a.yaml")
    assert check_provenance(tmp_path / "addons", tmp_path / "provenance") == []


def test_links_ignore_untracked_markdown(tmp_path):
    init_repo(tmp_path)
    write(tmp_path / "ok.md", "[t](target.md)\n")
    write(tmp_path / "target.md", "# t\n")
    git(tmp_path, "add", "ok.md", "target.md")
    write(tmp_path / "draft.md", "[bad](missing.md)\n")  # untracked
    assert check_links(tmp_path) == []


def test_links_see_staged_markdown(tmp_path):
    init_repo(tmp_path)
    write(tmp_path / "a.md", "[bad](missing.md)\n")
    git(tmp_path, "add", "a.md")
    assert check_links(tmp_path) == ["a.md:1 missing.md"]


def test_subdirectory_of_another_repo_is_scoped_by_that_repo(tmp_path):
    init_repo(tmp_path)
    write(tmp_path / "sub/addons/complete_a/a.py", HEADER_PY)
    git(tmp_path, "add", "sub/addons/complete_a/a.py")
    write(tmp_path / "sub/addons/complete_a/draft.py", "x = 1\n")  # untracked
    assert check_headers(tmp_path / "sub") == []
