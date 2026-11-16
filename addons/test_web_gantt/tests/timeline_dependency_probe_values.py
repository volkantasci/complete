# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Measured values of the original for slice 002c (spec.md, "Measured values"): probes M47 and
M48 (the name and the line in the side panel, R1) and M1 to M26, M33 to M35 (arrows, their
highlight, the remove button, the drawing handles and the drawing,
the hidden state); later tasks append the others.

``MEASURED[probe][(scheme, viewport)][property]`` is the expected text.
"""

MEASURED = {
    'M1': {
        ('light', 'desktop'): {
            'stroke': 'rgba(143, 143, 143, 0.5)',
            'stroke-width': '2',
            'fill': 'none',
            'stroke-dasharray': 'none',
            'pointer-events': 'stroke',
            'geometry.x': '904',
            'geometry.y': '260.5',
            'geometry.width': '58',
            'geometry.height': '0',
        },
        ('dark', 'desktop'): {
            'stroke': 'rgba(143, 143, 143, 0.5)',
            'stroke-width': '2',
            'fill': 'none',
            'stroke-dasharray': 'none',
            'pointer-events': 'stroke',
            'geometry.x': '904',
            'geometry.y': '260.5',
            'geometry.width': '58',
            'geometry.height': '0',
        },
    },
    'M2': {
        ('light', 'desktop'): {
            'stroke': 'rgba(236, 151, 31, 0.5)',
            'stroke-width': '2',
            'geometry.x': '1096',
            'geometry.y': '260.5',
            'geometry.width': '442',
            'geometry.height': '66',
        },
        ('dark', 'desktop'): {
            'stroke': 'rgba(236, 151, 31, 0.5)',
            'stroke-width': '2',
            'geometry.x': '1096',
            'geometry.y': '260.5',
            'geometry.width': '442',
            'geometry.height': '66',
        },
    },
    'M3': {
        ('light', 'desktop'): {
            'stroke': 'rgba(211, 65, 59, 0.5)',
            'stroke-width': '2',
            'geometry.x': '520',
            'geometry.y': '285.5',
            'geometry.width': '634',
            'geometry.height': '132',
        },
        ('dark', 'desktop'): {
            'stroke': 'rgba(211, 65, 59, 0.5)',
            'stroke-width': '2',
            'geometry.x': '520',
            'geometry.y': '285.5',
            'geometry.width': '634',
            'geometry.height': '132',
        },
    },
    'M4': {
        ('light', 'desktop'): {
            'stroke': 'rgba(255, 255, 255, 0.5)',
            'stroke-width': '3',
            'pointer-events': 'stroke',
        },
        ('dark', 'desktop'): {
            'stroke': 'rgba(255, 255, 255, 0.5)',
            'stroke-width': '3',
            'pointer-events': 'stroke',
        },
    },
    'M5': {
        ('light', 'desktop'): {
            'stroke': 'none',
            'stroke-width': '13',
            'pointer-events': 'stroke',
        },
        ('dark', 'desktop'): {
            'stroke': 'none',
            'stroke-width': '13',
            'pointer-events': 'stroke',
        },
    },
    'M6': {
        ('light', 'desktop'): {
            'fill': 'rgba(236, 151, 31, 0.5)',
            'stroke': 'rgba(236, 151, 31, 0.5)',
        },
        ('dark', 'desktop'): {
            'fill': 'rgba(236, 151, 31, 0.5)',
            'stroke': 'rgba(236, 151, 31, 0.5)',
        },
    },
    'M7': {
        ('light', 'desktop'): {
            'z-index': '2',
            'pointer-events': 'none',
            'geometry.x': '-1179',
            'geometry.y': '207',
            'geometry.width': '4032',
            'geometry.height': '264',
        },
        ('dark', 'desktop'): {
            'z-index': '2',
            'pointer-events': 'none',
            'geometry.x': '-1179',
            'geometry.y': '207',
            'geometry.width': '4032',
            'geometry.height': '264',
        },
    },
    'M8': {
        ('light', 'desktop'): {
            'z-index': '10',
        },
        ('dark', 'desktop'): {
            'z-index': '10',
        },
    },
    'M9': {
        ('light', 'desktop'): {
            'stroke': 'rgba(143, 143, 143, 1)',
        },
        ('dark', 'desktop'): {
            'stroke': 'rgba(143, 143, 143, 1)',
        },
    },
    'M10': {
        ('light', 'desktop'): {
            'stroke': 'rgba(236, 151, 31, 1)',
        },
        ('dark', 'desktop'): {
            'stroke': 'rgba(236, 151, 31, 1)',
        },
    },
    'M11': {
        ('light', 'desktop'): {
            'stroke': 'rgba(255, 255, 255, 1)',
        },
        ('dark', 'desktop'): {
            'stroke': 'rgba(255, 255, 255, 1)',
        },
    },
    'M12': {
        ('light', 'desktop'): {
            'z-index': '20',
        },
        ('dark', 'desktop'): {
            'z-index': '20',
        },
    },
    'M13': {
        ('light', 'desktop'): {
            'fill': 'rgba(255, 255, 255, 1)',
            'stroke': 'rgba(9, 17, 36, 1)',
            'cursor': 'pointer',
            'geometry.x': '1309.625',
            'geometry.y': '286.125',
            'geometry.width': '14.75',
            'geometry.height': '14.75',
        },
        ('dark', 'desktop'): {
            'fill': 'rgba(44, 46, 53, 1)',
            'stroke': 'rgba(110, 111, 119, 1)',
            'cursor': 'pointer',
            'geometry.x': '1309.625',
            'geometry.y': '286.125',
            'geometry.width': '14.75',
            'geometry.height': '14.75',
        },
    },
    'M14': {
        ('light', 'desktop'): {
            'fill': 'rgba(221, 60, 79, 1)',
        },
        ('dark', 'desktop'): {
            'fill': 'rgba(221, 60, 79, 1)',
        },
    },
    'M20': {
        ('light', 'desktop'): {
            'fill': 'rgba(221, 60, 79, 1)',
            'stroke': 'rgba(9, 17, 36, 1)',
        },
        ('dark', 'desktop'): {
            'fill': 'rgba(221, 60, 79, 1)',
            'stroke': 'rgba(110, 111, 119, 1)',
        },
    },
    'M21': {
        ('light', 'desktop'): {
            'fill': 'rgba(255, 255, 255, 1)',
        },
        ('dark', 'desktop'): {
            'fill': 'rgba(255, 255, 255, 1)',
        },
    },
    'M33': {
        ('light', 'desktop'): {
            'opacity': '0',
            'pointer-events': 'none',
        },
        ('dark', 'desktop'): {
            'opacity': '0',
            'pointer-events': 'none',
        },
    },
    'M34': {
        ('light', 'desktop'): {
            'opacity': '1',
            'pointer-events': 'none',
        },
        ('dark', 'desktop'): {
            'opacity': '1',
            'pointer-events': 'none',
        },
    },
    'M35': {
        ('light', 'desktop'): {
            'opacity': '0',
        },
        ('dark', 'desktop'): {
            'opacity': '0',
        },
    },
    'M15': {
        ('light', 'desktop'): {
            'cursor': 'grab',
            'geometry.x': '1494',
            'geometry.y': '272',
            'geometry.width': '16',
            'geometry.height': '16',
        },
        ('dark', 'desktop'): {
            'cursor': 'grab',
            'geometry.x': '1494',
            'geometry.y': '272',
            'geometry.width': '16',
            'geometry.height': '16',
        },
    },
    'M16': {
        ('light', 'desktop'): {
            'background-color': 'rgba(220, 133, 52, 1)',
            'outline-color': 'rgba(255, 255, 255, 1)',
            'outline-width': '1',
            'outline-style': 'solid',
            'width': '6',
            'height': '6',
            'border-top-left-radius': '50%',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(255, 156, 65, 1)',
            'outline-color': 'rgba(44, 46, 53, 1)',
            'outline-width': '1',
            'outline-style': 'solid',
            'width': '6',
            'height': '6',
            'border-top-left-radius': '50%',
        },
    },
    'M17': {
        ('light', 'desktop'): {
            'cursor': 'grab',
            'geometry.x': '934',
            'geometry.y': '233',
            'geometry.width': '16',
            'geometry.height': '16',
        },
        ('dark', 'desktop'): {
            'cursor': 'grab',
            'geometry.x': '934',
            'geometry.y': '233',
            'geometry.width': '16',
            'geometry.height': '16',
        },
    },
    'M18': {
        ('light', 'desktop'): {
            'border-bottom-width': '1',
            'border-bottom-color': 'rgba(220, 133, 52, 1)',
            'border-bottom-style': 'solid',
            'border-left-width': '1',
            'border-left-color': 'rgba(220, 133, 52, 1)',
            'border-left-style': 'solid',
            'geometry.x': '1494',
            'geometry.y': '273',
            'geometry.width': '8',
            'geometry.height': '8',
        },
        ('dark', 'desktop'): {
            'border-bottom-width': '1',
            'border-bottom-color': 'rgba(255, 156, 65, 1)',
            'border-bottom-style': 'solid',
            'border-left-width': '1',
            'border-left-color': 'rgba(255, 156, 65, 1)',
            'border-left-style': 'solid',
            'geometry.x': '1494',
            'geometry.y': '273',
            'geometry.width': '8',
            'geometry.height': '8',
        },
    },
    'M19': {
        ('light', 'desktop'): {
            'border-bottom-width': '3',
            'border-bottom-color': 'rgba(255, 255, 255, 1)',
            'border-left-width': '3',
            'border-left-color': 'rgba(255, 255, 255, 1)',
            'transform': 'matrix(1, 0, 0, 1, -2, 2)',
        },
        ('dark', 'desktop'): {
            'border-bottom-width': '3',
            'border-bottom-color': 'rgba(44, 46, 53, 1)',
            'border-left-width': '3',
            'border-left-color': 'rgba(44, 46, 53, 1)',
            'transform': 'matrix(1, 0, 0, 1, -2, 2)',
        },
    },
    'M22': {
        ('light', 'desktop'): {
            'stroke': 'rgba(143, 143, 143, 1)',
            'stroke-width': '2',
            'pointer-events': 'none',
        },
        ('dark', 'desktop'): {
            'stroke': 'rgba(143, 143, 143, 1)',
            'stroke-width': '2',
            'pointer-events': 'none',
        },
    },
    'M23': {
        ('light', 'desktop'): {
            'cursor': 'grabbing',
        },
        ('dark', 'desktop'): {
            'cursor': 'grabbing',
        },
    },
    'M24': {
        ('light', 'desktop'): {
            'geometry.x': '1494',
            'geometry.y': '454',
            'geometry.width': '16',
            'geometry.height': '16',
        },
        ('dark', 'desktop'): {
            'geometry.x': '1494',
            'geometry.y': '454',
            'geometry.width': '16',
            'geometry.height': '16',
        },
    },
    'M25': {
        ('light', 'desktop'): {
            'geometry.x': '1494',
            'geometry.y': '272',
            'geometry.width': '16',
            'geometry.height': '16',
        },
        ('dark', 'desktop'): {
            'geometry.x': '1494',
            'geometry.y': '272',
            'geometry.width': '16',
            'geometry.height': '16',
        },
    },
    'M26': {
        ('light', 'desktop'): {
            'stroke': 'rgba(211, 65, 59, 0.5)',
            'geometry.x': '904',
            'geometry.y': '260.5',
            'geometry.width': '634',
            'geometry.height': '182',
        },
        ('dark', 'desktop'): {
            'stroke': 'rgba(211, 65, 59, 0.5)',
            'geometry.x': '904',
            'geometry.y': '260.5',
            'geometry.width': '634',
            'geometry.height': '182',
        },
    },
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
