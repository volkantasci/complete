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
  - Search with `git grep`, which skips untracked files, or exclude `.superpowers/` from any other recursive search.
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
  - Never run a container as root.
  - A run that writes files through a container, such as screenshots or browser logs, leaves them owned by the container's user. Write them under one directory, and copy what you keep. If you cannot remove that directory afterwards, name it in your report: the owner's next command removes it.
- **Long runs.** A subagent waits for its own long runs, such as screenshot batches and test suites, inside its turn, with a foreground command or a monitor. It never ends its turn while one is still running, because the harness may not wake it again. Put this rule into every dispatch that starts a long run.
- **Names.** Use technical names only where `model.md` requires them. Give every other identifier a name of your own ([module-authoring.md](../module-authoring.md#naming)).
- **Wording.** The spec's screenshots show the original's wording. Write every user-facing text in your own words, with the meaning the spec gives, except the texts the spec prescribes.
- **Isolation files** (listed in [isolation.md](../isolation.md)) stay unchanged.
- **Phase 0 infrastructure** (`tools/`, `docker/`, `.github/`): change it only if the slice needs it. Make each such change in its own commit, give the reason, and list it in your report.
- **Licensing:** follow [licensing.md](../licensing.md).

## Work

1. **Read** `docs/process.md`, `docs/module-authoring.md`, `docs/licensing.md`, the "Containers" section of `docs/isolation.md`, `provenance/README.md`, and every file of the spec package.
2. **Plan.** Write the plan with the superpowers:writing-plans skill.
   - Save it as `.superpowers/sdd/plans/<NNN>-<name>-implementation.md`, which is git-ignored.
   - The method is subagent-driven. Do not wait for a plan review, and do not use the brainstorming skill.
   - Give every scenario in `acceptance.md` a task, including the scenarios that check a correction to an earlier package and need no new code.
3. **Implement** with the superpowers:subagent-driven-development skill on the branch above.
   - Models: implementers sonnet, task reviewers sonnet, and the final whole-branch review on opus.
   - Dispatch implementers one after another, never two at once. They share one checkout, so one could commit the other's unfinished lines.
   - Derive the tests from `acceptance.md`, and name each one after its scenario id.
   - A test of a measured value checks the element that the package's probe names, in a state where a misplaced value would show, such as a scrolled list, and not only where the content ends up.
   - Where the package gives a value for a touch device or with scrollbars drawn, test it in that state: with touch emulation, or with classic scrollbars switched on.
   - Browser unit tests assert structure, such as heights, paddings and truncation. Exact widths that depend on the text belong in the browser probes, because the unit-test bundle's fonts change when every module is installed.
   - A unit test of a delay or a deadline freezes the test clock and advances it itself. A check that relies on real time, such as 99 ms of a 100 ms delay, fails on a loaded CI runner.
   - A unit test finds every element in the page, including those a stylesheet hides. Assert what a user sees, such as a dialog's visible buttons, in a tour.
   - Tests create the records they need, so that they pass with and without demo data. CI installs every module without it.
   - Give every behaviour that depends on the live web client, such as what happens while a view scrolls, a tour in a real browser session as well as a unit test.
4. **Screenshots before the final review.** Take Complete screenshots at 1600×900 and 390×844 under `docs/assets/<area>/`, and compare them with the spec's screens. Tests can pass while the UI is wrong. Compare the module's user-facing texts with the visible wording in the screens too, and reword any sentence that repeats it.
5. **Overlap report.** When every task is implemented and reviewed, and before the final review, stop.
   - Report with Status `OVERLAP_CHECK`, the module paths, and every spec question and ruling so far, in full and in spec language.
   - The coordinator sends the spec questions to the analyst. The answers come back in the package, with a dated list of what changed, and replace your rulings on those points.
   - The owner then runs the overlap report: the Complete paths and line numbers that match the reference, with no reference text. The coordinator resumes you with that list.
   - Rename or rewrite every listed line that `model.md` does not require. A listed line that the module's provenance record already lists as a reviewed match stays as it is. Then apply the package's changes, and continue with the next step.
6. **Document:** the module README, the user documentation and the module's `static/description/index.html`.
7. **Check:**
   - `.venv/bin/pytest -q`;
   - `.venv/bin/pre-commit run --all-files`;
   - the module tests with the podman command and demo data, with and without each module that your code adapts to. Add `--with-demo`: Odoo 20 installs no demo data without it;
   - the module tests as CI runs them: every module under `addons/` installed together on a fresh database without demo data, with CI's test tags (the step "Install and test modules" in `.github/workflows/ci.yml`);
   - then the final review, with one fix wave;
   - then the module tests and CI's configuration again at the final head, each on a fresh database. Run one test container at a time: a browser test can fail when two run together.
8. **Stop before integration.** The provenance record and the merge come after verification and the owner's approval.

## Report

Your final message is copied to the coordinator. Make it self-contained, write it in plain English, and include:

- **Status:** DONE, DONE_WITH_QUESTIONS, or BLOCKED with the exact error.
  - DONE: the branch is ready for verification, even with spec questions that the verifier can judge.
  - DONE_WITH_QUESTIONS: a question must be answered before verification, such as a scenario not built, or built on a guess the verifier cannot judge. It stops the chained steps.
- **Branch and commits,** and the plan path.
- **Modules** and what each covers.
- **Tests:** counts and results, the exact commands, and a table that maps each scenario id to its test, or to "visual, not automated". Include CI's configuration at the final head.
- **Screenshots:** paths.
- **Spec questions and rulings,** in spec language.
- **Reviews:** fix rounds and the final verdict.
- **Working tree:** the output of `git status --porcelain`, which must be empty. If a file is left that you cannot remove, give its path and the reason.
- **For the verifier:**
  - the exact commands that create the demo database with the module and demo data, and that start Complete;
  - how the hosts of `acceptance.md` get into that database, and how a restricted user logs in;
  - how a browser session reaches the states your tours prepare, such as a fixed date or another language.
- **Time and friction:**
  - the start and end (UTC) of plan, implementation, documentation and review;
  - what slowed you down.

Before the final message, make sure no subagent or background task is still running, and schedule no fallback checks. If you are woken after it, send the full report again.

Then stop.
