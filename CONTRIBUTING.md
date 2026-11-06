# Contributing to Complete

Complete is built through a clean-room process. Read the [process](docs/process.md) and the [licensing notes](docs/licensing.md) first; this page is the short version.

## What you may use

- Ideas, features, workflows, and observed behaviour.
- Functional requirements and computations described in prose or mathematics.
- Interoperability interfaces and protocols, and technical names where compatibility requires them.
- Odoo Community code (LGPL-3.0) and OCA code (AGPL-3.0 or LGPL-3.0), with their notices.
- Public standards and official test vectors.

## What you must not use

Odoo Enterprise source in any form and language: code, templates, views, styles, icons, images, fonts, translations, demo data, help texts, messages, and tests, whether copied, modified, or translated. Do not publish Enterprise screenshots, and do not use Odoo logos or branding.

## Attestation

By opening a pull request you confirm that:

- [ ] I had no access to Odoo Enterprise source or a running Enterprise instance while implementing this change.
- [ ] I copied no Enterprise text, code, or assets, and I did not translate or adapt any.
- [ ] Every screenshot in this change shows Complete, not Odoo Enterprise.

## Conventions

- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, and so on).
- **Module names:** `complete_<name>`; manifest version starts with `20.0.`.
- **SPDX header:** every `.py`, `.js`, `.xml`, `.scss`, and `.css` file under `addons/` and `tools/` starts with two comment lines, using the comment style of the language (`#`, `//`, or `<!-- -->`):

  ```text
  Copyright 2026 Complete contributors
  SPDX-License-Identifier: AGPL-3.0-only
  ```

- **Tests:** new behaviour comes with tests, and the full suite passes before review. Python tests live in the module's `tests/` directory; tools have tests under `tools/tests/`.
- **Screenshots:** documentation uses Complete screenshots only, viewport-sized, at 1600x900 (desktop) and 390x844 (mobile), stored under `docs/assets/<area>/`.
- **Links:** run `python -m tools.check_docs_links` to check Markdown links.

## Conduct and security

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
