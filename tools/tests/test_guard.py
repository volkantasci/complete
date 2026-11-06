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
        [sys.executable, str(ws / "complete" / ".claude" / "hooks" / "guard.py")],
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
        ("ls ../complete-specs", 0),
        ("ls ../complete-specs/", 0),
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
        ("Glob", {"pattern": "*", "path": "specs"}),
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
        ("Glob", {"pattern": "*", "path": "{ws}/complete-specs"}, 0),
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
        ("podman run --rm -v $PWD/addons:/mnt alpine ls /mnt", 0),
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
                            "command": 'python3 "${CLAUDE_PROJECT_DIR}/.claude/hooks/guard.py"',
                            "timeout": 10,
                            "onFailure": "block",
                        }
                    ],
                }
            ]
        }
    }
