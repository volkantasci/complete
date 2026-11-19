# Provenance records

Every module under `addons/` has one record, `provenance/<module>.yaml`, written when the module is verified. `python -m tools.check_provenance` fails when a record is missing, lacks a key, or exceeds the overlap thresholds. Dotted keys refer to nested mappings. This file is not a record.

| Key | Meaning |
| --- | --- |
| `module` | Technical module name: `complete_<name>`, or an original name a spec requires for compatibility (see [module-authoring.md](../docs/module-authoring.md#naming)). |
| `slice` | The spec slice this module implements. |
| `spec_sha256` | SHA-256 of the approved spec file the implementer received. |
| `ee_build` | Enterprise build date the spec was derived from (for example `20261106`). |
| `implementer_sessions` | Session identifiers of the implementers; they never saw Enterprise material. |
| `verifier_session` | Session identifier of the independent verifier. |
| `analyst_session` | Optional, recorded from slice 002d2-gantt-hr-rows on. Session identifier of the analyst who wrote the spec package. It is never one of the implementer sessions or the verifier session. |
| `overlap.ratio` | Share of eligible lines that match the reference; must be at most 0.05. |
| `overlap.longest_run` | Longest run of consecutive matching lines; must be below 5. |
| `overlap.reviewed_matches` | Matches a human reviewed and accepted, each with a reason. |
| `audit_log_sha256` | SHA-256 of the implementer's tool-call audit log. |
| `escape_test` | Result of the check that the implementer could not reach Enterprise material. |
| `dates.spec_approved` | Date the spec was approved. |
| `dates.implemented` | Date implementation finished. |
| `dates.verified` | Date verification passed. |
| `approvals` | People who approved the spec and the release. |
| `earlier_slices` | Optional. Records of earlier slices of a module that later slices extended, newest first; see below. |

## Modules built over several slices

A module that later slices extend keeps one record. Its top-level keys describe the latest verified slice, and `overlap` describes the whole module, as that slice's verification measured it. When a later slice is recorded, the earlier slice's record moves into the list `earlier_slices`, newest first. It moves unchanged, without its `module` key. `python -m tools.check_provenance` checks the top-level keys only.

## The `Claude-Session` line under commits

Most commits of this repository end with a `Claude-Session` line. It names the coordinating session: the owner's one interactive session, which starts the analyst, implementer, verifier and provenance sessions of every slice and writes handoffs, documents and tools (see the [slice runbook](../docs/slice-runbook.md#sessions)). Each handoff carries that line, and the session that receives it puts it under its commits. So the line is the same under most commits, and it is not the identifier of the session that made a commit.

The coordinating session writes no module code. Every other session has an identifier of its own, and those are the identifiers a record names in `implementer_sessions`, `verifier_session` and `analyst_session`.
