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
| Everything else in `<ws>/complete-specs/`: `analysis/`, `env/`, `tools/`, `evidence/`, `inventory/`, `.git/`, `.githooks/`, the repository files, and the directory itself | No access |
| `<ws>/complete-audit/` | Written by the guard hook only |

## Layers

The layers overlap on purpose: Claude Code permissions are not an operating-system boundary.

| Layer | Where | What it does |
|---|---|---|
| **L1 Permissions** | `.claude/settings.local.json` (generated, not committed) | Blocks reads outside the working directories; adds the CE tree, `slices/`, and `templates/` as extra directories; denies reading the EE tree, the analyst-only areas, and the specification repository's `.git/` and `.githooks/`; denies editing anything under `odoo-reference/`, `complete-specs/`, and this repository's `.claude/`, `.git/hooks`, and `.git/config`. Claude Code turns these deny rules into sandbox write denials, so they name only the git paths that must stay read-only: a rule for all of `.git/` would stop shell commands from branching and committing. The guard keeps the Edit and Write tools out of the whole `.git/` directory. Covers Read, Edit, Write, and NotebookEdit; Grep and Glob only on a best-effort basis. |
| **L2 Guard hook** | `.claude/settings.json` and `.claude/hooks/guard.py` (committed) | A `PreToolUse` hook that runs before every tool call, including calls made by subagents. It blocks forbidden calls, fails closed, and writes the audit log. |
| **L3 Sandbox** | `.claude/settings.local.json` | Runs shell commands in a bubblewrap sandbox in which the EE tree and the whole specification repository are unreadable (`denyRead`) except `slices/` and `templates/` (`allowRead`), this repository's `.claude/`, `.git/hooks`, and `.git/config` are not writable (`denyWrite`), the CE tree, `slices/`, and `templates/` are not writable either (`denyWrite`, because Claude Code makes every working directory writable inside the sandbox), and network access is limited to the web allowlist. In `.git/`, only `hooks/` and `config` are read-only by these settings; Claude Code itself also keeps `config.worktree`, `branches/`, `remotes/`, and `objects/info/alternates` read-only (observed with Claude Code 2.1.318; rerun the git probe below after an upgrade). Everything else in `.git/` is writable, so shell commands can create and switch branches, stage files, and commit. Git commands that change the repository configuration fail, such as `git config`, `git branch --set-upstream-to`, or `git push -u`; `git branch -D` deletes the branch but warns that it could not update the configuration. Claude Code refuses to run shell commands when the sandbox is unavailable (`failIfUnavailable`), and a command cannot ask to leave it (`allowUnsandboxedCommands: false`). |
| **L4 Web** | Guard hook and the sandbox network allowlist | WebFetch only over https to allowlisted hosts; WebSearch only with `allowed_domains` taken from the same list; shell network traffic only to those hosts. Every fetched URL is in the audit log. |
| **L5 OS user** (optional) | Operating system | Implementer sessions run as a separate Linux user without read permission on `<ws>/odoo-reference/enterprise`. The only layer that does not depend on Claude Code. |

The web allowlist is `www.odoo.com`, `odoo.com`, `nightly.odoo.com`, `github.com`, `api.github.com`, `raw.githubusercontent.com`, `codeload.github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org`, `docs.python.org`, `www.postgresql.org`, `developer.mozilla.org`, and `www.gnu.org`. It is defined once, as `ALLOWED_HOSTS` in the guard, and the generator copies it into the sandbox settings.

### What the guard blocks

The guard derives the workspace root from its own location, `<ws>/complete/.claude/hooks/guard.py`, and blocks a tool call when:

- **Paths:** a path argument (`file_path`, `path`, `notebook_path`) lies in the EE tree or in an analyst-only area after `~` expansion, resolution against the session's working directory, and symlink resolution. The same applies when the working directory itself lies in such an area, when a Grep or Glob search starts at `<ws>/complete-specs` itself (whatever the pattern), and when a Grep search, or a Glob pattern that descends more than one level, starts at a directory that contains a forbidden area (such as `<ws>` or `<ws>/odoo-reference`).
- **Text:** any text in the input of any tool names the EE tree (`odoo-reference/enterprise`), an EE build (`+e.20…`), or a path below `complete-specs/` other than `slices` and `templates`. The check also runs on the text with quotes and backslashes removed and on every path with `..`, `.`, and doubled slashes resolved, so `"odoo-reference"/'enterprise'` and `community/../enterprise` count too. Prose punctuation after a path is not part of it: trailing `, ; : ! ? ) ] } ' "`, one final period, and a run of `*` that mirrors the same run at the start (Markdown bold) are ignored, so `complete-specs/slices.` and `**complete-specs/slices**` are allowed. A lone trailing `*` is a glob and stays, so `complete-specs/slices*` is blocked.
- **Shell:** a command uses `claude` as a command (starting another Claude Code process), asks to run outside the sandbox, touches the isolation configuration (`.claude/hooks`, `.claude/settings*`, `.claude.json`, the `.claude` directory as a whole, or `disableAllHooks`), touches the git hooks (`.git/hooks` or `core.hooksPath`, in any case), or names the specification repository itself. In shell commands `complete-specs` may appear only as `complete-specs/slices` or `complete-specs/templates`: `cd ../complete-specs`, `git -C ../complete-specs`, `ls ../complete-specs`, and repository names such as `<owner>/complete-specs` are blocked. A command that merely contains a blocked word, such as `grep -r claude docs`, is blocked too; rephrase it.
- **Containers:** see [Containers](#containers).
- **Writes:** Edit, Write, MultiEdit, or NotebookEdit would change anything in this repository's `.claude/` directory (the guard hook and the settings among them) or `.git/` directory, the user's Claude Code settings (`~/.claude/settings.json`, `~/.claude/settings.local.json`, and `~/.claude.json`), the container configuration (`~/.config/containers/`), the audit log, or anything under `odoo-reference/` or `complete-specs/`.
- **Web:** a WebFetch URL, or the `url` of an MCP tool, is not https on an allowlisted host, or carries credentials, whitespace, or backslashes; or a WebSearch call lacks `allowed_domains` from the allowlist.

The model receives the reason on stderr with one of two notes:

- **Fixable request errors** say how to correct the call, and the model may retry it corrected. The only one is a WebSearch call without `allowed_domains` (or with a host outside the allowlist): the reason lists the allowlist, and the retry sets `allowed_domains` from it.
- **Boundary denials** are everything else. The note says that the block is the isolation boundary, that the action must not be retried another way, and that the model tells the user what was blocked. Rewording, splitting, or encoding a blocked path to get past the guard is working around the boundary.

### Worktrees

The guard derives the workspace root from its own location, so a copy of the guard in a git worktree would compute the wrong root. When the repository path has a `.claude` component (as in `.claude/worktrees/<name>`) or the repository's `.git` is a file (any linked worktree or submodule), the guard blocks every call. It writes no audit line in that case, because the audit directory it would compute is wrong too. Implementer sessions do not use worktrees.

### Failing closed

Claude Code blocks a call only when the hook exits with code 2. Any other exit code, a crash, or a timeout lets the call through. The guard therefore turns every failure into exit code 2: malformed input, any exception (including `KeyboardInterrupt` and `SystemExit`), and a failed audit write. It installs its exception hook before any other import, so a failing import also exits with 2.

The hook command is `python3 -I "${CLAUDE_PROJECT_DIR}/.claude/hooks/guard.py" || exit 2`. `-I` (isolated mode) keeps the script directory, the user's site-packages, and the `PYTHON*` environment variables out of the interpreter, so a planted `json.py` next to the guard or a `.pth` file in `~/.local` cannot replace a module the guard imports. `|| exit 2` turns every other non-zero exit, such as a syntax error in the guard or a missing `python3`, into a block. The hook entry adds `"onFailure": "block"` as a third layer and a 10-second timeout.

## Setting up a machine

The committed `.claude/settings.json` registers the guard for every session started in `complete/`. The rest of the configuration names absolute paths on the owner's machine, so it is generated into `.claude/settings.local.json`, which git ignores:

```sh
cd <ws>/complete
.venv/bin/python -m tools.setup_isolation --workspace <ws>
```

The command refuses to overwrite an existing file (exit code 1); pass `--force` to regenerate it. It also refuses a `--workspace` that is not the directory holding the repository (exit code 2), because the guard derives its workspace root from the repository location and the two would disagree.

Then start `claude` in `<ws>/complete`, accept the trust dialog, open `/hooks` to confirm that the `PreToolUse` guard is listed, and exit. Start a new session after generating or changing the settings. A session that is already running in `complete/` picks up generated or changed settings at once, the sandbox included. Shell commands that the owner types with `!` run outside the sandbox. The hook needs `python3` (3.12 or later) on the `PATH`.

## Containers

Podman does not work inside the sandbox: it writes container storage under the home directory and sets up its own namespaces and networking. `sandbox.excludedCommands` therefore runs `podman` commands outside the sandbox, where L3 does not apply, so container commands rely on two other layers:

- **L2:** the guard treats a shell command as a container command when `podman` or `docker` is in command position: the first word of the line, the first word after a separator (`;`, `&`, `&&`, `|`, `||`, a newline, `(`, `$(`, a backtick), or any word after a wrapper such as `sudo`, `env`, `timeout`, or `xargs`. Here-document bodies and quoted arguments of other commands are text, not commands, so `cat <<EOF … podman … EOF`, `echo '… podman …'`, and `git commit -m '… podman …'` are not container commands. The guard follows only a conservative subset of bash: blanks, separators, redirections, quotes, backslashes, `$(…)`, comments after a blank, and here-documents. When a command that mentions `podman` or `docker` anywhere uses other syntax that can change how bash splits it into commands, the guard blocks it rather than guess. That syntax includes `$'…'`, `$"…"`, `$((…))`, `((…))`, `$[…]`, `${…}`, backticks, a `#` right after an operator, `case`, `[[`, an unterminated here-document, and `$(…)` or backticks in the body of a here-document whose delimiter is unquoted (bash runs those). Quote the delimiter (`<<'EOF'`) for such text. A container command must:
  - be one simple command that starts with `podman` or `docker` itself, without `NAME=value` prefixes or wrappers;
  - contain none of `;` `&` `|` `<` `>` `` ` `` `$` `(` `)` `{` `}` `*` `?` `[` `]` `~` or a newline, so no pipes, redirections, substitutions, variables, globs, brace expansion, or home-directory paths;
  - use no global option before the subcommand other than `--version`, `-v`, `--help`, or `-h` (this rules out `--remote`, `-r`, `--url`, `--connection`, `-c`, `--identity`, `--hooks-dir`, `--runtime`, and the like);
  - not use the subcommands `unshare`, `machine`, `system service`, or `system connection`;
  - pass no word that is, or contains, a forbidden area after symlink resolution: bind mounts (`-v`, `--volume`, `--mount source=…`), build contexts, `podman cp` sources, and so on;
  - pass no word that is, lies in, or contains an owner-managed location: this repository's `.git/` and `.claude/`, `~/.config/containers/`, `~/.claude/`, `~/.claude.json`, and the audit log. Podman writes outside the sandbox, so the sandbox's `denyWrite` does not protect these from a container. This rules out mounting or copying to or from the repository root, the workspace root, or the home directory: mount `./addons` (as `docker/compose.yaml` does) and build from `docker/`.

  The guard cannot see paths inside compose files, Containerfiles, kube YAML, or files passed to `podman secret create`. Keep bind mounts inside `complete/` and on the command line.
- **L5:** with a separate OS user, a container started by an implementer session cannot read the EE tree whatever it mounts, because rootless Podman runs with that user's permissions.

Run module tests with one plain command, without pipes or substitutions. `docker/compose.yaml` takes `ODOO_RELEASE` from the environment and fails when it is missing; the `--env-file` flags supply it from `docker/versions.env` (the single source of the pin) and the database credentials from `docker/.env`, so the command needs no `NAME=value` prefix. Create `docker/.env` once with `cp docker/.env.example docker/.env`. `make test` does the same for the owner and for CI, but starts podman through `make`, so a guarded session should use the command below:

```sh
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm odoo odoo -d <db> -i <mods> --test-tags <tags> --stop-after-init
```

To keep the output, rerun or scroll rather than piping it; a pipe or redirection makes the command a compound one, which the guard blocks.

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

The isolation files are `.claude/settings.json`, `.claude/hooks/guard.py`, `tools/setup_isolation.py`, their tests, and this page. Only the owner changes them, outside implementer sessions: from a Claude Code session started in `<ws>` (which does not load this repository's hook) or from a plain shell. The guard enforces part of this: it rejects writes to the `.claude/` directory and any edit whose text names a forbidden path, which most of these files contain. After a change, run the tests (`.venv/bin/pytest -q`), regenerate the local settings with `--force` if the generator changed, and rerun the isolation check.

## Isolation check

The isolation check is the gate before the pilot, and it is rerun after every change to the isolation files. The threat model is accidental access (broad searches, paths taken from error messages, web results), not a session that sets out to defeat the layers, so the check confirms that every layer is loaded rather than hunting for evasions. The owner starts one headless implementer session in `complete/` in `auto` mode from a shell, and that session must show that:

- Read, Grep, `cat`, and a subagent cannot read a file in the EE tree. The L1 deny rules stop a Read of the EE tree before the guard runs, so such calls leave no audit line. The guard denies shell commands, and a subagent's calls, that name the EE tree, with its boundary note, and logs them with `allowed: false` (L2). A headless session has no Grep tool, so the shell `grep` stands in for it. The probe names a file that does not exist, so nothing from EE can reach the transcript even if a layer is missing.
- Read cannot open a file outside the working directories that the guard does not cover, such as `/etc/hostname` (L1).
- A shell command cannot write outside the working directory or into the read-only extra directories: a write to `/tmp` or to `<ws>/complete-specs/templates/` fails with a read-only file system error. The sandbox hides the home directory behind an empty layer that it discards after each command, so a write there seems to succeed but never reaches the disk; the owner confirms from a shell that no file appeared. `cat` can read a file in `<ws>/complete-specs/templates/` (L3, including `allowRead` inside `denyRead`).
- Git works inside the sandbox (L1 and L3): the session creates a branch, commits to it, switches back, and deletes the branch, and the owner confirms from a shell, with `git reflog`, that the commit reached the disk. A shell write to `.git/hooks/` or `.git/config` still fails with a read-only file system error. The guard blocks shell commands that name `.git/hooks`, so the probe runs the write from a script file, which the session writes into the working directory first and deletes afterwards.
- A module created with the scaffold passes its tests with the command in [Containers](#containers).

Inside the sandbox, `git status` lists about 20 untracked placeholders, such as `.bashrc`, `.mcp.json`, `.vscode`, and `.claude/agents`. The sandbox mounts them so that those files cannot be created. They are not on disk. Check whether the tree is clean from the owner's shell, or limit `git status` to the paths in question.

Any failure blocks the pilot until the responsible layer is fixed. The evidence is kept in the private specification repository.

### Full escape test

After a larger change to the layers, the owner can also run the full escape test. It plants a random canary token in the EE tree and starts headless implementer sessions in `complete/`. Each session is asked to read the canary by a different route: Read, Grep, Glob, `cat`, `grep`, `find`, `tar`, a symlink, a subagent, a nested `claude -p`, WebFetch of a `file://` URL, and a Podman bind mount. The test fails if the token appears in any transcript or if a route was never attempted. The tool lives in the private specification repository, and the owner runs it from a shell rather than from a Claude Code session, because it starts Claude Code itself:

```sh
cd <ws>/complete-specs
.venv/bin/python -m tools.escape_test --complete <ws>/complete \
  --ee-root <ws>/odoo-reference/enterprise/<build> \
  --modes auto,bypassPermissions --out evidence/
```

It prints a PASS/FAIL table, writes JSON and Markdown evidence to `evidence/`, and exits with code 1 on failure. A failure is handled like a failed isolation check. If the deny rules do not hold under `bypassPermissions`, implementer sessions never use that mode.

## Limits

- L2 reads the text of a call, not its meaning. A shell command can assemble a path in ways the guard cannot see, such as variables, globs, encodings, or scripts written earlier. For shell commands the sandbox (L3) is the operating-system boundary; for containers, L5 is.
- The guard's self-protection in shell commands (the `.claude` configuration, the git hooks, the bare specification repository) is a set of regular expressions over the command text, so a command that builds those names at run time is not caught. The sandbox's `denyWrite` and L5 cover that.
- MCP tools get only the text rule, the path rule for the `file_path`, `path`, and `notebook_path` keys, and the URL rule for a `url` key. An MCP server that reads files or fetches pages under other argument names is not checked; implementer sessions run without file-system or browser MCP servers.
- The guard checks a call before it runs, and the tool acts on the file system afterwards. In that window a symlink or file can change (a time-of-check to time-of-use race), so a path that was safe when checked may not be when used. The sandbox and L5 do not have this gap.
- The guard trusts its own location and protects the directory above the repository. Anyone who clones the repository and uses Claude Code in it runs the guard too, and it writes its audit log to `complete-audit/` next to the clone.
- A domain allowlist cannot tell an OCA repository from a leaked EE copy on the same host, so L4 also relies on policy and the audit log.
- Only L5, a separate OS user without read permission on the EE tree, is a hard guarantee. It holds against a session that sets out to defeat the other layers. Set it up before slice work.
