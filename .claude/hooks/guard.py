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
  configuration or the git hooks, names the root of ``complete-specs``, asks to leave
  the sandbox, or runs a container in any form other than one plain command whose
  host paths hold no forbidden area, or with an image, container, or volume other
  than the project's own (``ALLOWED_IMAGES`` and the compose stack in ``docker/``);
* a write targets the isolation configuration, the git directory, the container
  configuration, the audit log, or the reference and specification trees;
* a web request leaves the allowlist.

A copy of the guard inside a worktree (the repository path has a ``.claude``
component, or the repository's ``.git`` is a file) cannot know the workspace root,
so it blocks every call without writing an audit line.

Every other call is appended to ``WS/complete-audit/<UTC date>.jsonl``. Standard
library only. The hook command runs it as ``python3 -I … || exit 2``. See
docs/isolation.md.
"""

from __future__ import annotations

import sys


def _fail_closed(exc_type, exc, tb):
    """Exit with 2 for an exception that escapes ``main``; installed when run as a script.

    It is installed before every other import, so a failing import exits with 2 too.
    """
    try:
        sys.stderr.write(f"The Complete clean-room guard crashed ({exc_type.__name__}).\n")
        sys.stderr.flush()
    finally:
        import os  # loaded by the interpreter at start-up; cannot fail here

        os._exit(2)


if __name__ == "__main__":
    sys.excepthook = _fail_closed

import functools  # noqa: E402
import hashlib  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import shlex  # noqa: E402
from datetime import UTC, datetime  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import TextIO  # noqa: E402
from urllib.parse import urlsplit  # noqa: E402

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
WEBSEARCH_REASON = "WebSearch must set allowed_domains to hosts on the web allowlist: " + (
    ", ".join(sorted(ALLOWED_HOSTS))
)
FIXABLE_NOTE = (
    "This is a correctable request error: retry the same call with allowed_domains set "
    "to one or more of the hosts listed."
)
FIXABLE_REASONS = {WEBSEARCH_REASON}

# A shell command that starts another Claude Code process. The first pattern is the
# one in the plan; the second also catches a quoted command such as `sh -c 'claude …'`.
# Both are case-sensitive and need whitespace or the end after `claude`, so commit
# trailers such as "Claude-Session: https://claude.ai/…" do not match.
NESTED_CLAUDE = re.compile(r"(^|[\s;&|(`])(\S*/)?claude(\s|$)")
QUOTED_CLAUDE = re.compile(r"['\"](\S*/)?claude(\s|$)")
CONTAINER_CLI = re.compile(r"(podman|docker)", re.IGNORECASE)
CONFIG_TEXT = re.compile(
    r"\.claude(/+(hooks|settings)|\.json|/*(?=$|[\s'\"`;&|)]))|disableallhooks", re.IGNORECASE
)
GIT_HOOKS = re.compile(r"\.git/+hooks|core\.hookspath", re.IGNORECASE)
SPECS_NAME = re.compile(r"complete-specs", re.IGNORECASE)
SPECS_SEGMENT = re.compile(r"complete-specs/+([^/]*)", re.IGNORECASE)
SPECS_NEXT = re.compile(r"/+([^/]*)")
TOKEN_SEPARATORS = re.compile(r"[\s'\"`;&|()<>=,:]+")
QUOTING = re.compile(r"[\"'`\\]")
GLOB_MAGIC = re.compile(r"[*?\[\]{}()!\\]")
BRACES = re.compile(r"\{([^{}]*)\}")
OPTION = re.compile(r"^--?[A-Za-z][\w-]*")
PROSE_TAIL = ",;:!?)]}'\""
SKIPPED_SEGMENTS = ("", ".", "..")

# Container commands (podman runs outside the sandbox).
CONTAINER_WORDS = frozenset({"podman", "docker"})
CONTAINER_SYNTAX = frozenset(";&|<>`$(){}*?[]~\n\r")
ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
# Words after which the next words of a simple command may still run a program.
SHELL_PREFIXES = frozenset(
    {
        "!", "{", "}", "builtin", "chrt", "command", "coproc", "do", "doas", "elif", "else", "env",
        "eval", "exec", "flock", "if", "ionice", "nice", "nohup", "setsid", "stdbuf",
        "sudo", "taskset", "then", "time", "timeout", "unbuffer", "until", "watch",
        "while", "xargs",
    }
)  # fmt: skip
CONTAINER_GLOBAL_OPTIONS = frozenset({"--version", "-v", "--help", "-h"})


# Location ---------------------------------------------------------------------------


def _misplaced() -> str | None:
    """Why this copy of the guard cannot trust its workspace root, if it cannot."""
    if ".claude" in REPO.parts:
        return (
            f"this guard copy runs in a worktree inside a .claude directory ({REPO}), so it "
            "cannot locate the workspace root; worktree sessions are not supported"
        )
    if (REPO / ".git").is_file():
        return (
            f"the repository {REPO} is a git worktree or submodule (its .git is a file), so "
            "the guard cannot locate the workspace root; worktree sessions are not supported"
        )
    return None


# Paths ------------------------------------------------------------------------------


@functools.cache
def _roots(base: Path) -> tuple[str, str]:
    """The lexical and the symlink-resolved form of a fixed location (one call per process)."""
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
        (REPO / ".claude", "the Claude Code configuration of the repository"),
        (REPO / ".git", "the git directory, including its hooks and config"),
        (home / ".config" / "containers", "the container configuration"),
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
            if path in _roots(SPECS):
                return f"{tool} would list the root of complete-specs"
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


def _tokens(text: str) -> set[str]:
    """The words of the text as written and with quotes removed."""
    return {*TOKEN_SEPARATORS.split(text), *TOKEN_SEPARATORS.split(_dequote(text))}


def _trim(token: str) -> str:
    """The token without the prose punctuation that may follow a path.

    Trailing ``, ; : ! ? ) ] } ' "`` go, and so does one final period unless it ends a
    ``..`` segment. A trailing run
    of ``*`` goes only when the token starts with the same run (Markdown bold, as in
    ``**a/b**``); a lone trailing ``*`` is a glob and stays.
    """
    lead = len(token) - len(token.lstrip("*"))
    bold = period = False
    while True:
        before = token
        token = token.rstrip(PROSE_TAIL)
        run = len(token) - len(token.rstrip("*"))
        if not bold and lead and run == lead and len(token) > 2 * lead:
            token, bold = token[:-lead], True
        if not period and token.endswith(".") and token.rsplit("/", 1)[-1] != "..":
            token, period = token[:-1], True
        if token == before:
            return token


def _forms(text: str) -> tuple[list[str], list[str], list[str]]:
    """The whole text (as written and unquoted), its path-like tokens, and its specs paths.

    Path-like tokens also appear normalised, so ``a/../b``, ``a//b``, and ``a/./b``
    read as the path they name. Specs paths are the path-like tokens with prose
    punctuation trimmed, as written and normalised.
    """
    paths: set[str] = set()
    specs: set[str] = set()
    for token in _tokens(text):
        if "/" in token:
            paths.update((token, os.path.normpath(token)))
            trimmed = _trim(token)
            specs.update((trimmed, os.path.normpath(trimmed)))
    return [text, _dequote(text)], sorted(paths), sorted(specs)


def _text_reason(tool_input: dict) -> str | None:
    for text in _strings(tool_input):
        wholes, paths, specs = _forms(text)
        for form in (*wholes, *paths):
            lowered = form.lower()
            if "odoo-reference/enterprise" in lowered:
                return "the input names the EE reference tree"
            if "+e.20" in lowered:
                return "the input names an EE build"
        for form in specs:
            for match in SPECS_SEGMENT.finditer(form):
                if match.group(1) not in (*SKIPPED_SEGMENTS, *SHARED_SPECS):
                    return "the input names an analyst-only area of complete-specs"
    return None


def _names_specs_root(command: str) -> bool:
    """True when a shell command names ``complete-specs`` other than as a shared path.

    Only ``complete-specs/slices`` and ``complete-specs/templates`` may appear; the bare
    directory (``cd``, ``git -C``, ``ls``, a repository name) may not. ``.`` and ``..``
    segments are judged in the normalised form of the token.
    """
    for token in _tokens(command):
        trimmed = _trim(token)
        for form in (trimmed, os.path.normpath(trimmed)):
            for match in SPECS_NAME.finditer(form):
                following = SPECS_NEXT.match(form, match.end())
                if following and following.group(1) in (*SHARED_SPECS, ".", ".."):
                    continue
                return True
    return False


# Shell commands ---------------------------------------------------------------------


class _Unfollowable(Exception):
    """The shell text uses syntax that the guard does not model."""


class _ShellScanner:
    """Collect the simple commands of a shell text, at every nesting level.

    It models only a conservative subset of bash: blanks, ``; & | ( )`` and newlines,
    redirections, single and double quotes, backslashes, ``$(…)`` (also inside double
    quotes), comments after a blank, and here-documents with their full delimiter
    word. Anything else that can change how bash splits the text into commands,
    such as ``$'…'``, ``$"…"``, ``$((…))``, ``((…))``, ``$[…]``, ``${…}``, backticks, a
    ``#`` right after an operator, ``[`` before ``<<``, ``case``, ``[[``, an unterminated
    here-document, or command substitution in an expanding here-document body, raises
    ``_Unfollowable``. The caller then fails closed.
    """

    WORD_END = " \t\n;&|()<>"
    PLAIN = re.compile(r"[^ \t\n;&|()<>\\'\"`$]+")
    PLAIN_QUOTED = re.compile(r"[^\"\\`$]+")

    def __init__(self, text: str) -> None:
        self.text = text
        self.i = 0
        self.commands: list[list[str]] = []
        self.pending: list[tuple[str, bool, bool, int]] = []

    def scan(self) -> list[list[str]]:
        self._commands(level=0)
        if self.pending:
            raise _Unfollowable("unterminated here-document")
        return self.commands

    def _commands(self, level: int) -> None:
        """Scan commands until the end (level 0) or the ``)`` that closes ``$(``."""
        text, size = self.text, len(self.text)
        words: list[str] = []
        word: str | None = None
        target = False
        depth = 0

        def end_word() -> None:
            nonlocal word, target
            if word is not None:
                if target:
                    target = False
                else:
                    words.append(word)
            word = None

        def end_command() -> None:
            nonlocal words
            end_word()
            if words:
                if {"case", "[["}.intersection(words):
                    raise _Unfollowable("case or [[")
                self.commands.append(words)
            words = []

        while True:
            if self.i >= size:
                if level:
                    raise _Unfollowable("unclosed $(")
                end_command()
                return
            char = text[self.i]
            if char in " \t":
                end_word()
                self.i += 1
            elif char == "\n":
                end_command()
                self.i += 1
                self._bodies(level)
            elif char == "#" and word is None:
                if self.i and text[self.i - 1] not in " \t\n":
                    raise _Unfollowable("# right after an operator")
                end = text.find("\n", self.i)
                self.i = size if end == -1 else end
            elif char == "\\":
                if text.startswith("\\\n", self.i):
                    self.i += 2
                else:
                    word = (word or "") + text[self.i + 1 : self.i + 2]
                    self.i += 2
            elif char == "'":
                end = text.find("'", self.i + 1)
                if end == -1:
                    raise _Unfollowable("unclosed single quote")
                word = (word or "") + text[self.i + 1 : end]
                self.i = end + 1
            elif char == '"':
                self.i += 1
                word = (word or "") + self._double_quoted(level)
            elif char == "`":
                raise _Unfollowable("backtick")
            elif char == "$":
                word = (word or "") + self._dollar(level)
            elif char == "(":
                if text.startswith("((", self.i):
                    raise _Unfollowable("((")
                end_command()
                depth += 1
                self.i += 1
            elif char == ")":
                end_command()
                self.i += 1
                if depth:
                    depth -= 1
                elif level:
                    return
                else:
                    raise _Unfollowable("unmatched )")
            elif char in ";&|":
                end_command()
                self.i += 1
            elif char in "<>":
                if word is not None and word.isdigit() and text[self.i - 1].isdigit():
                    word = None  # a file descriptor, as in 2>file
                elif text.startswith("<<", self.i) and word is not None and "[" in word:
                    raise _Unfollowable("<< inside a subscript")
                end_word()
                if text.startswith("<<<", self.i):
                    self.i += 3
                elif text.startswith("<<", self.i):
                    self.i += 2
                    tabs = text.startswith("-", self.i)
                    self.i += tabs
                    self._heredoc(level, tabs)
                    continue
                else:
                    self.i += 1
                    if text[self.i - 1 : self.i + 1] in (">>", ">&", ">|", "<&", "<>"):
                        self.i += 1  # the second character of a two-character redirection
                target = True
            else:
                run = self.PLAIN.match(text, self.i)
                word = (word or "") + run.group()
                self.i = run.end()

    def _dollar(self, level: int) -> str:
        """Read a ``$`` construct in command or double-quote context; return its text."""
        text = self.text
        following = text[self.i + 1 : self.i + 2]
        if following in ("'", '"', "[", "{") or text.startswith("$((", self.i):
            raise _Unfollowable(f"${following}")
        if following == "(":
            self.i += 2
            self._commands(level + 1)
            return "$()"
        self.i += 1
        return "$"

    def _double_quoted(self, level: int) -> str:
        """Read a double-quoted string after its opening quote; return its text."""
        text, size = self.text, len(self.text)
        value = ""
        while True:
            if self.i >= size:
                raise _Unfollowable("unclosed double quote")
            char = text[self.i]
            if char == '"':
                self.i += 1
                return value
            if char == "\\":
                following = text[self.i + 1 : self.i + 2]
                value += following if following in '$`"\\' else "\\" + following
                self.i += 2
            elif char == "`":
                raise _Unfollowable("backtick")
            elif char == "$":
                value += self._dollar(level)
            else:
                run = self.PLAIN_QUOTED.match(text, self.i)
                value += run.group()
                self.i = run.end()

    def _heredoc(self, level: int, tabs: bool) -> None:
        """Read a here-document delimiter word and register its body."""
        text, size = self.text, len(self.text)
        while self.i < size and text[self.i] in " \t":
            self.i += 1
        delimiter, quoted = "", False
        while self.i < size and text[self.i] not in self.WORD_END:
            char = text[self.i]
            if char == "\\":
                delimiter += text[self.i + 1 : self.i + 2]
                quoted = True
                self.i += 2
            elif char in "'\"":
                end = text.find(char, self.i + 1)
                part = text[self.i + 1 : end]
                if end == -1 or (char == '"' and any(c in part for c in "$`\\")):
                    raise _Unfollowable("here-document delimiter")
                delimiter += part
                quoted = True
                self.i = end + 1
            elif char == "`" or (char == "$" and text[self.i + 1 : self.i + 2] in "'\"({["):
                raise _Unfollowable("here-document delimiter")
            else:
                delimiter += char
                self.i += 1
        if not delimiter:
            raise _Unfollowable("empty here-document delimiter")
        self.pending.append((delimiter, tabs, not quoted, level))

    def _bodies(self, level: int) -> None:
        """After a newline, skip the bodies of the here-documents opened on that line."""
        if not self.pending:
            return
        if any(pending_level != level for *_, pending_level in self.pending):
            raise _Unfollowable("here-document across a $( boundary")
        text, size = self.text, len(self.text)
        for delimiter, tabs, expands, _ in self.pending:
            body: list[str] = []
            while True:
                if self.i >= size:
                    raise _Unfollowable("unterminated here-document")
                end = text.find("\n", self.i)
                line = text[self.i : size if end == -1 else end]
                self.i = size if end == -1 else end + 1
                if (line.lstrip("\t") if tabs else line) == delimiter:
                    break
                body.append(line)
            if expands and any("$(" in line or "`" in line for line in body):
                raise _Unfollowable("command substitution in a here-document body")
        self.pending = []


def _runs_container(command: str) -> bool | None:
    """True when podman or docker is in command position; None when unfollowable.

    Command position is the first word of a simple command at any nesting level
    (after ``NAME=value`` assignments and redirections), or any word of a simple
    command that starts with a wrapper such as ``sudo``, ``env``, ``xargs``, or a shell
    keyword. Here-document bodies and quoted arguments are not commands.
    """
    try:
        commands = _ShellScanner(command).scan()
    except _Unfollowable:
        return None
    for words in commands:
        while words and ASSIGNMENT.match(words[0]):
            words = words[1:]
        if not words:
            continue
        names = [os.path.basename(word) for word in words]
        if names[0] in CONTAINER_WORDS:
            return True
        if names[0] in SHELL_PREFIXES and CONTAINER_WORDS.intersection(names[1:]):
            return True
    return False


def _container_reason(command: str, cwd: str) -> str | None:
    """Check a container command; podman runs outside the sandbox, so this is strict.

    It must be one simple command that starts with ``podman`` or ``docker``, uses no
    shell syntax, no global options other than ``--version`` or ``--help``, and no
    word that is, or holds, a forbidden area or an owner-managed location. Then it may
    use only the allowed images and the compose stack's containers (F4).
    """
    syntax = sorted(CONTAINER_SYNTAX.intersection(command))
    if syntax:
        shown = " ".join(repr(char) for char in syntax)
        return (
            f"a container command must be one plain command without shell syntax ({shown}); "
            "run podman directly, without pipes, redirections, substitutions, globs, or ~"
        )
    try:
        words = shlex.split(command)
    except ValueError:
        return "the guard cannot parse this container command"
    if not words or os.path.basename(words[0]) not in CONTAINER_WORDS:
        return "a container command must start with podman or docker, without prefixes"
    index = 1
    while index < len(words) and words[index].startswith("-"):
        if words[index] not in CONTAINER_GLOBAL_OPTIONS:
            return f"the container global option {words[index]!r} is not allowed"
        index += 1
    paths = {OPTION.sub("", token) for word in words[1:] for token in TOKEN_SEPARATORS.split(word)}
    for path in sorted(paths - {""}):
        for candidate in _absolute_forms(path, cwd):
            if _forbidden_area(candidate) or _holds_forbidden_area(candidate):
                return f"the container argument {path!r} would expose a forbidden area"
            protected = _container_protected(candidate)
            if protected:
                return (
                    f"the container argument {path!r} would expose {protected} to a container, "
                    "which writes outside the sandbox"
                )
    return _container_use_reason(os.path.basename(words[0]), words[index:], cwd)


def _container_protected(path: str) -> str | None:
    """Name the owner-managed location that ``path`` is, lies in, or contains, if any."""
    home = Path(os.path.expanduser("~"))
    locations = (
        (REPO / ".git", "the git directory"),
        (REPO / ".claude", "the Claude Code configuration of the repository"),
        (home / ".config" / "containers", "the container configuration"),
        (home / ".claude", "the user's Claude Code settings"),
        (home / ".claude.json", "the user's Claude Code settings"),
        (AUDIT_DIR, "the audit log"),
    )
    for location, name in locations:
        for root in _roots(location):
            if _inside(path, root) or _inside(root, path):
                return name
    return None


def _command_reason(tool_input: dict, cwd: str) -> str | None:
    command = tool_input.get("command")
    if not isinstance(command, str):
        return "the shell command is not a string"
    if NESTED_CLAUDE.search(command) or QUOTED_CLAUDE.search(command):
        return "the command starts another Claude Code process"
    wholes, paths, _ = _forms(command)
    if any(CONFIG_TEXT.search(form) for form in (*wholes, *paths)):
        return "the command touches the isolation configuration, which only the owner edits"
    if any(GIT_HOOKS.search(form) for form in (*wholes, *paths)):
        return "the command touches the git hooks, which run outside the guard's view"
    if _names_specs_root(command):
        return (
            "the command names the complete-specs repository itself; only paths in its "
            "slices/ and templates/ folders are allowed"
        )
    runs_container = _runs_container(command)
    if runs_container is None and CONTAINER_CLI.search(command):
        return "the guard cannot parse a command that mentions a container CLI"
    if runs_container:
        return _container_reason(command, cwd)
    return None


# Container images and containers (F4). Container commands may use only the images the
# project needs and the containers of its compose stack, because the user's container
# storage can hold images with EE code, and podman runs outside the sandbox.
#
# ALLOWED_IMAGES is the one place to change which images are allowed. Each key is a
# fully qualified repository; its value is the set of allowed tags, or None for any
# tag. To allow another image, add it here with the narrowest tags that work, add a
# case to tools/tests/test_guard.py, and list it under "Containers" in
# docs/isolation.md. Never add an image that holds Odoo Enterprise code.
ALLOWED_IMAGES: dict[str, frozenset[str] | None] = {
    "localhost/complete-odoo": None,  # built from docker/ (`make image`); the tag is the release
    "docker.io/pgvector/pgvector": frozenset({"pg17"}),  # the db service of docker/compose.yaml
    "docker.io/library/ubuntu": frozenset({"noble"}),  # the FROM line of docker/Dockerfile
}
# The project's compose stack: compose names its containers <project>-<service>-<n>
# (or <project>-<service>-run-<id>) and its volumes <project>_<volume>, and the project
# is the directory of the compose file.
STACK_COMPOSE = REPO / "docker" / "compose.yaml"
STACK_PROJECT = "docker"
BUILD_CONTEXT = REPO / "docker"
MAX_CONFIG_BYTES = 256 * 1024
IMAGE_REFERENCE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/:-]*")
IMAGE_TAG = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}")

# Options per subcommand, from `podman <subcommand> --help` (podman 6.1) and
# `docker compose [run] --help` (Docker Compose 5.6): `-e|--env=` takes a value, `--rm`
# is a flag. An option missing here is refused, because the guard could then no longer
# tell which word names the image or the container.
RUN_OPTIONS = (
    "--add-host= --annotation= --arch= -a|--attach= --authfile= --blkio-weight= "
    "--blkio-weight-device= --cap-add= --cap-drop= --cert-dir= --cgroup-conf= "
    "--cgroup-parent= --cgroupns= --cgroups= --chrootdirs= --cidfile= --conmon-pidfile= "
    "--cpu-period= --cpu-quota= --cpu-rt-period= --cpu-rt-runtime= -c|--cpu-shares= "
    "--cpus= --cpuset-cpus= --cpuset-mems= --creds= --decryption-key= --detach-keys= "
    "--device= --device-cgroup-rule= --device-read-bps= --device-read-iops= "
    "--device-write-bps= --device-write-iops= --dns= --dns-option= --dns-search= "
    "--entrypoint= -e|--env= --env-file= --env-merge= --expose= --gidmap= --gpus= "
    "--group-add= --group-entry= --health-cmd= --health-interval= "
    "--health-log-destination= --health-max-log-count= --health-max-log-size= "
    "--health-on-failure= --health-retries= --health-start-period= "
    "--health-startup-cmd= --health-startup-interval= --health-startup-retries= "
    "--health-startup-success= --health-startup-timeout= --health-timeout= "
    "-h|--hostname= --hosts-file= --hostuser= --image-volume= --init-path= --ip= --ip6= "
    "--ipc= -l|--label= --label-file= --log-driver= --log-opt= --mac-address= "
    "-m|--memory= --memory-reservation= --memory-swap= --memory-swappiness= --mount= "
    "--name= --network= --network-alias= --oom-score-adj= --os= --passwd-entry= "
    "--personality= --pid= --pidfile= --pids-limit= --platform= --pod= --pod-id-file= "
    "--preserve-fd= --preserve-fds= -p|--publish= --pull= --rdt-class= --requires= "
    "--restart= --retry= --retry-delay= --sdnotify= --seccomp-policy= --secret= "
    "--security-opt= --shm-size= --shm-size-systemd= --stop-signal= --stop-timeout= "
    "--subgidname= --subuidname= --sysctl= --systemd= --timeout= --tmpfs= --tz= "
    "--uidmap= --ulimit= --umask= --unsetenv= -u|--user= --userns= --uts= --variant= "
    "-v|--volume= --volumes-from= -w|--workdir= --init-ctr= -d|--detach "
    "--disable-content-trust --env-host --http-proxy --init -i|--interactive "
    "--no-healthcheck --no-hostname --no-hosts --oom-kill-disable --passwd --privileged "
    "-P|--publish-all -q|--quiet --read-only --read-only-tmpfs --replace --rm --rmi "
    "--rootfs --sig-proxy --tls-verify -t|--tty --unsetenv-all"
)

BUILD_OPTIONS = (
    "-f|--file= --add-host= --annotation= --arch= --authfile= --build-arg= --build-arg-file= "
    "--build-context= --cache-from= --cache-to= --cache-ttl= --cap-add= --cap-drop= "
    "--cert-dir= --cgroup-parent= --cgroupns= --compression-format= "
    "--compression-level= --cpp-flag= --cpu-period= --cpu-quota= -c|--cpu-shares= "
    "--cpuset-cpus= --cpuset-mems= --creds= --cw= --decryption-key= --device= --dns= "
    "--dns-option= --dns-search= --env= --format= --from= --group-add= --hooks-dir= "
    "--ignorefile= --iidfile= --iidfile-raw= --ipc= --isolation= --jobs= --label= "
    "--layer-label= --logfile= --manifest= -m|--memory= --memory-swap= --metadata-file= "
    "--mount= --network= --os= --os-feature= --os-version= -o|--output= --pid= "
    "--platform= --pull= --retry= --retry-delay= --runtime-flag= --sbom= "
    "--sbom-image-output= --sbom-image-purl-output= --sbom-merge-strategy= "
    "--sbom-output= --sbom-purl-output= --sbom-scanner-command= --sbom-scanner-image= "
    "--secret= --security-opt= --shm-size= --sign-by= --source-date-epoch= "
    "--source-policy-file= --ssh= -t|--tag= --target= --timestamp= --ulimit= "
    "--unsetannotation= --unsetenv= --unsetlabel= --userns= --userns-gid-map= "
    "--userns-gid-map-group= --userns-uid-map= --userns-uid-map-user= --uts= --variant= "
    "-v|--volume= --all-platforms --compat-volumes --compress --created-annotation "
    "-D|--disable-compression --disable-content-trust --force-compression --force-rm "
    "--http-proxy --identity-label --inherit-annotations --inherit-labels --layers "
    "--logsplit --no-cache --no-hostname --no-hosts --omit-history -q|--quiet "
    "--rewrite-timestamp --rm --save-stages --skip-unused-stages --squash --squash-all "
    "--stage-labels --stdin --tls-verify"
)

COMPOSE_OPTIONS = (
    "--ansi= --env-file= -f|--file= --parallel= --profile= --progress= "
    "--project-directory= -p|--project-name= --all-resources --compatibility --dry-run"
)

COMPOSE_RUN_OPTIONS = (
    "--cap-add= --cap-drop= --entrypoint= -e|--env= --env-from-file= -l|--label= "
    "--name= -p|--publish= --pull= -u|--user= -v|--volume= -w|--workdir= --build "
    "-d|--detach --dry-run -i|--interactive --no-deps -T|--no-tty -q|--quiet "
    "--quiet-build --quiet-pull --remove-orphans --rm -P|--service-ports --use-aliases"
)

# Subcommand -> (kind, options). The kinds are checked in _check_container_use.
PODMAN_SUBCOMMANDS: dict[str, tuple[str, str]] = {
    "run": ("run", RUN_OPTIONS),
    "create": ("run", RUN_OPTIONS),
    "build": ("build", BUILD_OPTIONS),
    "pull": (
        "images",
        (
            "--arch= --authfile= --cert-dir= --creds= --decryption-key= --os= "
            "--platform= --policy= --retry= --retry-delay= --variant= -a|--all-tags "
            "--disable-content-trust -q|--quiet --tls-verify"
        ),
    ),
    "tag": ("images", ""),
    "untag": ("images", ""),
    "rmi": ("images", "-a|--all -f|--force -i|--ignore --no-prune"),
    "history": ("images", "--format= -H|--human --no-trunc -q|--quiet"),
    "image exists": ("images", ""),
    "image inspect": ("images", "-f|--format="),
    "inspect": ("inspect", "-f|--format= -t|--type= -l|--latest -s|--size"),
    "exec": (
        "containers",
        (
            "--cidfile= --detach-keys= -e|--env= --env-file= --preserve-fd= "
            "--preserve-fds= -u|--user= -w|--workdir= -d|--detach -i|--interactive "
            "-l|--latest --no-session --privileged -t|--tty"
        ),
    ),
    "attach": ("containers", "--detach-keys= -l|--latest --no-stdin --sig-proxy"),
    "start": (
        "containers",
        ("--detach-keys= -f|--filter= --all -a|--attach -i|--interactive -l|--latest --sig-proxy"),
    ),
    "stop": ("containers", ("--cidfile= -f|--filter= -t|--time= -a|--all -i|--ignore -l|--latest")),
    "restart": (
        "containers",
        ("--cidfile= -f|--filter= -t|--time= -a|--all -l|--latest --running"),
    ),
    "kill": ("containers", "--cidfile= -s|--signal= -a|--all -l|--latest"),
    "pause": ("containers", "--cidfile= -f|--filter= -a|--all -l|--latest"),
    "unpause": ("containers", "--cidfile= -f|--filter= -a|--all -l|--latest"),
    "rm": (
        "containers",
        (
            "--cidfile= --filter= -t|--time= -a|--all --depend -f|--force "
            "-i|--ignore -l|--latest -v|--volumes"
        ),
    ),
    "logs": (
        "containers",
        ("--since= --tail= --until= --color -f|--follow -l|--latest -n|--names -t|--timestamps"),
    ),
    "top": ("containers", "-l|--latest"),
    "port": ("containers", "-a|--all -l|--latest"),
    "wait": ("containers", ("--condition= -i|--interval= --exit-first-match --ignore -l|--latest")),
    "stats": (
        "containers",
        ("--format= -i|--interval= -a|--all -l|--latest --no-reset --no-stream --no-trunc"),
    ),
    "healthcheck run": ("containers", "--ignore-result"),
    "container inspect": ("containers", "-f|--format= -l|--latest -s|--size"),
    "container exists": ("containers", "--external"),
    "cp": ("cp", "-a|--archive --overwrite"),
}
PODMAN_GROUPS = frozenset({"image", "container", "volume", "network", "healthcheck"})
PODMAN_ALIASES = {
    "image ls": "images",
    "image list": "images",
    "container ls": "ps",
    "container list": "ps",
    "container ps": "ps",
    "volume list": "volume ls",
    "network list": "network ls",
    "image pull": "pull",
    "image tag": "tag",
    "image untag": "untag",
    "image rm": "rmi",
    "image history": "history",
    "image build": "build",
    **{
        f"container {name}": name
        for name in (
            "run", "create", "exec", "cp", "attach", "start", "stop", "restart", "kill",
            "pause", "unpause", "rm", "logs", "top", "port", "wait", "stats",
        )
    },
}  # fmt: skip
PODMAN_LISTINGS = frozenset({"help", "version", "info", "ps", "images", "volume ls", "network ls"})
DOCKER_LISTINGS = frozenset({"version", "info", "ps", "images"})
# Words after the image (run, create) or the container (exec) are the container's command.
COMMAND_TAILS = frozenset({"run", "create", "exec"})
# Only the first operand names a container; the rest are ps fields or a port.
FIRST_OPERAND_ONLY = frozenset({"exec", "top", "port"})
RUN_REFUSED = frozenset({"--rootfs", "--pod", "--pod-id-file", "--requires"})
BUILD_REFUSED = frozenset(
    {
        "--from", "--build-context", "--cache-from", "--cache-to", "--mount", "--hooks-dir",
        "--runtime-flag", "--output",
    }
)  # fmt: skip
SELECTING_OPTIONS = frozenset({"--all", "--latest", "--filter", "--cidfile"})
NAMESPACE_OPTIONS = frozenset({"--pid", "--ipc", "--network", "--uts", "--userns", "--cgroupns"})
COMPOSE_SUBCOMMANDS = frozenset(
    {
        "up", "down", "ps", "logs", "exec", "run", "start", "stop", "restart", "config",
        "images", "top", "pull", "create", "kill", "pause", "unpause", "port", "rm", "wait",
        "cp", "attach", "stats", "version", "ls",
    }
)  # fmt: skip
COMPOSE_WITHOUT_FILE = frozenset({"version", "ls"})
COMPOSE_TOP_KEYS = frozenset({"services", "volumes", "networks", "secrets", "configs", "version"})
COMPOSE_REFUSED_KEYS = frozenset({"build", "extends", "volumes_from"})
YAML_KEY = re.compile(r"""("[^"\\]*"|'[^']*'|[^\s'"#:{}\[\],&*!|>%@`-][^:#]*?)\s*:(?:\s+(.*))?""")
YAML_NODE_PROPERTY = re.compile(r"(?:^|[:\-?]\s+|[\[{,]\s*)[&*!]|<<\s*:|\bcontainer:")
CONTAINERFILE_DIRECTIVE = re.compile(r"#\s*([A-Za-z]+)\s*=")
CONTAINERFILE_SOURCE = re.compile(r"(?:--from=|\bfrom=)([^\s,]+)", re.IGNORECASE)


class _Refused(Exception):
    """A container command uses an image, container, or file that the guard refuses."""


@functools.cache
def _option_table(spec: str) -> dict[str, tuple[str, bool]]:
    """Map each option name of a spec to its long name and whether it takes a value."""
    table = {"--help": ("--help", False)}
    for entry in spec.split():
        names = entry.rstrip("=").split("|")
        for name in names:
            table[name] = (names[-1], entry.endswith("="))
    return table


def _parse_options(
    words: list[str], spec: str, stop: bool
) -> tuple[list[tuple[str, str | None]], list[str], list[str]]:
    """Split words into options, operands, and the rest, as podman's flag parser does.

    Options come back as ``(long name, value)``; a flag's value is None unless written
    as ``--flag=value``. With ``stop``, parsing ends at the first operand, and the words
    after it are returned as the rest. An option that the spec does not list, or a
    missing value, raises ``_Refused``.
    """
    table = _option_table(spec)
    options: list[tuple[str, str | None]] = []
    operands: list[str] = []
    index = 0

    def value_of(name: str, inline: str | None) -> str:
        """The value written after ``=`` or attached (even if empty), else the next word."""
        nonlocal index
        if inline is not None:
            return inline
        if index >= len(words):
            raise _Refused(f"the option {name} has no value")
        index += 1
        return words[index - 1]

    def known(name: str) -> tuple[str, bool]:
        if name not in table:
            raise _Refused(f"the guard does not know the option {name}, so it cannot check it")
        return table[name]

    while index < len(words):
        word = words[index]
        index += 1
        if word == "--":
            take = 1 if stop else len(words)
            operands.extend(words[index : index + take])
            index += take
            break
        if word.startswith("--"):
            name, equals, inline = word.partition("=")
            long, takes = known(name)
            written = inline if equals else None
            options.append((long, value_of(name, written) if takes else written))
        elif word.startswith("-") and word != "-":
            for position in range(1, len(word)):
                long, takes = known("-" + word[position])
                if takes:
                    attached = word[position + 1 :]
                    written = attached[1:] if attached.startswith("=") else attached or None
                    options.append((long, value_of(long, written)))
                    break
                options.append((long, None))
        else:
            operands.append(word)
            if stop:
                break
    rest = words[index:]
    if not stop:
        operands.extend(rest)
        rest = []
    return options, operands, rest


def _allowlist_text() -> str:
    return ", ".join(
        f"{name} (any tag)" if tags is None else ", ".join(f"{name}:{tag}" for tag in sorted(tags))
        for name, tags in ALLOWED_IMAGES.items()
    )


def _image_name(reference: str) -> tuple[str, str] | None:
    """The fully qualified repository and tag of an image reference, read as Docker does.

    A short name gets ``docker.io/library/`` or ``docker.io/``, and a missing tag means
    ``latest``. None for a digest, a variable, or any other character outside a name.
    """
    if not IMAGE_REFERENCE.fullmatch(reference) or "//" in reference:
        return None
    slash, colon = reference.rfind("/"), reference.rfind(":")
    repository, tag = (
        (reference[:colon], reference[colon + 1 :]) if colon > slash else (reference, "latest")
    )
    if not IMAGE_TAG.fullmatch(tag):
        return None
    first, _, rest = repository.partition("/")
    if not rest:
        repository = "docker.io/library/" + repository
    elif not ("." in first or ":" in first or first == "localhost"):
        repository = "docker.io/" + repository
    return repository, tag


def _image_allowed(reference: str) -> bool:
    name = _image_name(reference)
    if name is None or name[0] not in ALLOWED_IMAGES:
        return False
    tags = ALLOWED_IMAGES[name[0]]
    return tags is None or name[1] in tags


def _compose_image_allowed(value: str) -> bool:
    """An image of a compose file; a variable may stand only in a tag that may be any."""
    if "$" not in value:
        return _image_allowed(value)
    head = value[: value.index("$")]
    slash, colon = head.rfind("/"), head.rfind(":")
    name = _image_name(head[:colon]) if colon > slash else None
    return name is not None and name[0] in ALLOWED_IMAGES and ALLOWED_IMAGES[name[0]] is None


def _refuse_image(reference: str, where: str = "") -> None:
    if not _image_allowed(reference):
        raise _Refused(
            f"the container image {reference!r}{where} is not on the guard's image allowlist "
            f"({_allowlist_text()}); name an allowed image in full, with its tag"
        )


def _read_text(path: str) -> str:
    with open(path, "rb") as handle:
        data = handle.read(MAX_CONFIG_BYTES + 1)
    if len(data) > MAX_CONFIG_BYTES:
        raise _Refused(f"{path!r} is too large for the guard to check")
    return data.decode("utf-8")


def _strip_yaml_comment(line: str) -> str:
    quote = None
    for index, char in enumerate(line):
        if quote:
            quote = None if char == quote else quote
        elif char in "'\"":
            quote = char
        elif char == "#" and (index == 0 or line[index - 1] in " \t"):
            return line[:index]
    return line


def _yaml_scalar(value: str | None, where: str) -> str:
    if not value or value[0] in "|>&*!{[":
        raise _Refused(f"{where}: write the image as a plain or quoted value on its key's line")
    if value[0] in "'\"":
        if len(value) < 2 or value[-1] != value[0] or value[0] in value[1:-1] or "\\" in value:
            raise _Refused(f"{where}: the guard cannot read this quoted image")
        return value[1:-1]
    return value


def _read_compose(path: str) -> tuple[dict[str, str], set[str]]:
    """The services (name to image) and the top-level volume names of a compose file.

    The guard follows only a conservative subset of YAML: block mappings with spaces,
    plain or quoted one-line images, and comments. Anything else raises ``_Refused``,
    and so do the keys that could reach another image, container, or volume.
    """
    text = _read_text(path)
    services: dict[str, str | None] = {}
    volumes: set[str] = set()
    section = service = None
    entry_indent = key_indent = None
    for number, raw in enumerate(text.splitlines(), 1):
        where = f"line {number} of the compose file {path!r}"
        if "\t" in raw[: len(raw) - len(raw.lstrip())]:
            raise _Refused(f"{where} is indented with a tab")
        line = _strip_yaml_comment(raw).rstrip()
        body = line.lstrip(" ")
        if not body:
            continue
        indent = len(line) - len(body)
        if YAML_NODE_PROPERTY.search(body) or body.startswith(("---", "...", "%", "{", "[", "?")):
            raise _Refused(
                f"{where} uses YAML the guard does not follow (anchors, aliases, tags, merge "
                "keys, flow style, documents) or a container: reference"
            )
        match = YAML_KEY.fullmatch(body)
        key = match.group(1).strip("\"'") if match else None
        value = match.group(2) if match else None
        if indent == 0:
            if key is None or not (key in COMPOSE_TOP_KEYS or key.startswith("x-")):
                raise _Refused(f"{where}: the top-level entry {body[:40]!r} is not allowed")
            if key in ("services", "volumes") and value:
                raise _Refused(f"{where}: write {key} as a block mapping")
            section, service, entry_indent = key, None, None
            continue
        if section not in ("services", "volumes"):
            continue
        entry_indent = indent if entry_indent is None else entry_indent
        if indent == entry_indent:
            if key is None or value:
                raise _Refused(f"{where}: each {section} entry must be a name with a block mapping")
            if section == "services":
                services[key], service, key_indent = None, key, None
            else:
                volumes.add(key)
            continue
        if indent < entry_indent:
            raise _Refused(f"{where} has an unexpected indentation")
        if section == "volumes":
            raise _Refused(f"{where}: top-level volumes must be bare names, without settings")
        key_indent = indent if key_indent is None else key_indent
        if indent < key_indent:
            raise _Refused(f"{where} has an unexpected indentation")
        if indent > key_indent:
            continue
        if key is None:
            raise _Refused(f"{where}: a service must be a block mapping")
        if key in COMPOSE_REFUSED_KEYS:
            raise _Refused(f"{where}: the service key {key!r} is not allowed")
        if key == "image":
            services[service] = _yaml_scalar(value, where)
    if not services:
        raise _Refused(f"the compose file {path!r} defines no services")
    for name, image in services.items():
        if image is None:
            raise _Refused(f"the service {name!r} in the compose file {path!r} has no image")
    return services, volumes  # type: ignore[return-value]


@functools.cache
def _stack() -> tuple[frozenset[str], frozenset[str]]:
    """The services and volumes of the project's compose file; empty when unreadable."""
    try:
        services, volumes = _read_compose(str(STACK_COMPOSE))
    except (_Refused, OSError, ValueError):
        return frozenset(), frozenset()
    return frozenset(services), frozenset(f"{STACK_PROJECT}_{name}" for name in volumes)


def _refuse_container(name: str) -> None:
    for service in _stack()[0]:
        for separator in "-_":
            prefix = f"{STACK_PROJECT}{separator}{service}{separator}"
            rest = name[len(prefix) :]
            if name.startswith(prefix) and re.fullmatch(rf"\d+|run{separator}[0-9a-f]+", rest):
                return
    raise _Refused(
        f"the container {name!r} is not a container of the project's compose stack "
        f"(docker/compose.yaml, named {STACK_PROJECT}-<service>-<n>); name a stack "
        "container in full, not by an ID"
    )


def _refuse_volume(value: str, named: frozenset[str] | set[str]) -> None:
    source, separator, _ = value.partition(":")
    if separator and not source.startswith(("/", ".", "~")) and source not in named:
        raise _Refused(f"the volume {source!r} is not a volume of the project's compose stack")


def _refuse_mount(value: str) -> None:
    fields = dict(part.partition("=")[::2] for part in value.split(","))
    kind = fields.get("type", "volume")
    source = fields.get("source", fields.get("src", ""))
    if kind == "volume" and source:
        _refuse_volume(f"{source}:/", _stack()[1])
    elif kind == "image":
        _refuse_image(source, " in --mount")
    elif kind not in ("volume", "bind", "tmpfs", "ramfs", "devpts"):
        raise _Refused(f"the mount type {kind!r} is not allowed")


def _check_namespaces(options: list[tuple[str, str | None]]) -> None:
    for name, value in options:
        if name in NAMESPACE_OPTIONS and value:
            for part in value.split(","):
                if part.startswith("container:"):
                    _refuse_container(part.split(":")[1])


def _check_containerfile(path: str) -> None:
    """Refuse a container file that builds from, copies from, or mounts another image."""
    lines = _read_text(path).splitlines()
    for line in lines:
        directive = CONTAINERFILE_DIRECTIVE.match(line.strip())
        if not directive:
            break
        if directive.group(1).lower() in ("syntax", "escape"):
            raise _Refused(
                f"the container file {path!r} uses the parser directive {directive.group(1)!r}"
            )
    instructions, current = [], ""
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.endswith("\\"):
            current += stripped[:-1] + " "
            continue
        instructions.append(current + stripped)
        current = ""
    instructions += [current] if current else []
    stages: set[str] = set()
    for instruction in instructions:
        keyword, _, rest = instruction.partition(" ")
        if keyword.upper() == "ONBUILD":
            keyword, _, rest = rest.strip().partition(" ")
        if keyword.upper() == "FROM":
            words = [word for word in rest.split() if not word.startswith("--")]
            base = words[0] if words else ""
            if "$" in base:
                raise _Refused(
                    f"the container file {path!r} names its base image through a variable"
                )
            if base.lower() not in stages and base != "scratch":
                _refuse_image(base, f" in FROM of {path!r}")
            if len(words) >= 3 and words[1].lower() == "as":
                stages.add(words[2].lower())
        for match in CONTAINERFILE_SOURCE.finditer(rest):
            source = match.group(1).strip("\"'")
            if "$" in source:
                raise _Refused(
                    f"the container file {path!r} names a source image through a variable"
                )
            if source.lower() not in stages and not source.isdigit():
                _refuse_image(source, f" in {path!r}")


def _check_build(options: list[tuple[str, str | None]], operands: list[str], cwd: str) -> None:
    for name, _ in options:
        if name in BUILD_REFUSED or name.startswith("--sbom"):
            raise _Refused(f"the build option {name} is not allowed")
    _check_namespaces(options)
    for name, value in options:
        if name == "--tag":
            _refuse_image(value or "", " given to --tag")
        elif name == "--volume":
            _refuse_volume(value or "", _stack()[1])
    if "--help" in dict(options) and not operands:
        return
    context = os.path.realpath(BUILD_CONTEXT)
    if len(operands) != 1 or os.path.realpath(os.path.join(cwd, operands[0])) != context:
        raise _Refused(
            "podman build may only build the docker/ directory, named as its one context"
        )
    files = [value or "" for name, value in options if name == "--file"]
    if not files:
        default = os.path.join(context, "Containerfile")
        files = [default if os.path.exists(default) else os.path.join(context, "Dockerfile")]
    for file in files:
        # The file may be read relative to the working directory or to the context, so
        # every candidate that exists must be a file in docker/ that passes.
        candidates = {os.path.realpath(os.path.join(base, file)) for base in (cwd, context)}
        found = [path for path in candidates if os.path.exists(path)]
        if file == "-" or not found:
            raise _Refused(f"the guard cannot find the container file {file!r}")
        for path in found:
            if not _inside(path, context) or path == context:
                raise _Refused(f"the container file {file!r} is not a file in docker/")
            _check_containerfile(path)


def _check_compose(words: list[str], cwd: str) -> None:
    options, operands, rest = _parse_options(words, COMPOSE_OPTIONS, stop=True)
    for name, _ in options:
        if name in ("--project-name", "--project-directory"):
            raise _Refused(f"the compose option {name} would select another project's containers")
    if not operands:
        return
    subcommand = operands[0]
    if subcommand not in COMPOSE_SUBCOMMANDS:
        raise _Refused(f"the compose subcommand {subcommand!r} is not allowed")
    if subcommand in COMPOSE_WITHOUT_FILE:
        return
    files = [value or "" for name, value in options if name == "--file"]
    if not files:
        raise _Refused(
            "a compose command must name its file with -f, such as -f docker/compose.yaml"
        )
    volumes: set[str] = set()
    for file in files:
        if file == "-":
            raise _Refused("the guard cannot check a compose file read from standard input")
        services, declared = _read_compose(os.path.join(cwd, file))
        for service, image in services.items():
            if not _compose_image_allowed(image):
                _refuse_image(image, f" of the service {service!r} in {file!r}")
        volumes |= declared
    if subcommand == "run":
        run_options, _, _ = _parse_options(rest, COMPOSE_RUN_OPTIONS, stop=True)
        for name, value in run_options:
            if name == "--volume":
                _refuse_volume(value or "", volumes)


def _check_container_use(cli: str, words: list[str], cwd: str) -> None:
    """Refuse a container command that uses another image, container, or volume (F4).

    ``words`` follow the CLI name and its global options. docker may only list; podman
    may use only the subcommands in PODMAN_SUBCOMMANDS, the listings, and compose.
    """
    key, rest = (words[0] if words else None), words[1:]
    if key in PODMAN_GROUPS and rest:
        key, rest = f"{key} {rest[0]}", rest[1:]
    key = PODMAN_ALIASES.get(key, key)
    if cli == "docker":
        if key is None or key in DOCKER_LISTINGS:
            return
        raise _Refused(
            "docker may only list (ps, images, version, info); use podman, which the guard checks"
        )
    if key is None or key in PODMAN_LISTINGS:
        return
    if key == "compose":
        return _check_compose(rest, cwd)
    if key not in PODMAN_SUBCOMMANDS:
        raise _Refused(
            f"the podman subcommand {key!r} is not allowed in implementer sessions; see "
            "docs/isolation.md, Containers"
        )
    kind, spec = PODMAN_SUBCOMMANDS[key]
    options, operands, _ = _parse_options(rest, spec, stop=key in COMMAND_TAILS)
    names = {name for name, _ in options}
    if kind == "build":
        return _check_build(options, operands, cwd)
    selecting = names & (RUN_REFUSED if kind == "run" else SELECTING_OPTIONS)
    if selecting:
        raise _Refused(f"the option {min(selecting)} is not allowed with podman {key}")
    if not operands:
        if "--help" in names or key == "stats":
            return
        raise _Refused(f"podman {key} names no image or container")
    if kind == "run":
        _refuse_image(operands[0])
        _check_namespaces(options)
        for name, value in options:
            if name == "--volume":
                _refuse_volume(value or "", _stack()[1])
            elif name == "--mount":
                _refuse_mount(value or "")
            elif name == "--volumes-from":
                _refuse_container((value or "").split(":")[0])
    elif kind == "images":
        for operand in operands:
            _refuse_image(operand)
    elif kind == "inspect":
        for operand in operands:
            if not _image_allowed(operand):
                _refuse_container(operand)
    elif kind == "containers":
        for operand in operands[:1] if key in FIRST_OPERAND_ONLY else operands:
            _refuse_container(operand)
    elif len(operands) != 2:  # cp
        raise _Refused("podman cp takes one source and one destination")
    else:
        for operand in operands:
            head, separator, _ = operand.partition(":")
            if separator and "/" not in head:
                _refuse_container(head)


def _container_use_reason(cli: str, words: list[str], cwd: str) -> str | None:
    try:
        _check_container_use(cli, words, cwd)
    except _Refused as exc:
        return str(exc)
    except (OSError, ValueError) as exc:
        return (
            f"the guard cannot read a file that this container command uses ({type(exc).__name__})"
        )
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
            return WEBSEARCH_REASON
    return None


# Decision and audit -----------------------------------------------------------------


def decide(event: dict) -> tuple[bool, str]:
    """Return ``(allowed, reason)`` for one PreToolUse event."""
    misplaced = _misplaced()
    if misplaced:
        return False, misplaced
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
        misplaced = _misplaced()
        if misplaced:  # the audit directory would be wrong too, so nothing is written
            _stderr(f"Blocked by the Complete clean-room guard: {misplaced}. {DENY_NOTE}\n")
            return 2
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
        note = FIXABLE_NOTE if reason in FIXABLE_REASONS else DENY_NOTE
        _stderr(f"Blocked by the Complete clean-room guard: {reason}. {note}\n")
        return 2
    except BaseException as exc:  # fail closed: any failure, even SystemExit, blocks the call
        try:
            _stderr(f"The Complete clean-room guard failed and blocked this call ({exc!r}).\n")
        except BaseException:
            pass
        return 2


if __name__ == "__main__":
    sys.exit(main())
