# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Tests for the clean-room guard hook, ``.claude/hooks/guard.py``.

Every test runs a copy of the guard inside a temporary workspace, so the guard's
workspace root is the temporary directory and nothing touches the real workspace.
"""

from __future__ import annotations

import ast
import hashlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
GUARD = REPO / ".claude" / "hooks" / "guard.py"
SETTINGS = REPO / ".claude" / "settings.json"
R2_COMMIT = (
    'git commit -m "feat(isolation): add implementer guard hook and local settings generator"'
    ' --trailer "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"'
    ' --trailer "Claude-Session: https://claude.ai/code/session_012p6u7A29udU3kx4jyLp3YU"'
)


@pytest.fixture
def ws(tmp_path):
    """A temporary workspace with a copy of the guard in ``complete/.claude/hooks``."""
    root = tmp_path.resolve()
    hooks = root / "complete" / ".claude" / "hooks"
    hooks.mkdir(parents=True)
    shutil.copy2(GUARD, hooks / "guard.py")
    (root / "complete" / "README.md").write_text("# Test\n")
    (root / "odoo-reference" / "enterprise").mkdir(parents=True)
    (root / "odoo-reference" / "enterprise" / "x.py").write_text("x = 1\n")
    (root / "complete-specs" / "slices" / "000-timer").mkdir(parents=True)
    (root / "complete-specs" / "slices" / "000-timer" / "spec.md").write_text("# Spec\n")
    (root / "complete-specs" / "analysis").mkdir()
    return root


@pytest.fixture
def links(ws):
    """Symlinks inside ``complete/`` that reach the reference trees without naming them."""
    (ws / "complete" / "ref").symlink_to(ws / "odoo-reference")
    (ws / "complete" / "ee").symlink_to(ws / "odoo-reference" / "enterprise")
    (ws / "complete" / "specs").symlink_to(ws / "complete-specs")
    return ws


def tool(name, cwd=None, **tool_input):
    """A PreToolUse event; ``run_guard`` uses ``<ws>/complete`` when ``cwd`` is None."""
    return {"session_id": "test-session", "cwd": cwd, "tool_name": name, "tool_input": tool_input}


def run_guard_raw(ws, text, home=None):
    """Run the copied guard on raw stdin and return ``(exit code, stderr)``.

    ``HOME`` is the temporary workspace unless ``home`` is given.
    """
    data = text.encode("utf-8") if isinstance(text, str) else text
    proc = subprocess.run(
        [sys.executable, "-I", str(ws / "complete" / ".claude" / "hooks" / "guard.py")],
        input=data,
        capture_output=True,
        cwd=ws / "complete",
        env={**os.environ, "HOME": str(home or ws)},
        timeout=60,
    )
    return proc.returncode, proc.stderr.decode("utf-8", "replace")


def run_guard(ws, event, home=None):
    event = dict(event)
    if event.get("cwd") is None:
        event["cwd"] = str(ws / "complete")
    return run_guard_raw(ws, json.dumps(event), home=home)


def run_hook_command(ws, event, repo=None):
    """Run the committed hook command through ``sh``, as Claude Code does."""
    command = json.loads(SETTINGS.read_text(encoding="utf-8"))["hooks"]["PreToolUse"][0]
    repo = repo or ws / "complete"
    event = {**event, "cwd": event.get("cwd") or str(repo)}
    proc = subprocess.run(
        ["sh", "-c", command["hooks"][0]["command"]],
        input=json.dumps(event).encode("utf-8"),
        capture_output=True,
        cwd=repo,
        env={**os.environ, "HOME": str(ws), "CLAUDE_PROJECT_DIR": str(repo)},
        timeout=60,
    )
    return proc.returncode, proc.stderr.decode("utf-8", "replace")


def audit_lines(ws):
    day = datetime.now(UTC).strftime("%Y-%m-%d")
    text = (ws / "complete-audit" / f"{day}.jsonl").read_text(encoding="utf-8")
    return [json.loads(line) for line in text.splitlines()]


def fill(value, ws):
    """Replace the ``{ws}`` placeholder; ``str.format`` would trip over JSON braces."""
    return value.replace("{ws}", str(ws)) if isinstance(value, str) else value


def load_guard(ws):
    """Import the copied guard in-process; its workspace root is the temporary one."""
    spec = importlib.util.spec_from_file_location(
        "guard_under_test", ws / "complete" / ".claude" / "hooks" / "guard.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def call_main(guard, event):
    """Run ``guard.main`` in-process; an exception escaping it is reported, not raised."""
    try:
        return guard.main(io.StringIO(json.dumps(event)))
    except BaseException as exc:  # an escaping exception is exactly the failure under test
        return f"escaped: {exc!r}"


# Tests from the task brief ----------------------------------------------------


def test_read_inside_repo_allowed(ws):
    assert run_guard(ws, tool("Read", file_path=str(ws / "complete/README.md")))[0] == 0


@pytest.mark.parametrize(
    "p",
    [
        "{ws}/odoo-reference/enterprise/x.py",
        "../odoo-reference/enterprise/x.py",
        "{ws}/odoo-reference/enterprise/",
        "{ws}/odoo-reference/enterprise",
    ],
)
def test_enterprise_paths_denied(ws, p):
    assert run_guard(ws, tool("Read", file_path=p.format(ws=ws)))[0] == 2


def test_symlink_into_enterprise_denied(ws):
    (ws / "complete/link").symlink_to(ws / "odoo-reference/enterprise/x.py")
    assert run_guard(ws, tool("Read", file_path="link"))[0] == 2


def test_specs_areas(ws):
    analysis = str(ws / "complete-specs/analysis")
    spec = str(ws / "complete-specs/slices/000-timer/spec.md")
    assert run_guard(ws, tool("Grep", pattern="x", path=analysis))[0] == 2
    assert run_guard(ws, tool("Read", file_path=spec))[0] == 0


@pytest.mark.parametrize(
    "cmd",
    [
        "cat ../odoo-reference/enterprise/x.py",
        "claude -p hi",
        "/usr/bin/claude --version",
        "podman run -v {ws}/odoo-reference/enterprise:/x alpine ls /x",
    ],
)
def test_bash_denied(ws, cmd):
    assert run_guard(ws, tool("Bash", command=cmd.format(ws=ws)))[0] == 2


def test_bash_ordinary_allowed(ws):
    assert run_guard(ws, tool("Bash", command="ruff check tools"))[0] == 0


@pytest.mark.parametrize(
    "url,code",
    [("https://github.com/OCA/web", 0), ("https://example.com", 2), ("file:///etc/passwd", 2)],
)
def test_webfetch_allowlist(ws, url, code):
    assert run_guard(ws, tool("WebFetch", url=url, prompt="x"))[0] == code


def test_malformed_stdin_fails_closed(ws):
    assert run_guard_raw(ws, "not json")[0] == 2


def test_audit_lines_written(ws):
    run_guard(ws, tool("Bash", command="ls"))
    run_guard(ws, tool("Bash", command="claude -p x"))
    lines = audit_lines(ws)
    assert len(lines) == 2 and [line["allowed"] for line in lines] == [True, False]
    assert set(lines[0]) == {
        "ts",
        "session_id",
        "agent_id",
        "agent_type",
        "tool_name",
        "allowed",
        "reason",
        "input_sha256",
        "preview",
    }


def test_audit_write_failure_fails_closed(ws):
    (ws / "complete-audit").write_text("not a directory")
    assert run_guard(ws, tool("Bash", command="ls"))[0] == 2


# R23: specs-area segments -------------------------------------------------------

SPECS_PATHS = [
    ("complete-specs", 0),
    ("complete-specs/", 0),
    ("complete-specs/slices", 0),
    ("complete-specs/slices/", 0),
    ("complete-specs/slices/000-timer/spec.md", 0),
    ("complete-specs/templates", 0),
    ("complete-specs/templates/spec.md", 0),
    ("complete-specs/analysis", 2),
    ("complete-specs/analysis/x", 2),
    ("complete-specs/tools", 2),
    ("complete-specs/env/compose.yaml", 2),
    ("complete-specs/README.md", 2),
    ("complete-specs/slices-old/x", 2),
    ("complete-specs/slices/../analysis/x", 2),
]


@pytest.mark.parametrize("rel,code", SPECS_PATHS)
def test_specs_segment_rule_on_paths(ws, rel, code):
    assert run_guard(ws, tool("Read", file_path=f"{ws}/{rel}"))[0] == code
    assert run_guard(ws, tool("Read", file_path=f"../{rel}"))[0] == code


@pytest.mark.parametrize(
    "cmd,code",
    [
        ("ls ../complete-specs", 2),
        ("ls ../complete-specs/", 2),
        ("ls ../complete-specs/slices", 0),
        ("ls ../complete-specs/slices | head -n 3", 0),
        ("cat ../complete-specs/slices/000-timer/spec.md", 0),
        ("ls ../complete-specs/templates", 0),
        ("cat ../complete-specs/analysis/x", 2),
        ("ls ../complete-specs/tools", 2),
        ("cat ../complete-specs/README.md", 2),
        ("cat ../complete-specs/slices/../analysis/x", 2),
        ("cat ../complete-specs//analysis/x", 2),
        ("cat '../complete-specs/'analysis/x", 2),
    ],
)
def test_specs_segment_rule_on_text(ws, cmd, code):
    assert run_guard(ws, tool("Bash", command=cmd))[0] == code


# The R2 commit trailers must not look like a nested Claude Code process ----------


def test_commit_with_r2_trailers_allowed(ws):
    assert run_guard(ws, tool("Bash", command=R2_COMMIT))[0] == 0
    assert run_guard(ws, tool("Bash", command=f"git add -A && {R2_COMMIT}"))[0] == 0


# Path forms -----------------------------------------------------------------------


def test_home_relative_path_is_expanded(ws):
    home = ws / "odoo-reference"
    assert run_guard(ws, tool("Read", file_path="~/enterprise/x.py"), home=home)[0] == 2
    assert run_guard(ws, tool("Grep", pattern="x", path="~"), home=home)[0] == 2


def test_relative_paths_resolve_against_cwd(ws):
    cwd = str(ws / "odoo-reference")
    assert run_guard(ws, tool("Read", cwd=cwd, file_path="enterprise/x.py"))[0] == 2
    assert run_guard(ws, tool("Read", cwd=cwd, file_path="community/x.py"))[0] == 0


def test_cwd_inside_a_forbidden_area_denied(ws):
    cwd = str(ws / "odoo-reference" / "enterprise")
    assert run_guard(ws, tool("Bash", cwd=cwd, command="ls"))[0] == 2
    assert run_guard(ws, tool("Grep", cwd=str(ws / "complete-specs/analysis"), pattern="x"))[0] == 2


@pytest.mark.parametrize(
    "name,tool_input",
    [
        ("Read", {"file_path": "ref/enterprise/x.py"}),
        ("Read", {"file_path": "ref/enterprise/"}),
        ("Read", {"file_path": "ref/enterprise"}),
        ("Read", {"file_path": "ee/x.py"}),
        ("Read", {"file_path": "specs/analysis/x"}),
        ("Edit", {"file_path": "ee/x.py", "old_string": "1", "new_string": "2"}),
        ("Write", {"file_path": "ee/new.py", "content": "x"}),
        ("MultiEdit", {"file_path": "ee/x.py", "edits": []}),
        ("NotebookEdit", {"notebook_path": "ee/n.ipynb", "new_source": "x"}),
        ("Grep", {"pattern": "x", "path": "ee"}),
        ("Grep", {"pattern": "x", "path": "ref"}),
        ("Grep", {"pattern": "x", "path": "specs"}),
        ("Grep", {"pattern": "x", "path": "specs/analysis"}),
        ("Glob", {"pattern": "*.py", "path": "ee"}),
        ("Glob", {"pattern": "**/*.py", "path": "ref"}),
        ("Glob", {"pattern": "ee/**"}),
        ("Glob", {"pattern": "ref/*/x.py"}),
        ("Glob", {"pattern": "specs/analysis/*"}),
        ("Glob", {"pattern": "*", "path": "specs"}),
    ],
)
def test_symlinked_paths_denied(links, name, tool_input):
    assert run_guard(links, tool(name, **tool_input))[0] == 2


@pytest.mark.parametrize(
    "name,tool_input",
    [
        ("Read", {"file_path": "specs/slices/000-timer/spec.md"}),
        ("Grep", {"pattern": "x", "path": "specs/slices"}),
        ("Glob", {"pattern": "specs/slices/**/*.md"}),
        ("Read", {"file_path": "ref/community/x.py"}),
        ("Grep", {"pattern": "x", "path": "ref/community"}),
    ],
)
def test_symlinked_shared_paths_allowed(links, name, tool_input):
    assert run_guard(links, tool(name, **tool_input))[0] == 0


@pytest.mark.parametrize(
    "name,tool_input,code",
    [
        ("Grep", {"pattern": "x"}, 0),
        ("Grep", {"pattern": "x", "path": ".."}, 2),
        ("Grep", {"pattern": "x", "path": "/"}, 2),
        ("Grep", {"pattern": "x", "path": "{ws}/odoo-reference"}, 2),
        ("Grep", {"pattern": "x", "path": "{ws}/odoo-reference/community"}, 0),
        ("Grep", {"pattern": "x", "path": "{ws}/complete-specs"}, 2),
        ("Grep", {"pattern": "x", "path": "{ws}/complete-specs/slices"}, 0),
        ("Grep", {"pattern": "x", "path": "{ws}/complete-specs/templates"}, 0),
        ("Glob", {"pattern": "**/*.py"}, 0),
        ("Glob", {"pattern": "addons/**/*.py", "path": "{ws}/complete"}, 0),
        ("Glob", {"pattern": "**/*.py", "path": "{ws}"}, 2),
        ("Glob", {"pattern": "*", "path": "{ws}/complete-specs"}, 2),
        ("Glob", {"pattern": "slices/**/*.md", "path": "{ws}/complete-specs"}, 0),
        ("Glob", {"pattern": "**/*.md", "path": "{ws}/complete-specs"}, 2),
        ("Glob", {"pattern": "{ws}/odoo-reference/enterprise/**/*.py"}, 2),
        ("Glob", {"pattern": "{ws}/odoo-reference/enter*/**"}, 2),
        ("Glob", {"pattern": "{ws}/*/enterprise/x.py"}, 2),
        ("Glob", {"pattern": "/**/x.py"}, 2),
        ("Glob", {"pattern": "~/odoo-reference/*/x.py"}, 2),
        ("Glob", {"pattern": "../odoo-reference/*/x.py"}, 2),
        ("Glob", {"pattern": "*/../../odoo-reference/x.py"}, 2),
        ("Glob", {"pattern": "{x,{ws}/odoo-reference}/**"}, 2),
    ],
)
def test_search_roots(ws, name, tool_input, code):
    tool_input = {key: fill(value, ws) for key, value in tool_input.items()}
    assert run_guard(ws, tool(name, **tool_input))[0] == code


# Owner-managed files ----------------------------------------------------------------


@pytest.mark.parametrize(
    "name,tool_input",
    [
        ("Write", {"file_path": ".claude/hooks/guard.py", "content": "x"}),
        ("Edit", {"file_path": "{ws}/complete/.claude/hooks/guard.py", "old_string": "a"}),
        ("Write", {"file_path": ".claude/settings.json", "content": "{}"}),
        ("Write", {"file_path": ".claude/settings.local.json", "content": "{}"}),
        ("Write", {"file_path": "~/.claude/settings.json", "content": "{}"}),
        ("Write", {"file_path": "~/.claude.json", "content": "{}"}),
        ("Write", {"file_path": "../complete-audit/today.jsonl", "content": ""}),
        ("Edit", {"file_path": "../complete-specs/slices/000-timer/spec.md", "old_string": "a"}),
        ("Write", {"file_path": "../odoo-reference/community/x.py", "content": ""}),
        ("Write", {"file_path": ".claude/agents/x.md", "content": "x"}),
        ("Write", {"file_path": ".git/hooks/pre-commit", "content": "x"}),
        ("Edit", {"file_path": ".git/config", "old_string": "a"}),
        ("Write", {"file_path": "~/.config/containers/containers.conf", "content": "x"}),
    ],
)
def test_owner_managed_files_not_writable(ws, name, tool_input):
    tool_input = {key: fill(value, ws) for key, value in tool_input.items()}
    assert run_guard(ws, tool(name, **tool_input))[0] == 2


def test_ordinary_writes_and_config_reads_allowed(ws):
    write = tool("Write", file_path="addons/complete_x/__init__.py", content="x = 1\n")
    edit = tool("Edit", file_path="README.md", old_string="a", new_string="b")
    assert run_guard(ws, write)[0] == 0
    assert run_guard(ws, edit)[0] == 0
    assert run_guard(ws, tool("Read", file_path=".claude/hooks/guard.py"))[0] == 0


# Text scan ----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name,tool_input",
    [
        ("Write", {"file_path": "notes.md", "content": "see ../odoo-reference/enterprise here"}),
        ("Edit", {"file_path": "README.md", "old_string": "complete-specs/env/x"}),
        ("Agent", {"description": "d", "prompt": "summarise complete-specs/evidence/run.md"}),
        ("TodoWrite", {"todos": [{"content": "diff odoo-20.0+e.20261106", "status": "pending"}]}),
        ("mcp__fs__read", {"paths": ["../odoo-reference/enterprise/x.py"]}),
    ],
)
def test_text_scan_covers_every_tool(ws, name, tool_input):
    assert run_guard(ws, tool(name, **tool_input))[0] == 2


@pytest.mark.parametrize(
    "cmd",
    [
        "cat ../odoo-reference/community/../enterprise/x.py",
        "cat ../odoo-reference//enterprise/x.py",
        "cat ../odoo-reference/./enterprise/x.py",
        "cat \"../odoo-reference\"/'enterprise'/x.py",
        "cat ../odoo-reference/enter\\prise/x.py",
        "ls /tmp/odoo-20.0+e.20261106",
        "bash -c 'claude -p hi'",
        "cd /tmp && claude -p hi",
        "echo hi | claude",
        "sed -i s/2/0/ .claude/hooks/guard.py",
        "cd .claude/./hooks && ls",
        "rm .claude/settings.local.json",
        "rm -rf .claude",
        "cat ~/.claude.json",
        "echo '{\"disableAllHooks\": true}' > x.json",
    ],
)
def test_bash_bypass_attempts_denied(ws, cmd):
    assert run_guard(ws, tool("Bash", command=cmd))[0] == 2


@pytest.mark.parametrize(
    "cmd",
    [
        "ls ../odoo-reference/community",
        "grep -rn claude-code docs",
        "cat CLAUDE.md",
        "ls .claude/agents",
        "make test MODULES=complete_x",
        "git status && git add -A",
    ],
)
def test_bash_ordinary_commands_allowed(ws, cmd):
    assert run_guard(ws, tool("Bash", command=cmd))[0] == 0


def test_sandbox_override_denied(ws):
    assert run_guard(ws, tool("Bash", command="ls", dangerouslyDisableSandbox=True))[0] == 2


@pytest.mark.parametrize(
    "cmd,code",
    [
        ("podman run --rm -v {ws}/odoo-reference:/r alpine cat /r/enterprise/x.py", 2),
        ("podman run --rm -v ..:/w alpine ls /w", 2),
        ("podman run --rm -v /:/host alpine ls /host", 2),
        ("podman run --rm -v ~:/h alpine ls /h", 2),
        ("podman run --rm -v $HOME/odoo-reference:/r alpine ls /r", 2),
        ("podman run --rm -v ${HOME}/odoo-reference:/r alpine ls /r", 2),
        ("podman run --rm -v $SRC/x:/r alpine ls /r", 2),
        ('podman run --rm -v "$(dirname "$PWD")":/r alpine ls /r', 2),
        ("podman run --rm --mount type=bind,source=../odoo-reference,target=/r alpine ls", 2),
        ("podman run --rm -v../complete-specs:/s alpine ls /s", 2),
        ("docker run --rm -v ../odoo-reference:/r alpine ls /r", 2),
        ("podman run --rm -v ./addons:/mnt/extra-addons:ro alpine ls /mnt/extra-addons", 0),
        ("podman run --rm -v $PWD/addons:/mnt alpine ls /mnt", 2),
        ("podman run --rm -v ../odoo-reference/community:/ce:ro alpine ls /ce", 0),
        ("podman run --rm -v ../complete-specs/slices:/s:ro alpine ls /s", 0),
        ("podman compose -f docker/compose.yaml ps", 0),
        ("podman ps -a", 0),
    ],
)
def test_container_host_paths(ws, cmd, code):
    assert run_guard(ws, tool("Bash", command=fill(cmd, ws)))[0] == code


# Web ------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "url,code",
    [
        ("https://www.odoo.com/documentation/20.0/", 0),
        ("https://GitHub.com/OCA/web", 0),
        ("https://pypi.org/project/ruff/", 0),
        ("http://github.com/OCA/web", 2),
        ("https://github.com.example.com/", 2),
        ("https://gist.github.com/x", 2),
        ("https://github.com@example.com/", 2),
        ("https://example.com\\@github.com/", 2),
        ("https://example.com#@github.com", 2),
        ("github.com/OCA/web", 2),
        ("", 2),
    ],
)
def test_webfetch_url_rules(ws, url, code):
    assert run_guard(ws, tool("WebFetch", url=url, prompt="x"))[0] == code


def test_webfetch_without_url_denied(ws):
    assert run_guard(ws, tool("WebFetch", prompt="x"))[0] == 2


def test_mcp_tool_urls_follow_the_allowlist(ws):
    assert run_guard(ws, tool("mcp__browser__navigate", url="https://example.com/"))[0] == 2
    assert run_guard(ws, tool("mcp__browser__navigate", url="https://github.com/OCA"))[0] == 0


@pytest.mark.parametrize(
    "tool_input,code",
    [
        ({"query": "odoo timer"}, 2),
        ({"query": "odoo timer", "allowed_domains": []}, 2),
        ({"query": "odoo timer", "allowed_domains": ["www.odoo.com"]}, 0),
        ({"query": "odoo timer", "allowed_domains": ["www.odoo.com", "example.com"]}, 2),
    ],
)
def test_websearch_needs_allowlisted_domains(ws, tool_input, code):
    assert run_guard(ws, tool("WebSearch", **tool_input))[0] == code


# Failing closed -------------------------------------------------------------------------


def _event(**fields):
    return json.dumps({"session_id": "s", **fields})


@pytest.mark.parametrize(
    "text",
    [
        "",
        "[]",
        '"x"',
        b"\xff\xfe{",
        _event(tool_name="Bash", tool_input={"command": "ls"}),
        _event(cwd="relative", tool_name="Bash", tool_input={"command": "ls"}),
        _event(cwd="/", tool_input={"command": "ls"}),
        _event(cwd="/", tool_name="Read", tool_input="x"),
        _event(cwd="/", tool_name="Read", tool_input={"file_path": 1}),
        _event(cwd="/", tool_name="Read", tool_input={"file_path": "a\x00b"}),
        _event(cwd="/", tool_name="Bash", tool_input={"command": None}),
        _event(cwd="/", tool_name="Glob", tool_input={"pattern": "{a,b}" * 20}),
    ],
)
def test_malformed_events_fail_closed(ws, text):
    assert run_guard_raw(ws, text)[0] == 2


@pytest.mark.parametrize(
    "exc", [RuntimeError("boom"), KeyboardInterrupt(), SystemExit(0), SystemExit(1)]
)
def test_any_exception_in_decide_fails_closed(ws, monkeypatch, exc):
    guard = load_guard(ws)

    def explode(event):
        raise exc

    monkeypatch.setattr(guard, "decide", explode)
    assert call_main(guard, tool("Bash", cwd=str(ws / "complete"), command="ls")) == 2


@pytest.mark.parametrize("exc", [OSError("disk full"), KeyboardInterrupt(), SystemExit(0)])
def test_any_exception_in_audit_fails_closed(ws, monkeypatch, exc):
    guard = load_guard(ws)

    def explode(*args):
        raise exc

    monkeypatch.setattr(guard, "_audit", explode)
    assert call_main(guard, tool("Bash", cwd=str(ws / "complete"), command="ls")) == 2


def test_only_a_true_decision_allows(ws, monkeypatch):
    guard = load_guard(ws)
    monkeypatch.setattr(guard, "decide", lambda event: (1, "truthy is not enough"))
    assert call_main(guard, tool("Bash", cwd=str(ws / "complete"), command="ls")) == 2


# Audit log ----------------------------------------------------------------------------


def test_audit_record_contents(ws):
    event = tool("Read", file_path="../odoo-reference/enterprise/x.py")
    event.update(agent_id="agent-1", agent_type="Explore")
    code, stderr = run_guard(ws, event)
    assert code == 2 and "EE reference tree" in stderr
    (record,) = audit_lines(ws)
    canonical = json.dumps(event["tool_input"], sort_keys=True, separators=(",", ":"))
    assert record["session_id"] == "test-session"
    assert record["agent_id"] == "agent-1" and record["agent_type"] == "Explore"
    assert record["tool_name"] == "Read" and record["allowed"] is False
    assert "EE reference tree" in record["reason"]
    assert record["input_sha256"] == hashlib.sha256(canonical.encode()).hexdigest()
    assert record["preview"] == "../odoo-reference/enterprise/x.py"
    assert datetime.fromisoformat(record["ts"]).utcoffset().total_seconds() == 0


def test_audit_preview_is_truncated(ws):
    command = "echo " + "x" * 500
    assert run_guard(ws, tool("Bash", command=command))[0] == 0
    (record,) = audit_lines(ws)
    assert record["allowed"] is True and record["preview"] == command[:200]
    assert record["agent_id"] is None and record["agent_type"] is None


def test_malformed_input_is_audited(ws):
    assert run_guard_raw(ws, "not json")[0] == 2
    (record,) = audit_lines(ws)
    assert record["allowed"] is False and record["tool_name"] is None


# The committed files --------------------------------------------------------------------


def test_guard_script_shape():
    lines = GUARD.read_text(encoding="utf-8").splitlines()
    assert lines[0] == "#!/usr/bin/env python3"
    assert lines[1:3] == [
        "# Copyright 2026 Complete contributors",
        "# SPDX-License-Identifier: AGPL-3.0-only",
    ]
    assert lines[-2:] == ['if __name__ == "__main__":', "    sys.exit(main())"]
    assert os.access(GUARD, os.X_OK)


def test_guard_uses_the_standard_library_only():
    modules = set()
    for node in ast.walk(ast.parse(GUARD.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            modules.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            modules.add((node.module or "").split(".")[0])
    assert modules <= set(sys.stdlib_module_names) | {"__future__"}


def test_committed_settings_json():
    assert json.loads(SETTINGS.read_text(encoding="utf-8")) == {
        "hooks": {
            "PreToolUse": [
                {
                    "matcher": "*",
                    "hooks": [
                        {
                            "type": "command",
                            "command": (
                                'python3 -I "${CLAUDE_PROJECT_DIR}/.claude/hooks/guard.py"'
                                " || exit 2"
                            ),
                            "timeout": 10,
                            "onFailure": "block",
                        }
                    ],
                }
            ]
        }
    }


# Fix round 1 ----------------------------------------------------------------------------

EE_GLOB = "../odoo-ref*/ent*/x.py"


# R29 (C1): container commands run outside the sandbox. A command that has podman or
# docker in command position must be one simple command without shell syntax.


@pytest.mark.parametrize(
    "cmd",
    [
        # The reviewer's probe forms.
        f"podman run --rm -i alpine cat < {EE_GLOB}",
        f"podman cp {EE_GLOB} c:/x",
        "podman build -t t ../odoo-ref*",
        "podman run --rm -v{ws}/odoo-reference/{community:/c,enterprise:/e} alpine cat /e/x.py",
        f"podman ps; cat {EE_GLOB}",
        "podman run --rm -i alpine cat < ../odoo-reference/\\\nenterprise/x.py",
        f"podman unshare sh -c 'cat {EE_GLOB}'",
        # Glob host paths without a redirect.
        "podman run --rm -v ../odoo-ref?rence:/r alpine ls /r",
        "podman run --rm -v ../odoo-ref[e]rence:/r alpine ls /r",
        "podman run --rm -v ../odoo-*:/r alpine ls /r",
        # Shell syntax of any kind.
        "podman run --rm alpine ls $(pwd)",
        "podman run --rm -v `pwd`:/w alpine ls /w",
        "podman run --rm -v ${X}:/w alpine ls /w",
        "podman run --rm -v ~/x:/h alpine ls /h",
        "podman ps | head",
        "podman ps && ls",
        "podman ps > out.txt",
        "podman ps &",
        "podman ps\nls",
        "podman run -i alpine sh <<EOF\nls\nEOF",
        # Command position after separators, inside groups and substitutions.
        "ls && podman ps",
        "ls || podman ps",
        "echo x; podman ps",
        "echo x\npodman ps",
        "(podman ps)",
        "{ podman ps; }",
        "echo $(podman ps)",
        "echo `podman ps`",
        "if true; then podman ps; fi",
        "2>/dev/null podman ps -a",
        # Quoting or a path does not hide the command word.
        "'podman' run --rm -v ../odoo-ref*:/r alpine ls /r",
        "\\podman run --rm -v ../odoo-ref*:/r alpine ls /r",
        "/usr/bin/podman run --rm -v ..:/w alpine ls /w",
        "docker run --rm -v ../odoo-ref*:/r alpine ls /r",
        # Subcommands that leave podman's normal model.
        "podman unshare ls",
        "podman machine ssh",
        "podman system service unix:///tmp/p.sock",
        "podman system connection add x ssh://h",
        # Global flags that send the command elsewhere or change what runs on the host.
        "podman --remote ps",
        "podman -r ps",
        "podman --url tcp://h:1 ps",
        "podman --url=tcp://h:1 ps",
        "podman --connection x ps",
        "podman -c x ps",
        "podman --identity k ps",
        "podman --hooks-dir /tmp/h run alpine ls",
        "podman --runtime /tmp/r run alpine ls",
        # Prefixes and wrappers.
        "CONTAINER_HOST=ssh://h podman ps",
        "env podman ps",
        "sudo podman ps",
        "timeout 60 podman ps",
        "nohup podman ps",
        # Parsing failures fail closed when a container CLI is mentioned.
        'echo "podman',
        # A quoted heredoc marker is not a heredoc, so the next line still runs.
        'echo "<<X"\npodman ps\nX',
        # A heredoc marker in a comment is not a heredoc either.
        "ls # <<X\npodman ps\nX",
        # An unterminated heredoc is not stripped.
        "cat <<EOF\npodman ps",
    ],
)
def test_container_commands_denied(ws, cmd):
    assert run_guard(ws, tool("Bash", command=fill(cmd, ws)))[0] == 2


def test_container_symlink_without_a_slash_denied(links):
    assert run_guard(links, tool("Bash", command="podman cp ee c:/x"))[0] == 2


@pytest.mark.parametrize(
    "cmd",
    [
        "podman compose -f docker/compose.yaml run --rm odoo odoo -d test_x -i complete_x"
        " --test-tags /complete_x --stop-after-init",
        "podman compose -f docker/compose.yaml ps",
        "podman run --rm -v ./addons:/mnt/extra-addons:ro alpine ls /mnt/extra-addons",
        "podman ps -a",
        "podman images",
        "podman --version",
        "docker ps",
        # Heredoc bodies and quoted arguments of other commands are not container commands.
        "cat <<EOF > notes.md\npodman run --rm -v ${X}:/x alpine\nEOF",
        "cat <<'EOF' > notes.md\npodman ps; echo $(pwd)\nEOF",
        'cat <<"EOF" > notes.md\npodman ps | head\nEOF',
        "cat <<-EOF > notes.md\n\tpodman ps $X\n\tEOF",
        "cat > a.md <<EOF\npodman $A\nEOF\ncat > b.md <<EOF\ndocker $B\nEOF",
        "echo 'run podman $(pwd) later'",
        "echo podman $HOME",
        "git commit -m 'docs: explain podman ${X} and $(cmd)'",
        'git commit -m "docs: podman ps | head"',
        "grep -rn podman docs",
        "ls docker",
    ],
)
def test_container_commands_allowed(ws, cmd):
    assert run_guard(ws, tool("Bash", command=cmd))[0] == 0


# R25 (I1): the bare specs repository root is off limits in shell commands.


@pytest.mark.parametrize(
    "cmd,code",
    [
        ("cd ../complete-specs", 2),
        ("cd ../complete-specs && ls analysis", 2),
        ("git -C ../complete-specs log", 2),
        ("git --git-dir=../complete-specs/.git log", 2),
        ("ls {ws}/complete-specs", 2),
        ("ls {ws}/complete-specs/", 2),
        ("ls ../complete-specs/slices/..", 2),
        ("ls ../complete-specs/./", 2),
        ("cd .. && ls complete-specs", 2),
        ("gh repo view volkantasci/complete-specs", 2),
        ("ls ../complete-specs/slices", 0),
        ("ls ../complete-specs/./slices", 0),
        ("cat ../complete-specs/templates/spec.md", 0),
        ("podman run --rm -v ../complete-specs/slices:/s:ro alpine ls /s", 0),
    ],
)
def test_bare_specs_root_in_shell_commands(ws, cmd, code):
    assert run_guard(ws, tool("Bash", command=fill(cmd, ws)))[0] == code


def test_bare_specs_root_as_search_root_denied(ws):
    for pattern in ("*", "*.md", "README.md", "{slices,analysis}"):
        assert run_guard(ws, tool("Glob", pattern=pattern, path=f"{ws}/complete-specs"))[0] == 2
    assert run_guard(ws, tool("Glob", pattern="../complete-specs/*"))[0] == 2
    assert run_guard(ws, tool("Glob", pattern="../complete-specs/slices/*"))[0] == 0


# R31 (M1): prose punctuation is not a path segment; globs stay globs.


@pytest.mark.parametrize(
    "text,code",
    [
        ("The repo `{ws}/complete-specs/`.", 0),
        ("Specs live in ../complete-specs/slices.", 0),
        ("Templates: ../complete-specs/templates.", 0),
        ("**complete-specs/slices**", 0),
        ("[complete-specs/slices]", 0),
        ("see ../complete-specs/slices/.", 0),
        ("see ../complete-specs/slices/000-timer/spec.md.", 0),
        ("(see complete-specs/templates)!", 0),
        ("Is it complete-specs/slices?", 0),
        ("{complete-specs/slices}", 0),
        ("see complete-specs/./slices/x.md", 0),
        ("see complete-specs/../complete-specs/templates", 0),
        ("Never read ../complete-specs/analysis.", 2),
        ("**complete-specs/analysis**", 2),
        ("[complete-specs/analysis]", 2),
        ("see complete-specs/./analysis", 2),
        ("complete-specs/../complete-specs/analysis.", 2),
        ("complete-specs/slices*", 2),
        ("complete-specs/s*", 2),
        ("**complete-specs/slices*", 2),
        ("*complete-specs/slices**", 2),
        ("complete-specs/slices-old.", 2),
    ],
)
def test_prose_punctuation_around_specs_paths(ws, text, code):
    event = tool("Write", file_path="notes.md", content=fill(text, ws))
    assert run_guard(ws, event)[0] == code


@pytest.mark.parametrize(
    "cmd",
    ["ls ../complete-specs/slices*", "ls ../complete-specs/s*", "ls ../complete-specs/./analysis"],
)
def test_specs_globs_in_shell_commands_denied(ws, cmd):
    assert run_guard(ws, tool("Bash", command=cmd))[0] == 2


# R30: git hooks run outside the guard's view.


@pytest.mark.parametrize(
    "cmd,code",
    [
        ("git config core.hooksPath /tmp/h", 2),
        ("git config core.hookspath /tmp/h", 2),
        ("git -c core.hooksPath=/tmp/h commit -m x", 2),
        ("cp x .git/hooks/pre-commit", 2),
        ("cp x .git//hooks/pre-commit", 2),
        ("cp x .git/./hooks/pre-commit", 2),
        ("cp x '.git'/hooks/pre-commit", 2),
        ("ls .GIT/HOOKS", 2),
        ('git commit -m "fix: x"', 0),
        ("cat .gitignore", 0),
        ("ls .github/workflows", 0),
    ],
)
def test_git_hooks_in_shell_commands(ws, cmd, code):
    assert run_guard(ws, tool("Bash", command=cmd))[0] == code


# R28 (I4): a copy of the guard in a worktree has the wrong workspace root.


def test_worktree_copy_inside_the_config_directory_denies_everything(ws):
    wt = ws / "complete" / ".claude" / "worktrees" / "feat"
    (wt / ".claude" / "hooks").mkdir(parents=True)
    shutil.copy2(GUARD, wt / ".claude" / "hooks" / "guard.py")
    code, stderr = run_hook_command(ws, tool("Bash", cwd=str(wt), command="ls"), repo=wt)
    assert code == 2 and "worktree" in stderr
    assert not (ws / "complete" / ".claude" / "worktrees" / "complete-audit").exists()
    assert not (ws / "complete-audit").exists()
    assert load_guard_at(wt).decide(tool("Bash", cwd=str(wt), command="ls"))[0] is False


def test_repository_with_a_git_file_denies_everything(ws):
    (ws / "complete" / ".git").write_text("gitdir: /elsewhere/.git/worktrees/x\n")
    code, stderr = run_guard(ws, tool("Bash", command="ls"))
    assert code == 2 and "worktree" in stderr
    assert not (ws / "complete-audit").exists()


def test_repository_with_a_git_directory_allowed(ws):
    (ws / "complete" / ".git").mkdir()
    assert run_guard(ws, tool("Bash", command="ls"))[0] == 0


def load_guard_at(repo):
    spec = importlib.util.spec_from_file_location(
        "guard_at_" + repo.name, repo / ".claude" / "hooks" / "guard.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# R27 (I3): the hook command isolates the interpreter and fails closed.

DENIED_READ = tool("Read", file_path="../odoo-reference/enterprise/x.py")


def test_hook_command_ignores_a_planted_module(ws):
    hooks = ws / "complete" / ".claude" / "hooks"
    (hooks / "json.py").write_text("import os\nos._exit(0)\n")
    event = json.dumps({**DENIED_READ, "cwd": str(ws / "complete")}).encode()
    # Without -I the planted module would win: the call is let through.
    plain = subprocess.run(
        [sys.executable, str(hooks / "guard.py")], input=event, capture_output=True, timeout=60
    )
    assert plain.returncode == 0
    assert run_hook_command(ws, DENIED_READ)[0] == 2


def test_hook_command_ignores_user_site_packages(ws):
    version = f"python{sys.version_info[0]}.{sys.version_info[1]}"
    site = ws / ".local" / "lib" / version / "site-packages"
    site.mkdir(parents=True)
    (site / "zz.pth").write_text("import os; os._exit(0)\n")
    assert run_hook_command(ws, DENIED_READ)[0] == 2


def test_import_failure_exits_2(ws):
    guard = ws / "complete" / ".claude" / "hooks" / "guard.py"
    text = guard.read_text(encoding="utf-8")
    first_import = "\nimport functools"
    assert text.count(first_import) == 1
    guard.write_text(text.replace(first_import, "\nimport complete_missing_module" + first_import))
    allowed = tool("Bash", cwd=str(ws / "complete"), command="ls")
    proc = subprocess.run(
        [sys.executable, "-I", str(guard)],
        input=json.dumps(allowed).encode(),
        capture_output=True,
        timeout=60,
    )
    assert proc.returncode == 2
    assert run_hook_command(ws, allowed)[0] == 2


def test_hook_command_blocks_when_the_guard_cannot_compile(ws):
    guard = ws / "complete" / ".claude" / "hooks" / "guard.py"
    guard.write_text(guard.read_text(encoding="utf-8") + "\ndef broken(:\n")
    assert run_hook_command(ws, tool("Bash", command="ls"))[0] == 2


def test_excepthook_is_installed_before_other_imports():
    body = ast.parse(GUARD.read_text(encoding="utf-8")).body
    hook = next(
        i
        for i, node in enumerate(body)
        if isinstance(node, ast.If) and "excepthook" in ast.unparse(node)
    )
    for i, node in enumerate(body):
        if isinstance(node, ast.ImportFrom) and node.module == "__future__":
            continue
        if isinstance(node, ast.Import) and [a.name for a in node.names] == ["sys"]:
            assert i < hook
            continue
        if isinstance(node, ast.Import | ast.ImportFrom):
            assert i > hook, ast.unparse(node)


def test_hook_command_allows_an_ordinary_call(ws):
    assert run_hook_command(ws, tool("Bash", command="ls")) == (0, "")


# R32 (M4): fixable denials say how to fix the call; boundary denials say not to.


def test_websearch_denial_says_how_to_retry(ws):
    code, stderr = run_guard(ws, tool("WebSearch", query="odoo timer"))
    assert code == 2
    assert "allowed_domains" in stderr and "www.odoo.com" in stderr and "pypi.org" in stderr
    assert "retry" in stderr.lower() and "boundary" not in stderr.lower()


def test_boundary_denial_says_not_to_work_around(ws):
    code, stderr = run_guard(ws, DENIED_READ)
    assert code == 2 and "Do not retry" in stderr and "boundary" in stderr


# Fix round 2 ----------------------------------------------------------------------------

# R29 (C1, round 2): constructs the guard does not model make it fail closed when a
# container CLI is mentioned, instead of mis-reading what bash runs.


@pytest.mark.parametrize(
    "cmd",
    [
        # The re-review's forms: bash runs the podman line in each.
        "echo $((1<<2))\npodman run --rm -v {ws}/odoo-ref*/ent*:/x img ls /x\n2",
        "((x=1<<3))\npodman run --rm -v {ws}/odoo-ref*/ent*:/x img ls /x\n3",
        "echo $(true)# ; podman run --rm -v {ws}/odoo-ref*/ent*:/x img ls /x",
        "echo $'\\''; podman run --rm -v {ws}/odoo-ref*/ent*:/x img ls /x #'",
        "echo $'\\''\npodman cp c:/a {ws}/odoo-ref*/ent*/ #'",
        # Arithmetic and subscripts.
        "x=$[1<<2]\npodman ps\n2",
        "a[1<<2]=x\npodman ps\n2",
        "a[1<<2]=x\npodman ps\n2]=x",
        "echo $((1<<2\n+0))\npodman ps\n2\n))",
        "for ((i=0; i<1; i++)); do :; done\npodman ps",
        "echo ${x#<<}\npodman ps",
        # Comments.
        "(true)# ; podman ps",
        "echo x;# ; podman ps",
        # Quoting forms.
        "echo $'a\\'b'; podman ps",
        'echo $"x"; podman ps',
        'echo "$(echo ")"; podman ps; echo "(")"',
        'echo "$(podman ps)"',
        # Here-documents.
        'cat <<"E"OF\nx\nEOF\npodman ps\nE',
        "cat <<E\\OF\nx\nEOF\npodman ps\nE",
        "cat <<EOF\n$(podman ps)\nEOF",
        "cat <<EOF\n`podman ps`\nEOF",
        "x=$(cat <<EOF\npodman ps\nEOF\n); podman ps",
        # Other syntax the guard does not model.
        "case x in a) podman ps;; esac",
        "[[ -n x ]] && podman ps",
    ],
)
def test_container_commands_hidden_from_simple_parsers_denied(ws, cmd):
    assert run_guard(ws, tool("Bash", command=fill(cmd, ws)))[0] == 2


@pytest.mark.parametrize(
    "cmd",
    [
        "git commit -m \"$(cat <<'EOF'\nfix(docker): bump the podman image\n\nBody $X.\nEOF\n)\"",
        "echo a#b podman",
        "echo $(date) podman # docker",
        "ls 2>/dev/null; echo podman",
        "let x=1<<2\npodman ps\n2",
    ],
)
def test_container_mentions_in_modelled_syntax_allowed(ws, cmd):
    assert run_guard(ws, tool("Bash", command=cmd))[0] == 0


# Container commands must not reach owner-managed locations: podman writes outside the
# sandbox, so the sandbox's denyWrite does not apply to it.


@pytest.fixture
def home(ws):
    home = ws / "home"
    (home / ".config" / "containers").mkdir(parents=True)
    (home / "data").mkdir()
    return home


@pytest.mark.parametrize(
    "cmd",
    [
        "podman run --rm -v {ws}/complete:/r alpine cp /r/tools/evil.cfg /r/.git/config",
        "podman run --rm -v {ws}/complete:/r -w /r/.git alpine cp /r/tools/h.sh hooks/pre-commit",
        "podman run --rm -v .:/r alpine ls /r",
        "podman run --rm -v ./.git:/g alpine ls /g",
        "podman run --rm --mount type=bind,source=.git,target=/g alpine ls /g",
        "podman run --rm -v ./.claude:/c alpine ls /c",
        "podman cp c:/x .git",
        "podman cp c:/x .",
        "podman cp .git c:/x",
        "podman build -t t .",
        "podman run --rm -v {ws}/complete-audit:/a alpine ls /a",
        "podman run --rm -v {home}/.config/containers:/c alpine ls /c",
        "podman run --rm -v {home}/.config:/c alpine ls /c",
        "podman run --rm -v {home}:/h alpine ls /h",
        "podman run --rm -v {home}/.claude.json:/c alpine ls /c",
        "podman run --rm -v ./addons/gitlink:/g alpine ls /g",
    ],
)
def test_container_owner_managed_paths_denied(ws, home, cmd):
    (ws / "complete" / ".git").mkdir()
    (ws / "complete" / "addons").mkdir()
    (ws / "complete" / "addons" / "gitlink").symlink_to(ws / "complete" / ".git")
    command = fill(cmd, ws).replace("{home}", str(home))
    assert run_guard(ws, tool("Bash", command=command), home=home)[0] == 2


@pytest.mark.parametrize(
    "cmd",
    [
        "podman run --rm -v ./addons:/mnt/extra-addons alpine ls /mnt/extra-addons",
        "podman run --rm -v {home}/data:/d alpine ls /d",
        "podman build -t t docker/",
        "podman compose -f docker/compose.yaml run --rm odoo odoo -d test_x -i complete_x"
        " --test-tags /complete_x --stop-after-init",
    ],
)
def test_container_ordinary_paths_allowed(ws, home, cmd):
    (ws / "complete" / ".git").mkdir()
    (ws / "complete" / "addons").mkdir()
    command = cmd.replace("{home}", str(home))
    assert run_guard(ws, tool("Bash", command=command), home=home)[0] == 0


def documented_test_command():
    """The module-test command in docs/isolation.md, with its placeholders filled in."""
    text = (REPO / "docs" / "isolation.md").read_text(encoding="utf-8")
    lines = [
        line for line in text.splitlines() if line.startswith("podman compose ") and " run " in line
    ]
    assert len(lines) == 1, "docs/isolation.md must document exactly one module-test command"
    return lines[0].replace("<db>", "test_1").replace("<mods>", "complete_x").replace(
        "<tags>", "/complete_x"
    )


def test_documented_module_test_command_is_allowed(ws):
    command = documented_test_command()
    assert "--env-file docker/versions.env" in command
    assert run_guard(ws, tool("Bash", command=command))[0] == 0


def test_compose_requires_odoo_release():
    compose = (REPO / "docker" / "compose.yaml").read_text(encoding="utf-8")
    assert "${ODOO_RELEASE:?" in compose
