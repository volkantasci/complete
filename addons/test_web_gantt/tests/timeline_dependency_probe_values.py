# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Measured values of the original for slice 002c (spec.md, "Measured values"): probes M47 and
M48 (the name and the line in the side panel, R1); later tasks append the others.

``MEASURED[probe][(scheme, viewport)][property]`` is the expected text.
"""

MEASURED = {
    'M47': {
        ('light', 'desktop'): {
            'cursor': 'pointer',
            'geometry.x': '1336.016',
            'geometry.y': '275.484',
            'geometry.width': '85.734',
            'geometry.height': '16',
        },
        ('dark', 'desktop'): {
            'cursor': 'pointer',
            'geometry.x': '1336.016',
            'geometry.y': '275.484',
            'geometry.width': '85.734',
            'geometry.height': '16',
        },
    },
    'M48': {
        ('light', 'desktop'): {
            'cursor': 'grab',
            'geometry.x': '1322',
            'geometry.y': '269.484',
            'geometry.width': '262',
            'geometry.height': '29',
        },
        ('dark', 'desktop'): {
            'cursor': 'grab',
            'geometry.x': '1322',
            'geometry.y': '269.484',
            'geometry.width': '262',
            'geometry.height': '29',
        },
    },
}
