# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Tests for ``tools/setup_isolation.py``; the CLI only ever writes into ``tmp_path``."""

from __future__ import annotations

import json
from pathlib import Path

from tools.setup_isolation import guard_allowed_hosts, main, render_local_settings

HOSTS = {
    "www.odoo.com",
    "odoo.com",
    "nightly.odoo.com",
    "github.com",
    "api.github.com",
    "raw.githubusercontent.com",
    "codeload.github.com",
    "objects.githubusercontent.com",
    "pypi.org",
    "files.pythonhosted.org",
    "docs.python.org",
    "www.postgresql.org",
    "developer.mozilla.org",
    "www.gnu.org",
}


def test_render_local_settings_key_values():
    s = render_local_settings(Path("/w"))
    assert s["permissions"]["deny"][0] == "Read(//w/odoo-reference/enterprise/**)"
    assert s["permissions"]["blockReadsOutsideWorkingDirectories"] is True
    assert s["sandbox"]["allowUnsandboxedCommands"] is False
    assert "/w/odoo-reference/enterprise" in s["sandbox"]["filesystem"]["denyRead"]


def test_render_local_settings_exact():
    assert render_local_settings(Path("/w")) == {
        "permissions": {
            "blockReadsOutsideWorkingDirectories": True,
            "additionalDirectories": [
                "/w/odoo-reference/community",
                "/w/complete-specs/slices",
                "/w/complete-specs/templates",
            ],
            "deny": [
                "Read(//w/odoo-reference/enterprise/**)",
                "Edit(//w/odoo-reference/**)",
                "Read(//w/complete-specs/analysis/**)",
                "Read(//w/complete-specs/env/**)",
                "Read(//w/complete-specs/tools/**)",
                "Read(//w/complete-specs/evidence/**)",
                "Read(//w/complete-specs/inventory/**)",
                "Read(//w/complete-specs/.git/**)",
                "Read(//w/complete-specs/.githooks/**)",
                "Edit(//w/complete-specs/**)",
                "Edit(//w/complete/.claude/**)",
                "Edit(//w/complete/.git/hooks/**)",
                "Edit(//w/complete/.git/config)",
            ],
        },
        "sandbox": {
            "enabled": True,
            "failIfUnavailable": True,
            "allowUnsandboxedCommands": False,
            "excludedCommands": ["podman *"],
            "filesystem": {
                "denyRead": ["/w/odoo-reference/enterprise", "/w/complete-specs"],
                "allowRead": ["/w/complete-specs/slices", "/w/complete-specs/templates"],
                "denyWrite": [
                    "/w/complete/.claude",
                    "/w/complete/.git/hooks",
                    "/w/complete/.git/config",
                    "/w/odoo-reference/community",
                    "/w/complete-specs/slices",
                    "/w/complete-specs/templates",
                ],
            },
            "network": {"allowedDomains": sorted(HOSTS)},
        },
    }


def test_extra_read_directories_are_not_writable_in_the_sandbox():
    s = render_local_settings(Path("/w"))
    extra = s["permissions"]["additionalDirectories"]
    deny_write = s["sandbox"]["filesystem"]["denyWrite"]
    assert extra
    assert all(d in deny_write for d in extra)
    assert deny_write[:3] == [
        "/w/complete/.claude",
        "/w/complete/.git/hooks",
        "/w/complete/.git/config",
    ]
    assert "/w/complete" not in deny_write


def test_git_stays_writable_for_shell_commands_except_hooks_and_config():
    # Claude Code turns Edit deny rules into sandbox write denials, so a rule for the whole
    # .git directory would stop sandboxed sessions from branching and committing (F2).
    s = render_local_settings(Path("/w"))
    git_edit_denies = [rule for rule in s["permissions"]["deny"] if "/w/complete/.git" in rule]
    assert git_edit_denies == [
        "Edit(//w/complete/.git/hooks/**)",
        "Edit(//w/complete/.git/config)",
    ]
    deny_write = s["sandbox"]["filesystem"]["denyWrite"]
    assert "/w/complete/.git/hooks" in deny_write
    assert "/w/complete/.git/config" in deny_write
    assert "/w/complete/.git" not in deny_write


def test_render_uses_the_workspace_given():
    s = render_local_settings(Path("/home/owner/ws"))
    assert s["permissions"]["deny"][1] == "Edit(//home/owner/ws/odoo-reference/**)"
    assert s["sandbox"]["filesystem"]["denyRead"][1] == "/home/owner/ws/complete-specs"
    assert s["sandbox"]["filesystem"]["denyWrite"][0] == "/home/owner/ws/complete/.claude"


def test_render_uses_the_repository_given():
    s = render_local_settings(Path("/w"), repo=Path("/w/fork"))
    assert s["permissions"]["deny"][-3:] == [
        "Edit(//w/fork/.claude/**)",
        "Edit(//w/fork/.git/hooks/**)",
        "Edit(//w/fork/.git/config)",
    ]
    assert s["sandbox"]["filesystem"]["denyWrite"] == [
        "/w/fork/.claude",
        "/w/fork/.git/hooks",
        "/w/fork/.git/config",
        "/w/odoo-reference/community",
        "/w/complete-specs/slices",
        "/w/complete-specs/templates",
    ]


def test_cli_uses_the_actual_repository_directory(tmp_path):
    repo = tmp_path / "fork"
    repo.mkdir()
    assert main(["--workspace", str(tmp_path)], repo_root=repo) == 0
    settings = json.loads((repo / ".claude" / "settings.local.json").read_text(encoding="utf-8"))
    deny_write = settings["sandbox"]["filesystem"]["denyWrite"]
    assert deny_write[0] == str(tmp_path.resolve() / "fork" / ".claude")


def test_network_allowlist_comes_from_the_guard():
    assert guard_allowed_hosts() == HOSTS


def test_cli_refuses_to_overwrite_without_force(tmp_path):
    repo = tmp_path / "complete"
    repo.mkdir()
    argv = ["--workspace", str(tmp_path)]
    target = repo / ".claude" / "settings.local.json"
    assert main(argv, repo_root=repo) == 0
    written = target.read_text(encoding="utf-8")
    expected = render_local_settings(tmp_path.resolve(), repo=repo.resolve())
    assert written == json.dumps(expected, indent=2) + "\n"
    assert main(argv, repo_root=repo) == 1
    target.write_text("{}\n", encoding="utf-8")
    assert main(argv, repo_root=repo) == 1
    assert target.read_text(encoding="utf-8") == "{}\n"
    assert main([*argv, "--force"], repo_root=repo) == 0
    assert target.read_text(encoding="utf-8") == written


def test_cli_resolves_a_relative_workspace(tmp_path, monkeypatch):
    repo = tmp_path / "complete"
    repo.mkdir()
    monkeypatch.chdir(repo)
    assert main(["--workspace", ".."], repo_root=repo) == 0
    settings = json.loads((repo / ".claude" / "settings.local.json").read_text(encoding="utf-8"))
    expected = str(tmp_path.resolve() / "odoo-reference" / "enterprise")
    assert settings["sandbox"]["filesystem"]["denyRead"][0] == expected


def test_cli_rejects_a_workspace_that_does_not_hold_the_repository(tmp_path):
    repo = tmp_path / "complete"
    repo.mkdir()
    assert main(["--workspace", str(tmp_path / "elsewhere")], repo_root=repo) == 2
    assert not (repo / ".claude" / "settings.local.json").exists()
