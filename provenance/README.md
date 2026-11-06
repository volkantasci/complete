# Provenance records

Every module under `addons/` has one record, `provenance/<module>.yaml`, written when the module is verified. `python -m tools.check_provenance` fails when a record is missing, lacks a key, or exceeds the overlap thresholds. Dotted keys refer to nested mappings. This file is not a record.

| Key | Meaning |
| --- | --- |
| `module` | Technical module name, `complete_<name>`. |
| `slice` | The spec slice this module implements. |
| `spec_sha256` | SHA-256 of the approved spec file the implementer received. |
| `ee_build` | Enterprise build date the spec was derived from (for example `20261106`). |
| `implementer_sessions` | Session identifiers of the implementers; they never saw Enterprise material. |
| `verifier_session` | Session identifier of the independent verifier. |
| `overlap.ratio` | Share of eligible lines that match the reference; must be at most 0.05. |
| `overlap.longest_run` | Longest run of consecutive matching lines; must be below 5. |
| `overlap.reviewed_matches` | Matches a human reviewed and accepted, each with a reason. |
| `audit_log_sha256` | SHA-256 of the implementer's tool-call audit log. |
| `escape_test` | Result of the check that the implementer could not reach Enterprise material. |
| `dates.spec_approved` | Date the spec was approved. |
| `dates.implemented` | Date implementation finished. |
| `dates.verified` | Date verification passed. |
| `approvals` | People who approved the spec and the release. |
