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
| 8 | Provenance | Orchestrator | Record written; spec status `verified` |
| 9 | Integration | Orchestrator | Pull request merged; full test suite and CI green (the strict provenance check needs the record from step 8) |

The step 6 thresholds were initial values. The pilot kept both; see the [pilot report](pilot-000-timer.md#threshold-calibration).

In step 5, the verifier classes every new difference by the owner's stop rule. Deviations from the spec, regressions and differences from the original that a user notices in normal use go back to step 4. Differences that only a measurement shows, quirks of the original and rarely seen states go on a polish list for the owner's release checkpoint. The [slice runbook](slice-runbook.md#rules-slice-001b-added) gives the details.

How the sessions of a slice are started and handed over in practice is in the [slice runbook](slice-runbook.md).

## Scope and design rules

These owner decisions apply to every slice:

- **No vendor licensing or upselling.** Complete does not rebuild vendor licensing, subscription management, or upsell and promotion features. Where Enterprise shows such an element, Complete shows nothing.
- **Theme colours.** Complete follows its own active theme. Where an Enterprise screen takes a colour from its theme, the spec names the colour role, such as primary or danger, and the Complete module uses that role, not the Enterprise value.
- **Defects of the original.** When the analyst finds behaviour that looks like a defect, the owner decides whether Complete keeps or corrects it. The decision is recorded in the spec package.
- **Large slices are split.** The analyst checks a slice's size before writing. A slice much larger than the pilot is split, and the owner approves the split.

## Spec packages

Spec packages live in a private repository and are what the implementer works from. Each one contains:

| File | Content |
|---|---|
| `meta.yaml` | Slice id and name, scope metadata, dependencies, status (`draft`, `approved`, `implemented`, `verified`), and a package checksum |
| `spec.md` | Scope, roles and access, menus and settings, screens, workflows, business rules, integrations, edge cases in our own words, out of scope, open questions |
| `model.md` | Models and fields, with technical names only where compatibility requires them |
| `acceptance.md` | Given/When/Then scenarios tagged `backend`, `ui`, or `visual` |
| `screens/` | Reference screenshots (desktop 1600x900, mobile 390x844) with numbered callouts |

The verifier's outputs, `review.md` and `verification/`, live in the package directory; capture scenarios stay in the analyst area.

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

[isolation.md](isolation.md) describes the setup, what the guard hook blocks, the audit log, and how to run the isolation check.

An isolation check is the gate before the pilot. The threat model is accidental access, so the check confirms that every layer is loaded: plain attempts to read EE are denied and logged, the shell sandbox is active, the spec templates are readable, and module tests run. A full escape test (every tool, a symlink, a subagent, a child process, web fetching, and a bind mount) is available after larger changes to the layers.

## Version update routine

Run weekly or on demand. CE source (also used to build the Odoo image) and EE source always share one nightly build date.

1. Fetch the new CE source tarball (`https://nightly.odoo.com/20.0/nightly/src/odoo_20.0.<date>.tar.gz`) and compute its sha256.
2. The owner downloads the matching EE source.
3. Record the build date as `ODOO_RELEASE` and the tarball checksum as `ODOO_SOURCE_SHA256` in `docker/versions.env`, and record the EE build checksum in the version file.
4. Rebuild the Odoo image (`make image`, which passes `ODOO_RELEASE` and `ODOO_SOURCE_SHA256` as build args and fails when the checksum differs).
5. Run the full test suite.
6. List the EE modules that changed between builds and flag their spec packages for re-review.
