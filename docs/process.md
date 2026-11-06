# Clean-room process

Complete is built so that nobody who writes module code has seen Odoo Enterprise (EE) source. This page explains how, for contributors. The licensing background is in [licensing.md](licensing.md); the plan of work is in the [roadmap](roadmap.md).

## Roles

| Role | May access | Must never access | Produces |
|---|---|---|---|
| **Analyst** | EE source and a running EE instance; CE source; public documentation | The `complete` repository (write) | Spec packages (text and EE screenshots) |
| **Implementer** | Spec packages only; CE source; OCA repositories; official documentation | EE source in any form, local or online; analyst-only areas | Module code, tests, Complete screenshots, module docs |
| **Verifier** | Running EE and Complete instances; spec packages; overlap-tool results | Writing module code | Verification reports in spec language; overlap results; approvals |
| **Orchestrator** | Everything the implementer may access | EE source; analyst-only areas | Plans, infrastructure, process docs, coordination |
| **Owner** (human) | Everything | n/a | Decisions, EE downloads, approvals |

- One session never holds two of the analyst, implementer, and verifier roles for the same slice.
- The implementer always starts from a clean context and receives paths to a spec package, never EE content.
- Feedback from the verifier to the implementer is written in spec language: observed behaviour, expected behaviour, screenshot references. It never contains EE code.

## Slice lifecycle

A slice is one EE application, or a coherent group of modules, together with every satellite and bridge whose dependencies already exist in Complete.

| # | Step | Who | Exit criterion |
|---|---|---|---|
| 1 | Select slice | Orchestrator, owner | Dependencies exist in Complete; slice listed in the roadmap |
| 2 | Analysis | Analyst | Spec package complete for the EE build in use |
| 3 | Spec check | `spec_lint` and an analyst-side reviewer | Lint clean; reviewer confirms completeness and cleanliness |
| 4 | Implementation | Implementer, clean context | Code and tests derived from the acceptance scenarios; own styling that matches the screenshots |
| 5 | Verification | Verifier | All scenarios pass on Complete; visual deviations resolved or accepted; otherwise back to step 4 |
| 6 | Overlap check | Verifier with `provenance_check` | Ratio at most 5 % and no run of 5 or more consecutive verbatim lines; every remaining match reviewed and justified |
| 7 | Documentation | Implementer | Module README, user documentation, Complete screenshots under `docs/assets/<area>/` |
| 8 | Integration | Orchestrator | Pull request merged; full test suite and CI green |
| 9 | Provenance | Orchestrator | Record written; spec status `verified` |

The step 6 thresholds are initial values; the pilot calibrates them.

## Spec packages

Spec packages live in a private repository and are what the implementer works from. Each one contains:

| File | Content |
|---|---|
| `meta.yaml` | Slice id and name, scope metadata, dependencies, status (`draft`, `approved`, `implemented`, `verified`), and a package checksum |
| `spec.md` | Scope, roles and access, menus and settings, screens, workflows, business rules, integrations, edge cases in our own words, out of scope, open questions |
| `model.md` | Models and fields, with technical names only where compatibility requires them |
| `acceptance.md` | Given/When/Then scenarios tagged `backend`, `ui`, or `visual` |
| `screens/` | Reference screenshots (desktop 1600x900, mobile 390x844) with numbered callouts |

A lint step rejects code in specs, copied text, and file paths of the reference sources before a package can be approved.

## Provenance records

Each module has a public record at `provenance/<module>.yaml`. It holds the module and slice ids, checksums of the spec package and of the reference build it was written from, implementer and verifier session ids, the overlap result (ratio, longest verbatim run, reviewed matches), a checksum of the implementer audit log, the escape-test evidence id, dates, and approvals. The spec stays private; the record lets anyone confirm that a module came from a specific spec.

## Isolation layers

The implementer workspace enforces the boundary in overlapping layers, because tool permissions alone are not an operating-system boundary.

| Layer | Mechanism | Covers |
|---|---|---|
| **L1 Permissions** | Project permission settings: reads outside the working directory blocked, the EE reference tree denied for read and edit, CE and spec packages added as read-only directories | Read, Grep and Glob (best effort), Edit, Write, NotebookEdit |
| **L2 Hook** | A pre-tool hook that rejects any call referencing the EE reference tree or an analyst-only area, or that starts another agent process, and appends every call to an audit log | Every tool, including shell and subagents |
| **L3 Sandbox** | Shell sandbox (bubblewrap) with the EE reference tree and analyst-only areas unreadable | Shell commands, at OS level |
| **L4 Web** | Fetching limited to an allowlist (official Odoo documentation, CE and OCA repositories, package registries); policy forbids viewing EE code from any source; fetched URLs are audited | Online contamination |
| **L5 OS user** (optional) | Implementer sessions run as a separate Linux user with no read permission on the EE tree | Hard guarantee at OS level |

Container commands run outside the shell sandbox, so they rely on L2 and L5. A domain allowlist cannot tell an OCA repository from a leaked EE copy on the same host, so L4 also relies on policy and the audit log.

An escape test is a gate before the pilot: attempts to read EE through every tool, a symlink, a subagent, a child process, and web fetching must all fail.

## Version update routine

Run weekly or on demand. CE source, the CE package used for the Odoo image, and EE source always share one nightly build date.

1. Fetch the new CE source and package.
2. The owner downloads the matching EE source.
3. Record both builds in the version file with checksums.
4. Rebuild the Odoo image.
5. Run the full test suite.
6. List the EE modules that changed between builds and flag their spec packages for re-review.
