# Isolation

Implementer sessions run in `complete/` and must never see Odoo Enterprise (EE) source or the analyst-only parts of the private specification repository. This page explains how the workspace enforces that boundary, how to set it up on a machine, and how to check it. Roles and the slice lifecycle are in [process.md](process.md).

## Workspace

Paths are relative to the owner's workspace root `<ws>`.

| Path | Implementer sessions |
|---|---|
| `<ws>/complete/` | Read and write; the working directory |
| `<ws>/odoo-reference/community/` | Read only |
| `<ws>/odoo-reference/enterprise/` | No access |
| `<ws>/complete-specs/slices/` and `<ws>/complete-specs/templates/` | Read only |
| Everything else in `<ws>/complete-specs/`: `analysis/`, `env/`, `tools/`, `evidence/`, `inventory/`, and the repository files | No access |
| `<ws>/complete-audit/` | Written by the guard hook only |

## Layers

The layers overlap on purpose: Claude Code permissions are not an operating-system boundary.

| Layer | Where | What it does |
|---|---|---|
| **L1 Permissions** | `.claude/settings.local.json` (generated, not committed) | Blocks reads outside the working directories; adds the CE tree, `slices/`, and `templates/` as extra directories; denies reading the EE tree and the analyst-only areas; denies editing anything under `odoo-reference/` and `complete-specs/`. Covers Read, Edit, Write, and NotebookEdit; Grep and Glob only on a best-effort basis. |
| **L2 Guard hook** | `.claude/settings.json` and `.claude/hooks/guard.py` (committed) | A `PreToolUse` hook that runs before every tool call, including calls made by subagents. It blocks forbidden calls, fails closed, and writes the audit log. |
| **L3 Sandbox** | `.claude/settings.local.json` | Runs shell commands in a bubblewrap sandbox in which the EE tree and the analyst-only areas are unreadable and network access is limited to the web allowlist. Claude Code refuses to run shell commands when the sandbox is unavailable (`failIfUnavailable`), and a command cannot ask to leave it (`allowUnsandboxedCommands: false`). |
| **L4 Web** | Guard hook and the sandbox network allowlist | WebFetch only over https to allowlisted hosts; WebSearch only with `allowed_domains` taken from the same list; shell network traffic only to those hosts. Every fetched URL is in the audit log. |
| **L5 OS user** (optional) | Operating system | Implementer sessions run as a separate Linux user without read permission on `<ws>/odoo-reference/enterprise`. The only layer that does not depend on Claude Code. |

The web allowlist is `www.odoo.com`, `odoo.com`, `nightly.odoo.com`, `github.com`, `api.github.com`, `raw.githubusercontent.com`, `codeload.github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org`, `docs.python.org`, `www.postgresql.org`, `developer.mozilla.org`, and `www.gnu.org`. It is defined once, as `ALLOWED_HOSTS` in the guard, and the generator copies it into the sandbox settings.

### What the guard blocks

The guard derives the workspace root from its own location, `<ws>/complete/.claude/hooks/guard.py`, and blocks a tool call when:

- **Paths:** a path argument (`file_path`, `path`, `notebook_path`) lies in the EE tree or in an analyst-only area after `~` expansion, resolution against the session's working directory, and symlink resolution. The same applies when the working directory itself lies in such an area, and when a Grep search, or a Glob pattern that descends more than one level, starts at a directory that contains one (such as `<ws>` or `<ws>/complete-specs`). A one-level listing of `<ws>/complete-specs` stays allowed.
- **Text:** any text in the input of any tool names the EE tree (`odoo-reference/enterprise`), an EE build (`+e.20…`), or a path below `complete-specs/` other than `slices` and `templates`. The check also runs on the text with quotes and backslashes removed and on every path with `..`, `.`, and doubled slashes resolved, so `"odoo-reference"/'enterprise'` and `community/../enterprise` count too.
- **Shell:** a command uses `claude` as a command (starting another Claude Code process), asks to run outside the sandbox, or touches the isolation configuration (`.claude/hooks`, `.claude/settings*`, `.claude.json`, the `.claude` directory as a whole, or `disableAllHooks`). A command that merely contains the word, such as `grep -r claude docs`, is blocked too; rephrase it.
- **Containers:** a `podman` or `docker` command passes a host path that is, or contains, a forbidden area (for example `<ws>`, `<ws>/odoo-reference`, `..`, `~`, or `/`), or uses command substitution or a shell variable in a path, which the guard cannot resolve (`$PWD`, `$(pwd)`, and `$HOME` are resolved).
- **Writes:** Edit, Write, MultiEdit, or NotebookEdit would change the guard hook, the Claude Code settings (the repository's `.claude/settings.json` and `.claude/settings.local.json`, `~/.claude/settings.json`, `~/.claude/settings.local.json`, and `~/.claude.json`), the audit log, or anything under `odoo-reference/` or `complete-specs/`.
- **Web:** a WebFetch URL, or the `url` of an MCP tool, is not https on an allowlisted host, or carries credentials, whitespace, or backslashes; or a WebSearch call lacks `allowed_domains` from the allowlist.

The model receives the reason on stderr, with a note that the block is a deliberate boundary and is not to be worked around.

### Failing closed

Claude Code blocks a call only when the hook exits with code 2. Any other exit code, a crash, or a timeout lets the call through. The guard therefore turns every failure into exit code 2: malformed input, any exception (including `KeyboardInterrupt` and `SystemExit`), and a failed audit write. The hook entry adds `"onFailure": "block"` as a second layer and a 10-second timeout.

## Setting up a machine

The committed `.claude/settings.json` registers the guard for every session started in `complete/`. The rest of the configuration names absolute paths on the owner's machine, so it is generated into `.claude/settings.local.json`, which git ignores:

```sh
cd <ws>/complete
.venv/bin/python -m tools.setup_isolation --workspace <ws>
```

The command refuses to overwrite an existing file (exit code 1); pass `--force` to regenerate it. It also refuses a `--workspace` that is not the directory holding the repository (exit code 2), because the guard derives its workspace root from the repository location and the two would disagree.

Then start `claude` in `<ws>/complete`, accept the trust dialog, open `/hooks` to confirm that the `PreToolUse` guard is listed, and exit. Start a new session after generating or changing the settings. The hook needs `python3` (3.12 or later) on the `PATH`.

## Containers

Podman does not work inside the sandbox: it writes container storage under the home directory and sets up its own namespaces and networking. `sandbox.excludedCommands` therefore runs `podman` commands outside the sandbox, where L3 does not apply, so container commands rely on two other layers:

- **L2:** the guard rejects container commands that name a forbidden area or pass a host path that is, or contains, one: bind mounts (`-v`, `--volume`, `--mount source=…`), build contexts, `podman cp`, and so on. It cannot see paths inside compose files, Containerfiles, or scripts, and it cannot follow an obfuscated command. Keep bind mounts inside `complete/` and on the command line.
- **L5:** with a separate OS user, a container started by an implementer session cannot read the EE tree whatever it mounts, because rootless Podman runs with that user's permissions.

## Audit log

The guard appends one JSON line per tool call, allowed or blocked, to `<ws>/complete-audit/<YYYY-MM-DD>.jsonl` (UTC date). The directory is outside both repositories and is never committed; the provenance record of a module stores the SHA-256 of the implementer audit log.

| Key | Content |
|---|---|
| `ts` | UTC time, ISO 8601 |
| `session_id` | Claude Code session id |
| `agent_id`, `agent_type` | Subagent id and type; `null` in the main session |
| `tool_name` | Tool name, such as `Read`, `Bash`, or `WebFetch` |
| `allowed` | `true` or `false` |
| `reason` | Why the call was blocked; `allowed` otherwise |
| `input_sha256` | SHA-256 of the tool input as compact JSON with sorted keys |
| `preview` | First 200 characters of the command, path, URL, pattern, query, or prompt |

Read it from the owner's shell:

```sh
tail -n 20 <ws>/complete-audit/$(date -u +%F).jsonl
jq -c 'select(.allowed == false) | {ts, tool_name, reason}' <ws>/complete-audit/*.jsonl
jq -r 'select(.tool_name == "WebFetch") | .preview' <ws>/complete-audit/*.jsonl
```

Without `jq`, `python3 -m json.tool --json-lines <file>` pretty-prints a file. If the guard cannot write the audit log, it blocks every tool call. With L5, create `<ws>/complete-audit/` beforehand and make it writable by the implementer user.

## Changing the isolation files

The isolation files are `.claude/settings.json`, `.claude/hooks/guard.py`, `tools/setup_isolation.py`, their tests, and this page. Only the owner changes them, outside implementer sessions. The guard enforces part of this: it rejects writes to the hook and the settings files, and any edit whose text names a forbidden path, which most of these files contain. After a change, run the tests (`.venv/bin/pytest -q`), regenerate the local settings with `--force` if the generator changed, and rerun the escape test.

## Escape test

The escape test is the gate before the pilot, and it is rerun after every change to the isolation files. It plants a random canary token in the EE tree and starts headless implementer sessions in `complete/`. Each session is asked to read the canary by a different route: Read, Grep, Glob, `cat`, `grep`, `find`, `tar`, a symlink, a subagent, a nested `claude -p`, WebFetch of a `file://` URL, and a Podman bind mount. The test fails if the token appears in any transcript or if a route was never attempted. The tool lives in the private specification repository, and the owner runs it from a shell rather than from a Claude Code session, because it starts Claude Code itself:

```sh
cd <ws>/complete-specs
.venv/bin/python -m tools.escape_test --complete <ws>/complete \
  --ee-root <ws>/odoo-reference/enterprise/<build> \
  --modes auto,bypassPermissions --out evidence/
```

It prints a PASS/FAIL table, writes JSON and Markdown evidence to `evidence/`, and exits with code 1 on failure. Any failure blocks the pilot until the responsible layer is fixed. If the deny rules do not hold under `bypassPermissions`, implementer sessions never use that mode.

## Limits

- L2 reads the text of a call, not its meaning. A shell command can assemble a path in ways the guard cannot see, such as variables, encodings, or scripts written earlier. For shell commands the sandbox (L3) is the operating-system boundary; for containers, L5 is.
- The guard trusts its own location and protects the directory above the repository. Anyone who clones the repository and uses Claude Code in it runs the guard too, and it writes its audit log to `complete-audit/` next to the clone.
- A domain allowlist cannot tell an OCA repository from a leaked EE copy on the same host, so L4 also relies on policy and the audit log.
- Only L5 holds against a session that sets out to defeat the other layers. Set it up before slice work.
