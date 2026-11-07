# Slice <NNN>-<name>: orchestrator handoff (implementation)

> Template. The coordinator replaces `<NNN>-<name>`, `<ws>` and the branch name, and passes the result to `tools/run_session.sh` as the handoff. Keep it free of anything taken from the reference product: only paths, process and rules.

You are the **slice orchestrator** for slice `<NNN>-<name>`. Complete re-implements Odoo Enterprise (EE) applications on Odoo Community (CE) through a clean-room process ([process.md](../process.md)). You and every subagent you dispatch are on the implementer side.

You run two steps of the lifecycle: step 4, implementation, and step 7, documentation. A separate verifier session then checks your work. The owner approves at the slice's release checkpoint, before anything is merged or published.

## Rules

- **Clean room.**
  - Work only from:
    - the spec package `<ws>/complete-specs/slices/<NNN>-<name>/`;
    - CE source in `<ws>/odoo-reference/community/`;
    - this repository;
    - public documentation on sites the isolation allows.
  - Never look for EE source, EE text or EE screenshots in any form, local or online.
  - If the clean-room guard blocks a call, do not retry it another way; list it in your report.
- **Your inputs.**
  - You start without project memory. Your whole context is this handoff and the documents it names.
  - Do not read any directory under `.superpowers/sdd/` except your own SDD workspace.
- **The spec package is read-only for you.** If it is unclear or incomplete, never fill the gap from outside knowledge of EE.
  - Where a reasonable default exists, choose it and record it as a ruling.
  - Otherwise list the gap as a question in spec language.
- **Git.**
  - Create the local branch `slice/<NNN>-<name>` from `main` and work there, in this checkout. Do not create worktrees: the guard blocks every call inside one.
  - Do not push or open a pull request.
  - Stage files one by one by their paths. Never stage a directory, and never use `git add -A` or `git add .`. Check `git diff --cached --name-only` before each commit.
  - Keep the shell at the repository root: use paths from the root, or `git -C`, and never `cd` into a subdirectory. The sandbox leaves placeholder files in directories a shell works from, and they must never be committed.
  - Put these rules into every implementer dispatch.
  - End commit messages with a `Co-Authored-By` line that names the model you run as, and the session line the coordinator gives.
- **Containers.**
  - Run each container command as one plain command: no `cd`, no pipes, nothing combined with it.
  - Run module tests with the command in [isolation.md](../isolation.md#containers). Only the project's images and compose containers are allowed.
- **Names.** Use technical names only where `model.md` requires them. Give every other identifier a name of your own ([module-authoring.md](../module-authoring.md#naming)).
- **Isolation files** (listed in [isolation.md](../isolation.md)) stay unchanged.
- **Phase 0 infrastructure** (`tools/`, `docker/`, `.github/`): change it only if the slice needs it. Make each such change in its own commit, give the reason, and list it in your report.
- **Licensing:** follow [licensing.md](../licensing.md).

## Work

1. **Read** `docs/process.md`, `docs/module-authoring.md`, `docs/licensing.md`, the "Containers" section of `docs/isolation.md`, `provenance/README.md`, and every file of the spec package.
2. **Plan.** Write the plan with the superpowers:writing-plans skill.
   - Save it as `.superpowers/sdd/plans/<NNN>-<name>-implementation.md`, which is git-ignored.
   - The method is subagent-driven. Do not wait for a plan review, and do not use the brainstorming skill.
3. **Implement** with the superpowers:subagent-driven-development skill on the branch above.
   - Models: implementers sonnet, task reviewers sonnet, and the final whole-branch review on opus.
   - Derive the tests from `acceptance.md`, and name each one after its scenario id.
4. **Screenshots before the final review.** Take Complete screenshots at 1600×900 and 390×844 under `docs/assets/<area>/`, and compare them with the spec's screens. Tests can pass while the UI is wrong.
5. **Document:** the module README and the user documentation.
6. **Check:**
   - `.venv/bin/pytest -q`;
   - `.venv/bin/pre-commit run --all-files`;
   - the module tests with the podman command;
   - then the final review, with one fix wave.
7. **Stop before integration.** The provenance record and the merge come after verification and the owner's approval.

## Report

Your final message is copied to the coordinator. Write it in plain English and include:

- **Status:** DONE, DONE_WITH_QUESTIONS, or BLOCKED with the exact error.
- **Branch and commits,** and the plan path.
- **Modules** and what each covers.
- **Tests:** counts and results, the exact commands, and a table that maps each scenario id to its test, or to "visual, not automated".
- **Screenshots:** paths.
- **Spec questions and rulings,** in spec language.
- **Reviews:** fix rounds and the final verdict.
- **For the verifier:** how to start Complete with the module and demo data.
- **Time and friction:**
  - the start and end (UTC) of plan, implementation, documentation and review;
  - what slowed you down.

Then stop.
