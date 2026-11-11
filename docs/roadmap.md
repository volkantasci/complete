# Roadmap

Phases are delivered slice by slice; a slice is finished (features, bridges, tests, docs, screenshots) before the next one starts. No calendar estimates are given until the pilot has measured real throughput.

| Phase | Content | Note | Status |
|---|---|---|---|
| **0 — Foundation** | Both repositories; policy, process, and module-authoring docs; templates; isolation layers and escape test; tools; Odoo image for build D; EE analysis environment and capture harness; CI; EE inventory and slice list | No module code | Done |
| **Pilot** | One small slice end to end: `timer` (depends only on `web` and `mail`; server logic and a UI widget) | Validates the process, measures throughput, calibrates thresholds; see the [pilot report](pilot-000-timer.md) | Done |
| **Gateway admin UI** | Administration UI for the AI and OCR gateway | Separate repository; runs in parallel with the pilot after its own design approval | Built; deployment pending |
| **1 — Platform** | Enterprise-style web shell (home menu, theme, mobile), Gantt, grid, cohort and map views, spreadsheet edition, worksheet, data cleaning | Foundation for later phases. Done: slice 001a, the web shell: home menu, top bar and colour scheme ([guide](modules/web_shell.md)); slice 001b, the theme: the design system, every restyled component and a full dark scheme ([guide](modules/web_theme.md)); slice 001c, the mobile bridge: the app features and the camera badge scan ([guide](modules/mobile_bridge.md)); slice 001e, a polish batch for the shell, the theme and the mobile bridge | In progress |
| **2 — AI and OCR** | Gateway OLG and OCR extensions; `complete_ai_gateway`; OCR for vendor bills, expenses, and applicants on CE applications; AI core with bridges to CE applications | From here on, each slice includes its AI bridge | Planned |
| **3 — Finance** | Report engine, reconciliation, assets, budgets, payment files, bank imports (with bank-statement OCR), SAF-T and related compliance | | Planned |
| **4 — Services** | Helpdesk, Planning, Field Service, Project Enterprise, Timesheets, Appointments | | Planned |
| **5 — Productivity** | Documents, Knowledge, Sign, meeting rooms | | Planned |
| **6 — Operations** | Quality, PLM, barcode, work orders, MPS, maintenance, inventory | | Planned |
| **7 — People** | Payroll engine with a Türkiye pilot, appraisals, approvals, front desk | | Planned |
| **8 — Growth** | Subscriptions, rental, commissions, marketing automation, social, marketplaces, shipping, Point of Sale | | Planned |
| **9 — Studio** | View, field, and automation editor | | Planned |
| **Continuous** | 351 localisation modules, performance, security | | Planned |

Back to the [README](../README.md) or the [process](process.md).
