# Licensing and what may enter Complete

Complete is licensed AGPL-3.0-only (see [LICENSE](../LICENSE)). This page tells contributors what they may and may not use. It describes a project policy and is not legal advice.

## Background

Odoo Enterprise Edition is distributed under the Odoo Enterprise Edition License v1.0 (OEEL-1). Under that license the software may be used only with a valid Odoo Enterprise subscription (or, with a partnership agreement, for testing and development), and publishing, distributing, sublicensing, or selling copies of it or of modified copies is forbidden.

## Forbidden in Complete

Enterprise source in any language (Python, JavaScript, XML/QWeb, SCSS), together with Enterprise templates and views, icons, images, illustrations, fonts, translations, demo data, help texts, messages, and tests, whether copied verbatim, modified, or translated. A modified copy remains a modified copy; there is no safe percentage of change. Odoo logos and branding assets are also not used.

## Allowed

- Ideas, features, workflows, and observed behaviour.
- Functional requirements and computations described in prose or mathematics.
- Interfaces and protocols needed for interoperability, for example IAP request and response shapes.
- Technical names (models, fields, selection keys, routes, configuration parameters) where compatibility requires them.
- Odoo Community code under LGPL-3.0 and OCA code under AGPL-3.0 or LGPL-3.0, with their notices kept.
- Public standards and official test vectors.

## Similarity

Code written independently for the same framework and the same requirements converges in structure: ORM declarations, component skeletons, and names required for compatibility. That is expected. Long verbatim overlap with Enterprise text is not, and the overlap check during verification rejects it (see the [process](process.md)).

Ideas and principles underlying a program, including those underlying its interfaces, are not protected by copyright (Turkish FSEK art. 2; EU Directive 2009/24/EC art. 1(2); CJEU C-406/10 *SAS Institute v World Programming*).

## Analysis requires a license

Running Enterprise for analysis requires a valid Enterprise subscription, or a partnership agreement limited to testing and development. This is a precondition of the analyst and verifier roles, which contributors to this repository do not hold.

## Reporting suspected Enterprise material

If you think a file in this repository contains or closely follows Odoo Enterprise material, report it privately through a GitHub security advisory, as described in [SECURITY.md](../SECURITY.md). Do not open a public issue or pull request, and do not paste the suspected material into the report; name the file and lines.

1. The maintainers remove the affected material from the default branch while the report is reviewed.
2. They re-run the overlap check (`tools/check_provenance.py` thresholds) for the affected module and review the provenance record.
3. The outcome (removed, rewritten, or found unfounded) is recorded in the module's provenance record and in the advisory.

## Legal review

The project owner obtains professional legal review before major public releases. Nothing here replaces that review.
