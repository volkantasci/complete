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

## Starting a session

```sh
tools/run_session.sh WORKDIR HANDOFF STREAM HANDBACK MODEL [claude arguments]
```

- **Memory and limits.** The script turns auto memory off. It lets background subagents run without a time limit, which print mode would otherwise cap at 10 minutes after the last turn.
- **Output.** The stream-json transcript goes to STREAM. When the session ends, the script copies its final message to HANDBACK.
- **Analyst and verifier transcripts** contain EE material. Keep their STREAM in the specification repository's analyst area. Only their final message, written in spec language, reaches the coordinator through the handback.
- **Continuing a session.** To continue a session with its context, pass `--resume <session id>` with a handoff that says what changed. A resumed stream starts with a replayed result event, so wait for the handback file to appear, not for the first result event.
- **Templates.** The orchestrator's handoff template is [handoffs/orchestrator.md](handoffs/orchestrator.md). The analyst's and the verifier's templates live in the specification repository.

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
