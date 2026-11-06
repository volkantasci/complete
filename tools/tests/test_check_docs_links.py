# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only

from tools.check_docs_links import check_links


def test_broken_relative_link_reported(tmp_path):
    (tmp_path / "a.md").write_text(
        "[ok](b.md) [bad](missing.md) [web](https://x.y) [anchor](b.md#s)\n"
    )
    (tmp_path / "b.md").write_text("# s\n")
    assert check_links(tmp_path) == ["a.md:1 missing.md"]


def test_hidden_directories_ignored(tmp_path):
    (tmp_path / ".venv").mkdir()
    (tmp_path / ".venv" / "x.md").write_text("[bad](nope.md)\n")
    assert check_links(tmp_path) == []


def test_sorted_by_file_then_line(tmp_path):
    (tmp_path / "z.md").write_text("[a](no1.md)\n")
    (tmp_path / "a.md").write_text("ok\n[a](no2.md)\n\n[b](no3.md)\n")
    assert check_links(tmp_path) == ["a.md:2 no2.md", "a.md:4 no3.md", "z.md:1 no1.md"]


def test_pure_anchor_and_mailto_ignored(tmp_path):
    (tmp_path / "a.md").write_text("[x](#top) [m](mailto:a@b.c)\n")
    assert check_links(tmp_path) == []


def test_links_in_code_spans_and_fences_ignored(tmp_path):
    (tmp_path / "a.md").write_text("`['x']([a-z]+)` and `[l](gone.md)`\n```\n[l](gone2.md)\n```\n")
    assert check_links(tmp_path) == []
