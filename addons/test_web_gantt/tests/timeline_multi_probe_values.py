# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Measured values of the original for slice 002b3 (spec.md, "Measured values"): probes M1 to M59.

``MEASURED[probe][(scheme, viewport)][property]`` is the expected text. Task 1 holds M56d to M59d
only (the notes on the earlier parts); the other probes are added with their tasks.
"""

MEASURED = {
    'M56d': {
        ('light', 'desktop'): {
            'user-select': 'none',
            'geometry.x': '30.047',
            'geometry.y': '298.5',
            'geometry.width': '231.953',
            'geometry.height': '18',
        },
        ('dark', 'desktop'): {
            'user-select': 'none',
            'geometry.x': '30.047',
            'geometry.y': '298.5',
            'geometry.width': '231.953',
            'geometry.height': '18',
        },
    },
    'M56p': {
        ('light', 'phone'): {
            'user-select': 'none',
            'geometry.x': '30.062',
            'geometry.y': '346.5',
            'geometry.width': '94.938',
            'geometry.height': '18',
        },
        ('dark', 'phone'): {
            'user-select': 'none',
            'geometry.x': '30.062',
            'geometry.y': '346.5',
            'geometry.width': '94.938',
            'geometry.height': '18',
        },
    },
    'M57d': {
        ('light', 'desktop'): {
            'user-select': 'none',
        },
        ('dark', 'desktop'): {
            'user-select': 'none',
        },
    },
    'M58d': {
        ('light', 'desktop'): {
            'user-select': 'none',
            'geometry.x': '0',
            'geometry.y': '288',
            'geometry.width': '267',
            'geometry.height': '40',
        },
        ('dark', 'desktop'): {
            'user-select': 'none',
            'geometry.x': '0',
            'geometry.y': '288',
            'geometry.width': '267',
            'geometry.height': '40',
        },
    },
    'M59d': {
        ('light', 'desktop'): {
            'geometry.x': '0',
            'geometry.y': '328',
            'geometry.width': '267',
            'geometry.height': '41',
        },
        ('dark', 'desktop'): {
            'geometry.x': '0',
            'geometry.y': '328',
            'geometry.width': '267',
            'geometry.height': '41',
        },
    },
}
