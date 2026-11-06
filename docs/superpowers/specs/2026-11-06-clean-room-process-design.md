# Complete — Clean-Room Process and Restart Design

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Status** | Draft — awaiting owner review |
| **Owner** | Volkan TASCI |
| **Scope** | How Complete is organised, isolated, specified, implemented, verified, and released; the restart roadmap |

> This document describes a project policy and process. It is not legal advice. The owner obtains professional legal review before major public releases.

## 1. Context

Complete aims to make Odoo Community Edition (CE) a functional and visual equivalent of Odoo Enterprise Edition (EE) using only free-software modules (AGPL-3.0).

An earlier prototype was discarded on 2026-11-06 because it was not produced through a clean-room process. Nothing from it is reused: no code, documents, screenshots, or history. The project restarts from this document.

### 1.1 Goals

1. **Parity:** each Complete module reproduces the behaviour and the look of its EE counterpart on CE.
2. **Clean provenance:** no EE source, assets, or proprietary text ever enters Complete, and every module carries evidence of independent creation.
3. **Latest Odoo:** Complete always targets the latest Odoo release line (currently 20.0) at a single recorded nightly build.
4. **Completeness per slice:** a slice is finished (features, bridges, tests, docs, screenshots) before the next one starts.
5. **AI and OCR without Odoo credits:** AI and document-extraction features talk to the owner's `odoo-ai-gateway` through Odoo's existing IAP protocol.

### 1.2 Non-goals

- Copying, translating, or mechanically transforming EE code, templates, styles, assets, data, or texts.
- Supporting Odoo versions older than the current release line.
- Publishing EE screenshots or any other EE material.

## 2. Legal basis (summary)

The EE license (Odoo Enterprise Edition License v1.0, "OEEL-1") states, among other terms:

> This software and associated files (the "Software") can only be used (executed, modified, executed after modifications) with a valid Odoo Enterprise Subscription for the correct number of users.
>
> With a valid Partnership Agreement with Odoo S.A., the above permissions are also granted, as long as the usage is limited to a testing or development environment.
>
> It is forbidden to publish, distribute, sublicense, or sell copies of the Software or modified copies of the Software.

Consequences for Complete:

- **Forbidden in Complete:** EE source in any language (Python, JavaScript, XML/QWeb, SCSS), EE templates and views, icons, images, illustrations, fonts, translations, demo data, help texts, messages, and tests, whether copied verbatim, modified, or translated. A modified copy remains a modified copy; there is no "safe percentage" of change.
- **Allowed:** ideas, features, workflows, and observed behaviour; functional requirements and computations described in prose or mathematics; interfaces and protocols needed for interoperability (for example IAP request and response shapes); technical names (models, fields, selection keys, routes, configuration parameters) where compatibility requires them; Odoo CE code under LGPL-3.0 and OCA code under AGPL-3.0 or LGPL-3.0, with their notices; public standards and official test vectors.
- **Similarity:** code written independently for the same framework and requirements converges in structure (ORM declarations, component skeletons, names required for compatibility). That is expected. Long verbatim overlap with EE text is not, and the tooling in section 8 rejects it.
- Ideas and principles underlying a program, including those underlying its interfaces, are not protected by copyright (Turkish FSEK art. 2; EU Directive 2009/24/EC art. 1(2); CJEU C-406/10 *SAS Institute v World Programming*).
- Running EE for analysis requires a valid EE subscription, or a partnership agreement limited to testing and development. This is a precondition of the analyst and verifier roles.

## 3. Roles

| Role | May access | Must never access | Produces |
|---|---|---|---|
| **Analyst** | EE source and a running EE instance; CE source; public documentation | The `complete` repository (write) | Spec packages (text and EE screenshots) |
| **Implementer** | Spec packages (`complete-specs/slices/` only); CE source; OCA repositories; official documentation | EE source in any form, local or online; analyst-only areas | Module code, tests, Complete screenshots, module docs |
| **Verifier** | Running EE and Complete instances; spec packages; overlap-tool results | Writing module code | Verification reports in spec language; overlap results; approvals |
| **Orchestrator** | Everything the implementer may access | EE source; analyst-only areas | Plans, infrastructure, process docs, coordination |
| **Owner** (human) | Everything | — | Decisions, EE downloads, approvals |

Rules:

- One session never holds two of the analyst, implementer, and verifier roles for the same slice.
- The implementer always starts from a clean context: a fresh session or subagent that receives paths to a spec package, never EE content.
- The orchestrator runs inside the `complete/` workspace under the same isolation as the implementer.
- The session that drafted this document read EE material during the initial analysis. It writes infrastructure and documentation only, never module code, and slice work starts from a fresh orchestrator session.
- Feedback from the verifier to the implementer is written in spec language: observed behaviour, expected behaviour, screenshot references. It never contains EE code.

## 4. Workspace layout

Paths are relative to the owner's workspace root `<ws>` (here `~/Projects/dev/VOSLO`); `<ws-abs>` is the same root as an absolute path, as permission rules require.

```text
<ws>/
├── odoo-reference/            # outside every repository; never committed
│   ├── VERSIONS.txt           # builds in use, with SHA-256
│   ├── community/             # CE source of build D (LGPL-3.0)
│   └── enterprise/            # EE source of build D (OEEL-1): analyst and verifier only
├── complete-specs/            # PRIVATE repository
│   ├── slices/<NNN>-<name>/   # spec packages: the only part the implementer can read
│   ├── templates/             # spec and screen-note templates
│   ├── env/                   # EE analysis environment and Playwright capture scripts
│   ├── tools/                 # tools that need EE: spec_lint, provenance_check, ee_inventory
│   ├── analysis/              # analyst scratch and raw captures (never shared)
│   ├── evidence/              # escape tests, overlap reports, audit-log digests
│   └── .claude/               # analyst settings
└── complete/                  # PUBLIC repository (AGPL-3.0-only)
    ├── addons/complete_*/     # modules, each with tests and README
    ├── docs/                  # vision, policies, process, roadmap, module docs, Complete screenshots
    ├── provenance/            # one record per module (section 6.2)
    ├── tools/                 # checks that do not need EE: scaffold, lint, headers, links
    ├── docker/                # Odoo image recipe and compose stack
    ├── .claude/               # implementer settings and hooks (section 5)
    └── .github/               # CI
```

## 5. Isolation controls

The implementer workspace (`complete/`) enforces the boundary in layers. Claude Code permissions are not an operating-system boundary, so the layers deliberately overlap.

| Layer | Mechanism | Covers |
|---|---|---|
| **L1 Permissions** | `complete/.claude/settings.json`: `permissions.blockReadsOutsideWorkingDirectories: true`; deny `Read(//<ws-abs>/odoo-reference/enterprise/**)` and `Edit(//<ws-abs>/odoo-reference/enterprise/**)`; `<ws>/odoo-reference/community` and `<ws>/complete-specs/slices` added as additional directories with `Edit` denied on both | Read, Grep and Glob (best effort), Edit, Write, NotebookEdit |
| **L2 Hook** | `PreToolUse` hook with matcher `*`: rejects any tool call whose input references the EE reference tree or an analyst-only area, or that starts another Claude Code process; appends every tool call (tool, input summary, agent id and type, time) to an audit log | Every tool, including Bash and subagents |
| **L3 Sandbox** | Claude Code Bash sandbox (bubblewrap) with the EE reference tree and analyst-only areas in `filesystem.denyRead` | Shell commands, at OS level |
| **L4 Web** | WebFetch and WebSearch limited to an allowlist (official Odoo documentation, CE and OCA repositories, package registries); policy forbids viewing EE code from any source; fetched URLs are audited | Online contamination |
| **L5 OS user** (optional) | Implementer sessions run as a separate Linux user with no read permission on `odoo-reference/enterprise` | Hard guarantee at OS level |

A domain allowlist cannot tell an OCA repository from a leaked EE copy on the same host, so L4 also relies on policy and the audit log.

The analyst workspace (`complete-specs/`) adds both reference trees as additional directories, denies `Edit(//<ws-abs>/complete/**)`, and runs `spec_lint` as a pre-commit check.

**Escape test (gate before the pilot).** In a throwaway implementer session, attempts to read EE through Read, Grep, Glob, Bash (`cat`, `grep`, `find`, `tar`), a symlink inside `complete/`, a subagent, a `claude -p` child process, and WebFetch must all fail. The result is stored in `complete-specs/evidence/`. Any failure blocks the pilot until it is fixed.

Documented behaviour still to be confirmed on the owner's machine during Phase 0: permission deny rules apply inside subagents, and `sandbox.filesystem.denyRead` accepts absolute paths in the `//` form. The machine meets the prerequisites (Claude Code 2.1.318, bubblewrap 0.13.1, socat).

## 6. Artifacts

### 6.1 Spec package

Location: `complete-specs/slices/<NNN>-<name>/`. Language: English.

| File | Content |
|---|---|
| `meta.yaml` | Slice id and name; EE modules covered; EE build and SHA-256; dependencies (CE modules, earlier slices); analyst session id; dates; status (`draft` → `approved` → `implemented` → `verified`); SHA-256 of the package |
| `spec.md` | Scope and boundaries; roles and access rules; menus, actions, filters, settings; screens (purpose, fields, buttons, states, visibility rules, screenshot references); workflows and state-transition tables; business rules and computations in prose or formulas; integrations, scheduled jobs, emails, reports; edge cases and error messages in our own words; out of scope; open questions |
| `model.md` | Models and fields: technical name (only where compatibility requires it), type, relation, required, default behaviour, computation logic in prose, access rules |
| `acceptance.md` | Given/When/Then scenarios, each tagged `backend` (Python test), `ui` (browser tour), or `visual` (screenshot comparison) |
| `screens/` | EE screenshots captured with Playwright on a demo database: desktop 1600×900 and mobile 390×844, each screen in its relevant states (empty, filled, error, open popover…); short videos for interactions such as drag and drop; `index.md` with numbered callouts per image (layout, alignment, spacing, colours as hex, typography, icon meaning) |

Rules, enforced by `spec_lint` before a package can be approved:

- No code: no Python, JavaScript, XML/QWeb, SCSS, or code-like lines. Diagrams only as tables or Mermaid.
- No copied text: help texts, tooltips, and messages are rewritten in our own words. Short UI labels such as field, menu, and button names may match EE, because parity requires them. Any string of 40 or more characters that matches EE source or translation files verbatim is rejected.
- Technical names appear only in `model.md`, each with a compatibility reason.
- EE file paths never appear.

Example of the expected style (illustrative, not taken from EE):

> **Screen S2 — Task form, timer area** (`screens/02-task-form-running.png`, callouts 1–2)
> 1. Pill-shaped button at the left of the status bar: "Start" when idle; turns into "Stop" with a live mm:ss counter while running.
> 2. The counter ticks every second and survives a page reload (timer state is stored on the server).
>
> **Rule R4:** A user runs at most one timer at a time. Starting a new timer pauses the running one.
>
> **Scenario A7 (`backend`):** Given a running timer on task T1, when the user starts a timer on task T2, then T1's timer is paused and T2's timer is running.

### 6.2 Provenance record

Location: `complete/provenance/<module>.yaml`, one per module, public.

Fields: module; slice id; SHA-256 of the spec package and the EE build it was written from; implementer session ids; verifier session id; overlap result (ratio, longest verbatim run, reviewed matches); SHA-256 of the implementer audit log; escape-test evidence id; dates; approvals.

Spec packages stay private. The record lets anyone confirm that a module was produced from a specific spec without disclosing the spec.

### 6.3 Verification report

Location: `complete-specs/slices/<NNN>-<name>/review.md`.

For each scenario: result on EE, result on Complete, side-by-side screenshots, deviations in spec language, and a decision (pass or rework).

## 7. Slice lifecycle and definition of done

A **slice** is one EE application, or a coherent group of modules, together with every satellite and bridge whose dependencies already exist in Complete. Bridges to applications that do not exist yet are delivered with those applications.

| # | Step | Who | Exit criterion |
|---|---|---|---|
| 1 | Select slice | Orchestrator, owner | Dependencies exist in Complete; slice listed in the roadmap |
| 2 | Analysis | Analyst | Spec package complete for EE build D |
| 3 | Spec check | `spec_lint` and a reviewer on the analyst side | Lint clean; reviewer confirms completeness and cleanliness |
| 4 | Implementation | Implementer, clean context | Code and tests derived from `acceptance.md`; own styling that matches the screenshots |
| 5 | Verification | Verifier | All scenarios pass on Complete; visual deviations resolved or accepted; otherwise back to step 4 |
| 6 | Overlap check | Verifier with `provenance_check` | Ratio at most 5 % and no run of 5 or more consecutive verbatim lines; every remaining match reviewed and justified |
| 7 | Documentation | Implementer | Module README, user documentation, Complete screenshots under `docs/assets/<area>/` |
| 8 | Integration | Orchestrator | Pull request merged; full test suite and CI green |
| 9 | Provenance | Orchestrator | Record written; spec status `verified` |

The thresholds in step 6 are initial values; the pilot calibrates them.

## 8. Tooling

| Tool | Location | Purpose |
|---|---|---|
| `provenance_check.py` | complete-specs | Normalises lines of 30 or more characters, ignores lines that also occur in CE, and reports the share of Complete lines that match EE-only lines verbatim plus the longest consecutive run. Output lists Complete file and line only, never EE content. |
| `spec_lint.py` | complete-specs | Enforces the rules of section 6.1, including verbatim-string detection against EE sources and translations. |
| `ee_inventory.py` | complete-specs | Lists EE-only modules, applications, dependencies, and sizes for slice planning (facts only). |
| Capture harness | complete-specs/env | Runs EE build D with demo data; Playwright scripts capture screens, states, and interaction videos. The verifier reuses the scenarios against Complete to produce side-by-side images. |
| Module scaffold | complete | Creates a module skeleton with SPDX headers, an AGPL-3 manifest, and the test layout. |
| Repository checks | complete | Lint (ruff, eslint), manifest and license-header checks, docs link check. |
| Optional analyst aids | complete-specs | Runtime analysis tools such as REA may help the analyst. Their raw captures contain EE code and stay in `analysis/`. |

## 9. Versions

- **Single build date D:** CE source, the CE package used for the Odoo image, and EE source always share one nightly date, recorded in `odoo-reference/VERSIONS.txt`. Currently D = 20261106; CE and EE sources are in place.
- **Odoo image:** built from the official Odoo image recipe with `ODOO_RELEASE` set to D, because the Docker Hub `odoo:20.0` image lags behind the nightlies. The CE package for 20261106 is not published yet (latest is 20261105); the image is built once it appears.
- **Database:** PostgreSQL 17 with pgvector. Odoo 20 requires PostgreSQL 16 or later; pgvector is needed for AI retrieval.
- **Update routine** (weekly or on demand): fetch the new CE source and package; the owner downloads the matching EE source; record both in `VERSIONS.txt`; rebuild the image; run the full suite; list the EE modules that changed between builds and flag their spec packages for re-review.

## 10. Repositories and conventions

- `complete`: public GitHub repository, AGPL-3.0-only, SPDX header in every source file. One branch and one pull request per slice, merged after verification and green CI.
- `complete-specs`: private GitHub repository.
- Conventional Commits. Module namespace `complete_*`. EE technical names (models, fields, routes) are reused only where compatibility needs them, and each one is listed in the spec's `model.md`.
- Trademark: "Odoo" is used descriptively only; no Odoo logos or branding assets.

## 11. AI and OCR through `odoo-ai-gateway`

- Odoo modules keep Odoo's IAP request and response protocol. The gateway maps it to any provider and model (OpenAI-compatible APIs, DeepSeek, OpenRouter, Datalab OCR, local models). Odoo needs no IAP credits.
- Odoo reaches the gateway through system parameters: `ai.endpoint`, `iap_extract_endpoint`, `html_editor.olg_api_endpoint`, `website.olg_api_endpoint`.
- **Gateway admin UI** (separate design cycle): server-rendered UI (FastAPI, Jinja2, HTMX) on a separate admin port; one administrator; reachable only through an SSH tunnel or VPN; runtime configuration store (SQLite, API keys encrypted at rest and write-only in the UI); changes apply without restart; the existing environment and secret-file configuration keeps working.
- **Gateway protocol extensions:** OLG endpoints (`/api/olg/1/chat`, `/api/olg/1/generate_placeholder`) used by the CE editor and website builder; OCR document types `bank_statement`, `expense`, `applicant`, and `loan` (`/api/extract/<type>/2/{parse,get_result,validate}`); persistent OCR job storage.
- **Complete side:** `complete_ai_gateway`, an original module with one gateway URL setting that writes the parameters above, a health check, and no credit-purchase prompts. EE AI and OCR features are specified and implemented through the normal slice lifecycle.

## 12. Roadmap

| Phase | Content | Note |
|---|---|---|
| **0 — Foundation** | Both repositories; policy, process, and module-authoring docs; templates; isolation layers and escape test; tools; Odoo image for build D; EE analysis environment and capture harness; CI; EE inventory and slice list | No module code |
| **Pilot** | One small slice end to end: `timer` (depends only on `web` and `mail`; server logic and a UI widget) | Validates the process, measures throughput, calibrates thresholds |
| **Gateway admin UI** | As described in section 11 | Separate repository; runs in parallel with the pilot after its own design approval |
| **1 — Platform** | Enterprise-style web shell (home menu, theme, mobile), Gantt, grid, cohort and map views, spreadsheet edition, worksheet, data cleaning | Foundation for later phases |
| **2 — AI and OCR** | Gateway OLG and OCR extensions; `complete_ai_gateway`; OCR for vendor bills, expenses, and applicants on CE applications; AI core with bridges to CE applications | From here on, each slice includes its AI bridge |
| **3 — Finance** | Report engine, reconciliation, assets, budgets, payment files, bank imports (with bank-statement OCR), SAF-T and related compliance | |
| **4 — Services** | Helpdesk, Planning, Field Service, Project Enterprise, Timesheets, Appointments | |
| **5 — Productivity** | Documents, Knowledge, Sign, meeting rooms | |
| **6 — Operations** | Quality, PLM, barcode, work orders, MPS, maintenance, inventory | |
| **7 — People** | Payroll engine with a Türkiye pilot, appraisals, approvals, front desk | |
| **8 — Growth** | Subscriptions, rental, commissions, marketing automation, social, marketplaces, shipping, Point of Sale | |
| **9 — Studio** | View, field, and automation editor | |
| **Continuous** | 351 localisation modules, performance, security | |

Scale at EE build 20261106: 1,602 EE modules against 701 in CE; 901 EE-only modules, of which 351 are localisations, 22 are test modules, and 528 are functional modules spread over 46 EE-only applications.

No calendar estimates are given until the pilot has measured real throughput.

## 13. Risks

| Risk | Mitigation |
|---|---|
| EE material reaches the implementer context | Layered isolation (section 5), escape test, audit log, clean-context rule |
| EE text leaks through a spec | `spec_lint`, spec review, verbatim-string detection |
| EE code found online (leaks, forks) | Web allowlist, policy, audit log of fetched URLs |
| EE screenshots made public | Screenshots live only in the private specs repository |
| Lower throughput than porting | Pilot measurement, OCA bases where suitable, parallel slices |
| Version drift between CE, EE, and the image | Single build date D and the update routine |
| Legal uncertainty | Conservative policy; professional legal review before major public releases |
| Trademark confusion | Descriptive use only; no Odoo branding assets |

## 14. Open points for the implementation plan

1. Confirm on the owner's machine that permission deny rules apply inside subagents and that `sandbox.filesystem.denyRead` accepts the absolute path form.
2. Decide where audit logs are stored and for how long (proposal: outside both repositories, hashed into provenance records).
3. Calibrate the overlap thresholds after the pilot.
4. Decide after the pilot whether to adopt the separate-OS-user hardening (L5).

## 15. Decision log

| Date | Decision |
|---|---|
| 2026-11-06 | Restart Complete from scratch with a clean-room process; nothing from the earlier prototype is reused. |
| 2026-11-06 | The analyst captures and shares EE screenshots so the implementer can reproduce the visual result. |
| 2026-11-06 | Complete always targets the latest Odoo release line at a single recorded build date. |
| 2026-11-06 | AI and OCR go through `odoo-ai-gateway`; the gateway admin UI is reachable only by the owner through an SSH tunnel or VPN. |
| 2026-11-06 | The owner approved the working model, the repository and tooling layout, the spec package template, and the roadmap. |
