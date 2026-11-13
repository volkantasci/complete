# Slice runbook

This page says how a slice moves through the lifecycle in practice: which sessions run, how they start, where their output goes, and what the pilot taught. The roles, rules and lifecycle themselves are in [process.md](process.md). The first slice run this way is described in the [pilot report](pilot-000-timer.md).

## Sessions

Every session is headless and starts from a handoff file, with auto memory off. The owner starts every session from a shell; an isolated session never starts another one.

| Session | Starts in | May read | Writes | Model in the pilot |
|---|---|---|---|---|
| Analyst | `complete-specs/` | EE, CE, the specification repository | the spec package; analyst scratch area | opus |
| Analyst-side reviewer | subagent of the analyst | same as the analyst | nothing | sonnet |
| Orchestrator | `complete/` (guarded and sandboxed) | the spec package, CE, this repository | branch `slice/<NNN>-<name>` | opus, with sonnet implementers and task reviewers and an opus final review |
| Verifier | `complete-specs/` | EE, Complete (read only), the spec package | `review.md` and `verification/` in the package | opus |
| Maintenance | `<ws>/complete-ops` | what the task needs, never EE | isolation files and tools | opus for isolation files, sonnet otherwise |

Besides these, the coordinator is the owner's interactive session in `complete/`. It writes handoffs, checkpoints, docs and tools, and keeps its ledgers and drafts in `<ws>/complete-coord/`, outside both repositories, where sessions started in `complete/` cannot read them. It starts with `--add-dir <ws>/complete-coord`, a flag no other session gets. The directory is never saved in a settings file: the project and user settings apply to every session started in `complete/`, and `/add-dir` writes the directory into the local settings unless it is added for the session only.

## Starting a session

```sh
tools/run_session.sh WORKDIR HANDOFF STREAM HANDBACK MODEL [claude arguments]
```

- **Memory and limits.** The script turns auto memory off. It lets background subagents run without a time limit, which print mode would otherwise cap at 10 minutes after the last turn.
- **Output.** The stream-json transcript goes to STREAM. When the session ends, the script writes HANDBACK: one header line with the run's numbers, then the session's final message.
  - A session that is woken after its report may end with a one-line message. So when the final message is shorter than 1,500 characters and an earlier result of the same run has a `Status:` line, the handback also carries that earlier report, under "Earlier report in this run".
  - Handoffs still ask for a self-contained final message, sent again if the session is woken after it.
- **Analyst and verifier transcripts** contain EE material. Keep their STREAM in the specification repository's analyst area. Only their final message, written in spec language, reaches the coordinator through the handback.
- **Continuing a session.** To continue a session with its context, pass `--resume <session id>` with a handoff that says what changed. A resumed stream starts with a replayed result event, so wait for the handback file to appear, not for the first result event. The cost in a resumed run's result events counts from the session's first run.
- **Templates.** Every handoff is made from a template. The orchestrator's is [handoffs/orchestrator.md](handoffs/orchestrator.md). The analyst's and the verifier's are in the specification repository under `templates/handoffs/`.

## Overlap feedback during implementation

Implementers cannot see the reference, so they cannot measure overlap. Before the final review, the owner runs `provenance_check --overlap-report` in the specification repository on the slice's modules. That mode prints only the totals and the matching Complete paths and line numbers, never a reference path or reference text. The coordinator passes the list to the orchestrator, which renames or rewrites every listed line that the spec does not require. This replaces the pilot's extra verification round.

## Checkpoints

Each slice has two owner checkpoints:

1. **Spec approved, before implementation.** The analyst's open questions go to the owner. The analyst applies the answers, runs `spec_lint`, and records the package hash.
2. **Verified, before merge and publish.** This follows the verifier's PASS. After the owner's approval:
   - the provenance records are written. They quote the package hash of the verified package and the hash of the implementer sessions' audit rows. The owner extracts those rows by session id and keeps the extract in the specification repository's evidence;
   - the branch is merged and pushed;
   - the package is marked `verified`.

Anything the verifier sends back goes to the owner first. The owner's decisions go into the spec package as numbered decisions before the next verification round, so that the package always describes what Complete does.

## Rules the pilot added

- **Shell discipline.** Implementer sessions keep the shell at the repository root and stage files one by one. They run every container command as one plain command.
- **Own names.** Every identifier that `model.md` does not require gets a name of the implementer's own.
- **Early screenshots.** Take them before the final review: a visual defect passed every test in the pilot.
- **Verifier outputs.** The verifier writes `review.md` and `verification/` in the package, and keeps capture scenarios in the analyst area.
- **Ruling numbers.** Workers number their own rulings with a prefix for their part or session, so that rulings from parallel ledgers do not collide.
- **Isolation changes** run as maintenance parts outside `complete/`, and each ends with a live probe in `complete/` from a shell: the git probe and the container probe in [isolation.md](isolation.md).

## Rules slice 001a added

- **Own wording.** The screenshots in a spec package show the original's wording. Implementers write every user-facing text in their own words, except texts the spec prescribes, and compare their texts with the visible wording before the final review. In 001a, a footer sentence and an example message repeated visible wording and had to be reworded.
- **Tours for live behaviour.** A behaviour that depends on the live web client, such as what happens while a view scrolls, gets a tour in a real browser session. In 001a, a unit test passed while the live view failed, because two applications render their own copy of the template involved.
- **Optional dependencies.** When a module adapts to another module being installed, its tests run both with and without that module.
- **Self-contained reports.** Every handoff asks for a self-contained final message. Before sending it, the session makes sure that nothing it started is still running.

## Rules slice 001b added

- **Searches.** Implementers search with `git grep`, or exclude `.superpowers/` from any other recursive search. In 001b, a repository-wide search printed lines from untracked planning notes of earlier slices. Since then the coordinator's workspaces live outside the repository (see [Sessions](#sessions)), and a probe session started in `complete/` could neither list nor read them.
- **Containers.** Never run a container as root.
- **Long runs wait inside the turn.** A subagent waits for its own background runs inside its turn. In 001b, the harness stopped two screenshot runs when the subagent that started them ended its turn to wait, and it never woke that subagent again.
- **Probes leave shared demo data alone.** The verifier runs tours in automatic mode only on a scratch database, stops interactive tours after the steps it checks, and restores and reports anything a probe changes. The verifier template carries this rule.
- **Name what was measured.** Every measured value in a package names the screen, field and state it comes from. Every scenario that needs a particular state says where the demo data shows it. In 001b, the lists of two kinds of field differed, and a note that named neither cost a verification round; a scenario whose state no demo data showed went unchecked for two rounds. The analyst template carries this rule.
- **The stop rule.** The verifier classes every new difference it finds.
  - **Rework, in the same release:** a deviation from the spec; a regression; or a difference from the original that a user notices in normal use, because the side-by-side images differ beyond the package's tolerance or the behaviour differs.
  - **Polish:** a difference that only a measurement shows, a quirk of the original that looks unintended, or a state users rarely see. Polish items go to the release checkpoint, where the owner can promote any of them; the rest are done later in one batch.
- **Light rework rounds.** A deviation from the spec goes straight to the orchestrator, without an analyst step. Small fixes of the same kind go to one implementer in one batch, with one task review; a change in behaviour keeps the full review. Run targeted tests while working and the full suites once at the end, and retake only the screenshots whose look changes. In 001b, a light round took 29 minutes, where the first full rework round took over four hours.
- **Chained steps.** The owner starts a round with one detached command. It runs the analyst, the orchestrator, the checks, the overlap gate and the verifier in turn. Each step starts only if the previous one reported plain DONE and its checks passed, and every step is logged. The owner's checkpoints stay.
- **Audit before implementation,** from slice 001c on. A shared computed-style comparison tool measures the same elements on both systems. The analyst checks the package with it before implementation, and the verifier's first round uses it, so that differences surface before the code is written.
- **CI's module step before the merge.** The release command runs CI's module step locally, with every module in `addons/` installed together on a fresh database and CI's test tags, and merges only if it passes. 001a's merge failed CI on that combination, which no earlier run had tested.
- **One record per module.** A module that later slices extend keeps one provenance record, as [provenance/README.md](../provenance/README.md#modules-built-over-several-slices) describes.

## Rules slice 001c added

- **Tests without demo data.** CI installs every module in `addons/` together on a fresh database without demo data. Tests create the records they need, and the orchestrator runs CI's configuration at the final head, besides the slice's own databases with demo data. In 001c, every run used demo data; without it nine tests failed and two raised errors, because they relied on demo records, a demo name or the time zone that the demo data sets. The test-only fix took 1 h 45 min before the release. The orchestrator template carries this rule.
- **What DONE means.** The orchestrator reports DONE when the branch is ready for verification, even with spec questions that the verifier can judge. DONE_WITH_QUESTIONS is for a question that must be answered first, such as a scenario not built, or built on a guess the verifier cannot judge; it stops the chained steps. The orchestrator template carries this rule.
- **The verifier's handoff is ready before the final report.** While the orchestrator finishes, the coordinator writes the verifier's handoff from its template, the first implementation report and the package's Setup, so that the chained steps run on to the verifier. The chain fills in the head commit and copies the final report into the specification repository's analyst area, where it is git-ignored, because the verifier cannot read the coordinator's workspace.
- **Recorded matches stay.** Lines that a module's provenance record already lists as reviewed matches are not reworked in a later slice; only new matches are. In 001c, the twelve recorded `web_enterprise` lines stayed, and the verifier's full-mode check accepted them again.
- **Test-only fixes after verification.** With the owner's approval, a fix that changes only tests and module READMEs after verification goes out without a verifier round. The release command checks that only such paths changed and that the overlap lines equal the verified ones, then merges. In 001c, the fix for tests without demo data went out this way.

## Rules slice 001e added

- **Every scenario in the plan.** The plan has a task for each scenario in `acceptance.md`, including the scenarios that check a correction to an earlier package and need no new code. In 001e, the plan missed three such scenarios. Their tests came after the final review, which never saw them, and cost one more run of the full test set. The orchestrator template carries this rule.
- **Tests measure the element the probe names.** A test of a measured value checks the element that the package's probe names, in a state where a misplaced value shows, such as a scrolled list. Checking only where the content ends up is not enough. In 001e, the phone selection sheet put its 4 px padding on the sheet's body instead of the list that scrolls. The rows sat in the right place and every test passed, but a scrolled long list was cut 4 px short. The desktop list had carried the same misplacement since 001b. The orchestrator template carries this rule.
- **Final runs in a light round.** A light round runs targeted tests while it works, and at its final head the full demo set and CI's configuration, each on a fresh database. The runs with and without each optional module stay with the first pass. Test containers run one at a time: in 001e, a browser unit test failed once while two ran together. The first pass ran five configurations at its final head, in about 2 h of its 5 h; each light round ran two, in about 30 min.
- **Promoting polish items.** At the release checkpoint, the owner promotes a polish item into a round that runs anyway. A round for polish alone runs only for an item that users meet in normal use, such as a long list they scroll. Rarely seen items wait for the next polish batch, because every round looks at new states and can find more of them. In 001e, three verification rounds found one polish item each. The first went into the rework round, the second got a round of its own, and the third, which shows only on the import screen and in the property editor, waits for the next batch.
- **A release that waits for clean lines.** After the owner promotes polish items, one command can run the fixing round, the verification and the release. The release runs only if the verifier's report has three exact lines, each on a line of its own: the status PASS, no new difference of any class, and the overlap unchanged from the round whose values the provenance records quote. Otherwise the chain stops before the release, and the owner decides, with a release-only command ready. In 001e, the third round found a new polish item and one new overlap line. The gate held the release, and the owner released 30 minutes later.
- **Restarting the coordinator.** A restarted coordinator session starts in `complete/` without `<ws>/complete-coord`, which the sandbox then hides. It writes nothing until the owner adds the directory again with `/add-dir`, for that session only, so that the directory stays out of the local settings (see [Sessions](#sessions)).

## Rules slice 002a added

- **One implementer at a time.** Implementers share one checkout. In 002a's first part, two ran at once, and each committed lines of the other's unfinished work, in two mixed commits that later commits completed. The orchestrator dispatches implementers one after another. The orchestrator template carries this rule.
- **Text widths in browser unit tests.** Browser unit tests assert structure, such as heights, paddings, square sizes and truncation. Exact widths that depend on the text belong in the browser probes. In 002a, CI's configuration failed on unit tests whose widths the probes already pinned: the unit-test bundle's fonts differ when every module is installed. It cost one more pair of final runs. The orchestrator template carries this rule.
- **States the harness does not show.** The capture harness hides scrollbars, and the probe list cannot emulate touch. The package states such values in prose, with the state and how to measure them, and the implementer tests them in that state. In 002a, a scroll area that ended under the last row showed only with classic scrollbars, which desktop Chrome draws by default on Linux and Windows. It surfaced in verification round 2. The touch sizes of the control bar and of the range sheet needed touch emulation. The templates carry this rule.
- **Host records move probes.** A new record in a shared host can move the elements that probes find by position. In 002a, four records added for a decision shifted every pill's position number. The original's pill probes then read the wrong pills without a warning, until the verifier renumbered them. The analyst adds host records only when the package needs them, and updates the probes they move; the verifier checks the probes before it measures. The templates carry this rule.
- **Accepted overlap matches.** When the owner accepts new overlap matches at a checkpoint, the next round's gate compares with that round's list, and the provenance records quote the final list. In 002a, round 2 found three new matches, each justified: a one-line test assertion, and two view modes that `acceptance.md` prescribes. The owner accepted them, and round 3 had the same 27 matches on the same lines.

## Rules slice 002b added

- **Spec questions before verification.** At its overlap stop, the orchestrator reports every spec question and ruling. The coordinator sends them to the analyst, who checks each on the original and answers it in the package, with a dated list of what changed. The orchestrator then applies that list with the overlap rework, and the verifier checks it item by item. An answer never reaches the implementer in any other way. In 002b, the implementer raised four questions. The analyst's round took 11 minutes: two answers confirmed what the implementer had built, one changed the confirmation's texts, and one replaced three measured values whose gesture had depended on timing. Verification then passed in its first round. The templates carry this rule.
- **Frozen clocks in unit tests.** A unit test of a delay or a deadline freezes the test clock and advances it itself. After 002a's release, CI failed once on a check made 99 ms into a 100 ms delay, and passed when the job ran again. 002b's first task froze the clock in those tests. The orchestrator template carries this rule.
- **A clean tree before the gates.** The orchestrator's report gives the output of `git status --porcelain`, and the chain stops when the tree is not clean. In 002b, a screenshot run through a container left an untracked directory owned by the container's user, which the session could not remove. The chain stopped before the overlap gate, and the owner's next command removed the directory and ran the remaining steps. The orchestrator template carries this rule.
- **Demo data needs its flag.** Odoo 20 installs demo data only with `--with-demo`. In 002b, the implementers' runs "with demo data" had none until the final run. The orchestrator template carries this rule.
- **What a unit test sees.** A browser unit test finds every element in the page, including those a stylesheet hides. In 002b, a unit test listed two buttons in a dialog where a user sees one, and the difference came back as a spec question. Tours assert what a user sees.
- **Earlier slices still hold.** When a slice extends a module, the verifier reruns the earlier slice's measured-values diff against the same database and classes every row whose verdict changed. In 002b, all 900 values of 002a kept their verdicts. The verifier template carries this rule.
- **Polish into the next slice.** When the next slice works on the same code and starts soon, the verifier's polish items go into its package as notes, and its implementer fixes them as first tasks. A round for polish alone starts an analyst, an orchestrator and a verifier for a few small items. In 002b, five polish items and one note on 002a went into 002b2 this way.
- **Shared memory of the database service.** The database service gets 512 MB of shared memory in `docker/compose.yaml`. With the default of 64 MB, PostgreSQL twice failed to resize a shared memory segment while test databases were being created during 002b, and its server restarted once.
