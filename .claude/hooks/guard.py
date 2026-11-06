#!/usr/bin/env python3
# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Clean-room guard: the Claude Code ``PreToolUse`` hook for sessions in ``complete/``.

Claude Code runs this script before every tool call and passes the call as JSON on
stdin. Exit code 0 lets the call continue to the normal permission checks; exit code 2
blocks it and shows stderr to the model. Claude Code lets a call through on any other
exit code, a crash, or a timeout, so every failure here, including a failed audit
write, ends in exit code 2.

The workspace root ``WS`` comes from this file's location,
``<ws>/complete/.claude/hooks/guard.py``. The guard blocks a call when:

* a path argument, after ``~`` expansion and symlink resolution, lies in the EE
  reference tree or in an analyst-only area of ``complete-specs`` (everything except
  ``slices/`` and ``templates/``), or a Grep or Glob search would descend into one;
* any text in the tool input names the EE reference tree, an EE build, or an
  analyst-only area;
* a shell command starts another Claude Code process, touches the isolation
  configuration, asks to leave the sandbox, or gives a container a host path that
  holds a forbidden area;
* a write targets the isolation configuration, the audit log, or the reference and
  specification trees;
* a web request leaves the allowlist.

Every call is appended to ``WS/complete-audit/<UTC date>.jsonl``. Standard library
only. See docs/isolation.md.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import TextIO
from urllib.parse import urlsplit


def _fail_closed(exc_type, exc, tb):
    """Exit with 2 for an exception that escapes ``main``; installed when run as a script."""
    try:
        sys.stderr.write(f"The Complete clean-room guard crashed ({exc_type.__name__}).\n")
        sys.stderr.flush()
    finally:
        os._exit(2)


if __name__ == "__main__":
    sys.excepthook = _fail_closed

WS = Path(__file__).resolve().parents[3]
REPO = Path(__file__).resolve().parents[2]
EE = WS / "odoo-reference" / "enterprise"
SPECS = WS / "complete-specs"
SHARED_SPECS = ("slices", "templates")
AUDIT_DIR = WS / "complete-audit"

ALLOWED_HOSTS = {
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

PATH_KEYS = ("file_path", "path", "notebook_path")
WRITE_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
SEARCH_TOOLS = {"Grep", "Glob"}
PREVIEW_KEYS = (
    "command",
    "file_path",
    "notebook_path",
    "path",
    "url",
    "pattern",
    "query",
    "prompt",
)
PREVIEW_LENGTH = 200
MAX_GLOB_PATTERNS = 256
DENY_NOTE = (
    "This is the clean-room isolation boundary of the Complete project, not a technical "
    "error. Do not retry the action another way; tell the user what was blocked."
)

# A shell command that starts another Claude Code process. The first pattern is the
# one in the plan; the second also catches a quoted command such as `sh -c 'claude …'`.
# Both are case-sensitive and need whitespace or the end after `claude`, so commit
# trailers such as "Claude-Session: https://claude.ai/…" do not match.
NESTED_CLAUDE = re.compile(r"(^|[\s;&|(`])(\S*/)?claude(\s|$)")
QUOTED_CLAUDE = re.compile(r"['\"](\S*/)?claude(\s|$)")
CONTAINER_CLI = re.compile(r"(^|[\s;&|(`'\"])(\S*/)?(podman|docker)(\s|$)")
CONFIG_TEXT = re.compile(
    r"\.claude(/+(hooks|settings)|\.json|/*(?=$|[\s'\"`;&|)]))|disableallhooks", re.IGNORECASE
)
SPECS_SEGMENT = re.compile(r"complete-specs/+([^/]*)", re.IGNORECASE)
TOKEN_SEPARATORS = re.compile(r"[\s'\"`;&|()<>=,:]+")
QUOTING = re.compile(r"[\"'`\\]")
GLOB_MAGIC = re.compile(r"[*?\[\]{}()!\\]")
BRACES = re.compile(r"\{([^{}]*)\}")
OPTION = re.compile(r"^--?[A-Za-z][\w-]*")
SHELL_PWD = re.compile(r"\$\{PWD\}|\$PWD\b|\$\(pwd\)|`pwd`")
SHELL_HOME = re.compile(r"\$\{HOME\}|\$HOME\b")


# Paths ------------------------------------------------------------------------------


def _roots(base: Path) -> tuple[str, str]:
    """The lexical and the symlink-resolved form of a fixed location."""
    return os.path.normpath(base), os.path.realpath(base)


def _absolute_forms(path: str, cwd: str) -> tuple[str, str]:
    """The lexical and the symlink-resolved absolute form of a path argument."""
    if "\0" in path:
        raise ValueError("path contains a NUL byte")
    joined = os.path.join(cwd, os.path.expanduser(path))
    lexical = os.path.normpath(joined)
    if lexical.startswith("//"):
        lexical = "/" + lexical.lstrip("/")
    return lexical, os.path.realpath(joined)


def _inside(path: str, root: str) -> bool:
    return path == root or path.startswith(root.rstrip("/") + "/")


def _forbidden_area(path: str) -> str | None:
    """Name the forbidden area that holds ``path``, if any."""
    if any(_inside(path, root) for root in _roots(EE)):
        return "the EE reference tree"
    for root in _roots(SPECS):
        if path != root and _inside(path, root):
            segment = path[len(root) :].lstrip("/").split("/", 1)[0]
            if segment not in SHARED_SPECS:
                return "an analyst-only area of complete-specs"
    return None


def _holds_forbidden_area(path: str) -> bool:
    """True when a forbidden area lies below ``path``, so a recursive search reaches it."""
    if any(root != path and _inside(root, path) for root in _roots(EE)):
        return True
    return any(_inside(root, path) for root in _roots(SPECS))


def _owner_managed(path: str) -> str | None:
    """Name the owner-managed location that a write to ``path`` would change, if any."""
    home = Path(os.path.expanduser("~"))
    trees = (
        (REPO / ".claude" / "hooks", "the guard hook"),
        (AUDIT_DIR, "the audit log"),
        (WS / "odoo-reference", "the reference sources"),
        (SPECS, "the specification repository"),
    )
    for tree, name in trees:
        if any(_inside(path, root) for root in _roots(tree)):
            return name
    settings = (
        REPO / ".claude" / "settings.json",
        REPO / ".claude" / "settings.local.json",
        home / ".claude" / "settings.json",
        home / ".claude" / "settings.local.json",
        home / ".claude.json",
    )
    if any(path in _roots(file) for file in settings):
        return "the Claude Code settings"
    return None


def _paths_reason(tool: str, tool_input: dict, cwd: str) -> str | None:
    for key in PATH_KEYS:
        value = tool_input.get(key)
        if value is None:
            continue
        if not isinstance(value, str) or "\0" in value:
            return f"the {tool} {key} is not a valid path"
        for path in _absolute_forms(value, cwd):
            area = _forbidden_area(path)
            if area:
                return f"{tool} {key} {value!r} is in {area}"
            target = _owner_managed(path) if tool in WRITE_TOOLS else None
            if target:
                return f"{tool} {key} {value!r} would change {target}, which only the owner edits"
    return None


# Grep and Glob ----------------------------------------------------------------------


def _expand_braces(pattern: str) -> list[str] | None:
    """Expand ``{a,b}`` alternatives, innermost first; None when there are too many."""
    done: list[str] = []
    todo = [pattern]
    while todo:
        current = todo.pop()
        match = next((m for m in BRACES.finditer(current) if "," in m.group(1)), None)
        if match is None:
            done.append(current)
        else:
            head, tail = current[: match.start()], current[match.end() :]
            todo.extend(head + option + tail for option in match.group(1).split(","))
        if len(done) + len(todo) > MAX_GLOB_PATTERNS:
            return None
    return done


def _split_glob(pattern: str) -> tuple[str, str]:
    """Split a glob pattern into its literal leading directories and the rest."""
    parts = pattern.split("/")
    for index, part in enumerate(parts):
        if GLOB_MAGIC.search(part):
            static = "/".join(parts[:index])
            if not static and pattern.startswith("/"):
                static = "/"
            return static, "/".join(parts[index:])
    return pattern, ""


def _search_reason(tool: str, tool_input: dict, cwd: str) -> str | None:
    """Deny a Grep or Glob search that would reach a forbidden area."""
    base = tool_input.get("path") or cwd
    if not isinstance(base, str) or "\0" in base:
        return f"the {tool} path is not a valid path"
    if tool == "Grep":
        searches = [(base, "**")]
    else:
        pattern = tool_input.get("pattern")
        if not isinstance(pattern, str) or "\0" in pattern:
            return "the Glob pattern is not a valid pattern"
        patterns = _expand_braces(pattern)
        if patterns is None:
            return f"the Glob pattern {pattern[:200]!r} has too many alternatives to check"
        searches = []
        for one in patterns:
            static, rest = _split_glob(os.path.expanduser(one))
            if ".." in rest:
                return f"the Glob pattern {pattern[:200]!r} climbs out of its base with '..'"
            searches.append((os.path.join(os.path.expanduser(base), static), rest))
    for root, rest in searches:
        recursive = "/" in rest or "**" in rest
        for path in _absolute_forms(root, cwd):
            area = _forbidden_area(path)
            if area:
                return f"{tool} would search {area}"
            if recursive and _holds_forbidden_area(path):
                return f"{tool} from {path!r} would descend into a forbidden area"
    return None


# Text -------------------------------------------------------------------------------


def _strings(value: object) -> list[str]:
    """Every string in a JSON value, keys included."""
    found: list[str] = []
    stack = [value]
    while stack:
        item = stack.pop()
        if isinstance(item, str):
            found.append(item)
        elif isinstance(item, dict):
            for key, inner in item.items():
                found.append(str(key))
                stack.append(inner)
        elif isinstance(item, list):
            stack.extend(item)
    return found


def _dequote(text: str) -> str:
    """The text with shell quotes, backticks, and backslashes removed."""
    return QUOTING.sub("", text)


def _forms(text: str) -> tuple[list[str], list[str]]:
    """The whole text (as written and unquoted) and its path-like tokens.

    Path-like tokens also appear normalised, so ``a/../b``, ``a//b``, and ``a/./b``
    read as the path they name.
    """
    plain = _dequote(text)
    paths: set[str] = set()
    for token in {*TOKEN_SEPARATORS.split(text), *TOKEN_SEPARATORS.split(plain)}:
        if "/" in token:
            paths.update((token, os.path.normpath(token)))
    return [text, plain], sorted(paths)


def _text_reason(tool_input: dict) -> str | None:
    for text in _strings(tool_input):
        wholes, paths = _forms(text)
        for form in (*wholes, *paths):
            lowered = form.lower()
            if "odoo-reference/enterprise" in lowered:
                return "the input names the EE reference tree"
            if "+e.20" in lowered:
                return "the input names an EE build"
        for form in paths:
            for match in SPECS_SEGMENT.finditer(form):
                if match.group(1) not in ("", *SHARED_SPECS):
                    return "the input names an analyst-only area of complete-specs"
    return None


# Shell commands ---------------------------------------------------------------------


def _container_reason(command: str, cwd: str) -> str | None:
    """Check host paths in a container command; Podman runs outside the sandbox."""
    home = os.path.expanduser("~")
    text = SHELL_PWD.sub(lambda _: cwd, command)
    text = SHELL_HOME.sub(lambda _: home, text)
    if "$(" in text or "`" in text:
        return "a container command uses command substitution, which the guard cannot check"
    for token in TOKEN_SEPARATORS.split(_dequote(text)):
        path = OPTION.sub("", token)
        if not path or not (path[0] in "/~." or "/" in path):
            continue
        if "$" in path:
            return f"the container path {path!r} uses a shell variable the guard cannot resolve"
        for candidate in _absolute_forms(path, cwd):
            if _forbidden_area(candidate) or _holds_forbidden_area(candidate):
                return f"the container path {path!r} would expose a forbidden area"
    return None


def _command_reason(tool_input: dict, cwd: str) -> str | None:
    command = tool_input.get("command")
    if not isinstance(command, str):
        return "the shell command is not a string"
    if NESTED_CLAUDE.search(command) or QUOTED_CLAUDE.search(command):
        return "the command starts another Claude Code process"
    wholes, paths = _forms(command)
    if any(CONFIG_TEXT.search(form) for form in (*wholes, *paths)):
        return "the command touches the isolation configuration, which only the owner edits"
    if any(CONTAINER_CLI.search(form) for form in wholes):
        return _container_reason(command, cwd)
    return None


# Web --------------------------------------------------------------------------------


def _url_reason(url: object) -> str | None:
    if not isinstance(url, str) or not url:
        return "the request has no URL"
    shown = repr(url[:200])
    if "\\" in url or any(ch.isspace() or not ch.isprintable() for ch in url):
        return f"the URL {shown} contains a backslash, whitespace, or a control character"
    parts = urlsplit(url)
    if parts.scheme != "https":
        return f"the URL {shown} does not use https"
    if "@" in parts.netloc:
        return f"the URL {shown} carries credentials"
    if parts.hostname not in ALLOWED_HOSTS:
        return f"the host {parts.hostname!r} is not on the web allowlist"
    return None


def _web_reason(tool: str, tool_input: dict) -> str | None:
    if tool == "WebFetch" or (tool.startswith("mcp__") and "url" in tool_input):
        return _url_reason(tool_input.get("url"))
    if tool == "WebSearch":
        domains = tool_input.get("allowed_domains")
        if (
            not isinstance(domains, list)
            or not domains
            or not all(isinstance(d, str) and d.lower() in ALLOWED_HOSTS for d in domains)
        ):
            return "WebSearch must set allowed_domains to hosts on the web allowlist"
    return None


# Decision and audit -----------------------------------------------------------------


def decide(event: dict) -> tuple[bool, str]:
    """Return ``(allowed, reason)`` for one PreToolUse event."""
    tool = event.get("tool_name")
    tool_input = event.get("tool_input")
    cwd = event.get("cwd")
    if not isinstance(tool, str) or not tool:
        return False, "the hook input names no tool"
    if not isinstance(tool_input, dict):
        return False, f"the {tool} input is not a JSON object"
    if not isinstance(cwd, str) or not os.path.isabs(cwd) or "\0" in cwd:
        return False, "the hook input has no absolute working directory"
    for path in _absolute_forms(cwd, "/"):
        area = _forbidden_area(path)
        if area:
            return False, f"the working directory is in {area}"
    if tool_input.get("dangerouslyDisableSandbox"):
        return False, "the call asks to run outside the sandbox"
    reason = (
        _text_reason(tool_input)
        or _paths_reason(tool, tool_input, cwd)
        or (_search_reason(tool, tool_input, cwd) if tool in SEARCH_TOOLS else None)
        or (_command_reason(tool_input, cwd) if tool == "Bash" or "command" in tool_input else None)
        or _web_reason(tool, tool_input)
    )
    if reason:
        return False, reason
    return True, "allowed"


def _preview(tool_input: object) -> str:
    if isinstance(tool_input, dict):
        for key in PREVIEW_KEYS:
            value = tool_input.get(key)
            if isinstance(value, str):
                return value[:PREVIEW_LENGTH]
    return json.dumps(tool_input, sort_keys=True)[:PREVIEW_LENGTH]


def _audit(now: datetime, event: dict, allowed: bool, reason: str) -> None:
    """Append one JSON line for this call to today's audit file; raise on any failure."""
    tool_input = event.get("tool_input")
    canonical = json.dumps(tool_input, sort_keys=True, separators=(",", ":"))
    record = {
        "ts": now.isoformat(),
        "session_id": event.get("session_id"),
        "agent_id": event.get("agent_id"),
        "agent_type": event.get("agent_type"),
        "tool_name": event.get("tool_name"),
        "allowed": allowed,
        "reason": reason,
        "input_sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        "preview": _preview(tool_input),
    }
    line = (json.dumps(record) + "\n").encode("utf-8")
    AUDIT_DIR.mkdir(exist_ok=True)
    flags = os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW
    fd = os.open(AUDIT_DIR / f"{now:%Y-%m-%d}.jsonl", flags, 0o644)
    try:
        if os.write(fd, line) != len(line):
            raise OSError("short write to the audit log")
    finally:
        os.close(fd)


def _read(stdin: TextIO) -> str:
    buffer = getattr(stdin, "buffer", None)
    return buffer.read().decode("utf-8") if buffer is not None else stdin.read()


def _stderr(text: str) -> None:
    """Write straight to file descriptor 2, so nothing is left to flush at exit."""
    data = text.encode("utf-8", "backslashreplace")
    while data:
        data = data[os.write(2, data) :]


def main(stdin: TextIO = sys.stdin) -> int:
    """Decide one hook call: 0 allows it and 2 blocks it. Every failure blocks."""
    try:
        now = datetime.now(UTC)
        event: dict = {}
        try:
            data = json.loads(_read(stdin))
        except ValueError as exc:
            allowed, reason = False, f"the hook input is not valid JSON ({exc})"
        else:
            if isinstance(data, dict):
                event = data
                try:
                    allowed, reason = decide(event)
                except Exception as exc:
                    allowed, reason = False, f"the guard failed ({type(exc).__name__}: {exc})"
            else:
                allowed, reason = False, "the hook input is not a JSON object"
        allowed = allowed is True
        _audit(now, event, allowed, str(reason))
        if allowed:
            return 0
        _stderr(f"Blocked by the Complete clean-room guard: {reason}. {DENY_NOTE}\n")
        return 2
    except BaseException as exc:  # fail closed: any failure, even SystemExit, blocks the call
        try:
            _stderr(f"The Complete clean-room guard failed and blocked this call ({exc!r}).\n")
        except BaseException:
            pass
        return 2


if __name__ == "__main__":
    sys.exit(main())
