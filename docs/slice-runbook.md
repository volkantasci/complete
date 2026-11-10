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
