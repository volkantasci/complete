# Module authoring guide

How to start and finish a Complete module. Read [licensing.md](licensing.md) for what may enter the project and [process.md](process.md) for the clean-room roles and slice lifecycle. This guide covers the mechanics of the implementer step.

## Start from the scaffold

```
.venv/bin/python -m tools.scaffold complete_<name> --summary "One line" --depends base,mail
make test MODULES=complete_<name>
```

`make test` is for the owner's shell and CI. In a guarded session run the plain podman command from [isolation.md](isolation.md#containers) instead (after `cp docker/.env.example docker/.env` once), for example `podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm odoo odoo -d test_1 -i complete_<name> --test-tags /complete_<name> --stop-after-init`.

The scaffold writes `addons/complete_<name>/` with a manifest, empty `models/`, a `tests/test_install.py` that asserts the module installs, and a README. It refuses a bad name or an existing directory.

## Naming

- Module technical names match `^complete_[a-z0-9_]+$`, for example `complete_timer`.
- Use Odoo technical names for models, fields, selection keys, and routes only where compatibility requires them (see [licensing.md](licensing.md)).

## Manifest

| Key | Value |
|---|---|
| `version` | starts with `20.0.`; new modules use `20.0.1.0.0` |
| `license` | `AGPL-3` (`LGPL-3` only for LGPL-derived modules) |
| `author` | `Complete contributors` |
| `website` | `https://github.com/volkantasci/complete` |
| `installable` | `True` |
| `application` | `False` unless the module is a top-level app |

The manifest is a pure dict literal after the two header lines; no expressions or imports. `tools/check_manifests.py` enforces this.

## SPDX headers

Every `.py`, `.js`, `.xml`, `.scss`, and `.css` file under `addons/` and `tools/` starts with these two lines, using `#`, `//`, or `<!-- -->` as the language requires:

```
# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
```

This includes empty `__init__.py` files and tests. `tools/check_headers.py` enforces it.

## Deriving tests from acceptance scenarios

Work only from the spec package (`acceptance.md`, see [process.md](process.md)). Each Given/When/Then scenario becomes at least one test, and its tag decides the type:

| Tag | Test type |
|---|---|
| `backend` | Python `TransactionCase` in `tests/`, run with `make test MODULES=<module>`, or in a guarded session with the podman command in [isolation.md](isolation.md#containers) |
| `ui` | Browser tour driven by an `HttpCase` test |
| `visual` | Screenshot of the Complete UI compared by the verifier against the reference screenshots (no automated assertion) |

Name each test after its scenario so the verifier can map one to the other. Keep the install test the scaffold generates.

## Screenshots

Take Complete screenshots with a viewport-sized capture (not full page): desktop 1600x900 and mobile 390x844. Save them under `docs/assets/<area>/`, where `<area>` is the application area of the module, and reference them from the module README or user documentation.

## Provenance record

Every module needs a public record at `provenance/<module>.yaml` before its slice is integrated. The orchestrator writes it at the provenance step; the implementer must keep the inputs available: the spec package id, the implementer session id, and the audit log. The required fields are listed in [provenance/README.md](../provenance/README.md). `tools/check_provenance.py` checks the record exists and is complete.

## Before you open a pull request

```
.venv/bin/pytest -q
.venv/bin/pre-commit run --all-files
```

The same hooks run on every `git commit`. They are all local hooks in `.pre-commit-config.yaml`: ruff runs from `.venv` at the version that `requirements-dev.txt` pins, and the checks run from `tools/`. Pre-commit downloads nothing, so the hooks work offline. That matters in a guarded session, because the sandbox lets no hook repository be cloned and keeps no pre-commit cache between commands. The only setup is the owner's, once per machine, from a shell in `complete/`: create `.venv` with `python3 -m venv .venv`, run `.venv/bin/pip install -r requirements-dev.txt`, and then run `.venv/bin/pre-commit install`. Do not bypass a failing hook with `--no-verify`; fix the finding instead.
