# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Measured values of the original for slice 002d's notes on the earlier parts (spec.md,
"Measured values"): probes M27 to M38, M41 to M44 and M47 on 002c's host H42, in the scenarios of
R1 to R3.

``NOTE_PROBES`` is a list of rows ``(probe, scheme, prop, value)``, all at desktop size; the
helper ``measured`` turns the rows of one probe into the ``{scheme: {prop: value}}`` mapping the
probes compare. Later tasks add their probes' tests, not new rows.
"""

NOTE_PROBES = [
    ('M27', 'light', 'stroke', 'rgba(236, 151, 31, 1)'),
    ('M27', 'light', 'geometry.x', '1096'),
    ('M27', 'light', 'geometry.y', '260.5'),
    ('M27', 'light', 'geometry.width', '442'),
    ('M27', 'light', 'geometry.height', '66'),
    ('M27', 'dark', 'stroke', 'rgba(236, 151, 31, 1)'),
    ('M27', 'dark', 'geometry.x', '1096'),
    ('M27', 'dark', 'geometry.y', '260.5'),
    ('M27', 'dark', 'geometry.width', '442'),
    ('M27', 'dark', 'geometry.height', '66'),
    ('M28', 'light', 'geometry.x', '1309.625'),
    ('M28', 'light', 'geometry.y', '286.125'),
    ('M28', 'light', 'geometry.width', '14.75'),
    ('M28', 'light', 'geometry.height', '14.75'),
    ('M28', 'dark', 'geometry.x', '1309.625'),
    ('M28', 'dark', 'geometry.y', '286.125'),
    ('M28', 'dark', 'geometry.width', '14.75'),
    ('M28', 'dark', 'geometry.height', '14.75'),
    ('M29', 'light', 'stroke', 'rgba(143, 143, 143, 0.5)'),
    ('M29', 'dark', 'stroke', 'rgba(143, 143, 143, 0.5)'),
    ('M31', 'light', 'stroke', 'rgba(236, 151, 31, 0.5)'),
    ('M31', 'dark', 'stroke', 'rgba(236, 151, 31, 0.5)'),
    ('M32', 'light', 'geometry.x', '1084'),
    ('M32', 'light', 'geometry.y', '281'),
    ('M32', 'light', 'geometry.width', '274'),
    ('M32', 'light', 'geometry.height', '210.688'),
    ('M32', 'dark', 'geometry.x', '1084'),
    ('M32', 'dark', 'geometry.y', '281'),
    ('M32', 'dark', 'geometry.width', '274'),
    ('M32', 'dark', 'geometry.height', '210.688'),
    ('M33', 'light', 'geometry.x', '1084'),
    ('M33', 'light', 'geometry.y', '281'),
    ('M33', 'light', 'geometry.width', '274'),
    ('M33', 'light', 'geometry.height', '210.688'),
    ('M33', 'dark', 'geometry.x', '1084'),
    ('M33', 'dark', 'geometry.y', '281'),
    ('M33', 'dark', 'geometry.width', '274'),
    ('M33', 'dark', 'geometry.height', '210.688'),
    ('M34', 'light', 'stroke', 'rgba(143, 143, 143, 1)'),
    ('M34', 'dark', 'stroke', 'rgba(143, 143, 143, 1)'),
    ('M35', 'light', 'display', 'block'),
    ('M35', 'light', 'geometry.x', '934'),
    ('M35', 'light', 'geometry.y', '251'),
    ('M35', 'light', 'geometry.width', '576'),
    ('M35', 'light', 'geometry.height', '11'),
    ('M35', 'dark', 'display', 'block'),
    ('M35', 'dark', 'geometry.x', '934'),
    ('M35', 'dark', 'geometry.y', '251'),
    ('M35', 'dark', 'geometry.width', '576'),
    ('M35', 'dark', 'geometry.height', '11'),
    ('M37', 'light', 'stroke', 'rgba(211, 65, 59, 0.5)'),
    ('M37', 'dark', 'stroke', 'rgba(211, 65, 59, 0.5)'),
    ('M41', 'light', 'stroke', 'rgba(143, 143, 143, 1)'),
    ('M41', 'dark', 'stroke', 'rgba(143, 143, 143, 1)'),
    ('M42', 'light', 'stroke', 'rgba(143, 143, 143, 0.5)'),
    ('M42', 'dark', 'stroke', 'rgba(143, 143, 143, 0.5)'),
    ('M43', 'light', 'stroke-width', '13'),
    ('M43', 'light', 'stroke-linecap', 'butt'),
    ('M43', 'light', 'geometry.x', '1096'),
    ('M43', 'light', 'geometry.y', '260.5'),
    ('M43', 'light', 'geometry.width', '442'),
    ('M43', 'light', 'geometry.height', '66'),
    ('M43', 'dark', 'stroke-width', '13'),
    ('M43', 'dark', 'stroke-linecap', 'butt'),
    ('M43', 'dark', 'geometry.x', '1096'),
    ('M43', 'dark', 'geometry.y', '260.5'),
    ('M43', 'dark', 'geometry.width', '442'),
    ('M43', 'dark', 'geometry.height', '66'),
    ('M44', 'light', 'stroke', 'rgba(211, 65, 59, 1)'),
    ('M44', 'dark', 'stroke', 'rgba(211, 65, 59, 1)'),
    ('M47', 'light', 'geometry.x', '1030'),
    ('M47', 'light', 'geometry.y', '274'),
    ('M47', 'light', 'geometry.width', '94'),
    ('M47', 'light', 'geometry.height', '23'),
    ('M47', 'dark', 'geometry.x', '1030'),
    ('M47', 'dark', 'geometry.y', '274'),
    ('M47', 'dark', 'geometry.width', '94'),
    ('M47', 'dark', 'geometry.height', '23'),
]


def measured(probe):
    """``{scheme: {prop: value}}`` of one probe."""
    found = {}
    for name, scheme, prop, value in NOTE_PROBES:
        if name == probe:
            found.setdefault(scheme, {})[prop] = value
    return found
