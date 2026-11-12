# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Measured values of the original (spec.md, "Measured values"), probes M1 to M64.

``MEASURED[probe][(scheme, viewport)][property]`` is the expected text.
"""

MEASURED = {
    'M1': {
        ('light', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(199, 199, 199, 1)',
        },
        ('dark', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(239, 182, 182, 1)',
        },
    },
    'M2': {
        ('light', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(245, 129, 129, 1)',
        },
        ('dark', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(255, 146, 146, 1)',
        },
    },
    'M3': {
        ('light', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(234, 182, 133, 1)',
        },
        ('dark', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(255, 195, 141, 1)',
        },
    },
    'M4': {
        ('light', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(241, 214, 119, 1)',
        },
        ('dark', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(237, 208, 102, 1)',
        },
    },
    'M5': {
        ('light', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(154, 191, 235, 1)',
        },
        ('dark', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(158, 202, 255, 1)',
        },
    },
    'M6': {
        ('light', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(197, 161, 188, 1)',
            'background-image': (
                'repeating-linear-gradient(-45deg, rgb(197, 161, 188) 0px, rgb(197, 161, 188) 10px,'
                ' rgb(209, 180, 201) 10px, rgb(209, 180, 201) 20px)'
            ),
        },
        ('dark', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(246, 140, 243, 1)',
            'background-image': (
                'repeating-linear-gradient(-45deg, rgb(246, 140, 243) 0px, rgb(246, 140, 243) 10px,'
                ' rgb(248, 168, 246) 10px, rgb(248, 168, 246) 20px)'
            ),
        },
    },
    'M7': {
        ('light', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(233, 184, 163, 1)',
        },
        ('dark', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(255, 191, 164, 1)',
        },
    },
    'M8': {
        ('light', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(141, 203, 199, 1)',
        },
        ('dark', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(102, 226, 216, 1)',
        },
    },
    'M9': {
        ('light', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(131, 147, 236, 1)',
        },
        ('dark', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(140, 158, 255, 1)',
        },
    },
    'M10': {
        ('light', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(245, 130, 185, 1)',
        },
        ('dark', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(255, 147, 198, 1)',
        },
    },
    'M11': {
        ('light', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(160, 219, 168, 1)',
        },
        ('dark', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(102, 234, 164, 1)',
        },
    },
    'M12': {
        ('light', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(193, 170, 240, 1)',
        },
        ('dark', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'background-color': 'rgba(202, 175, 255, 1)',
        },
    },
    'M13': {
        ('light', 'desktop'): {
            'padding-left': '0',
            'padding-right': '0',
            'padding-top': '0',
            'padding-bottom': '0',
            'border-top-width': '0',
            'border-top-left-radius': '6',
            'border-bottom-right-radius': '6',
            'geometry.height': '23',
            'font-size': '14',
            'font-weight': '400',
            'line-height': '21',
        },
        ('light', 'phone'): {
            'padding-left': '0',
            'padding-right': '0',
            'padding-top': '0',
            'padding-bottom': '0',
            'border-top-width': '0',
            'border-top-left-radius': '6',
            'border-bottom-right-radius': '6',
            'geometry.height': '23',
            'font-size': '14',
            'font-weight': '400',
            'line-height': '21',
        },
        ('dark', 'desktop'): {
            'padding-left': '0',
            'padding-right': '0',
            'padding-top': '0',
            'padding-bottom': '0',
            'border-top-width': '0',
            'border-top-left-radius': '6',
            'border-bottom-right-radius': '6',
            'geometry.height': '23',
            'font-size': '14',
            'font-weight': '400',
            'line-height': '21',
        },
        ('dark', 'phone'): {
            'padding-left': '0',
            'padding-right': '0',
            'padding-top': '0',
            'padding-bottom': '0',
            'border-top-width': '0',
            'border-top-left-radius': '6',
            'border-bottom-right-radius': '6',
            'geometry.height': '23',
            'font-size': '14',
            'font-weight': '400',
            'line-height': '21',
        },
    },
    'M14': {
        ('light', 'desktop'): {
            'margin-left': '4',
            'margin-right': '4',
            'font-size': '14',
            'color': 'rgba(0, 0, 0, 1)',
        },
        ('light', 'phone'): {
            'margin-left': '4',
            'margin-right': '4',
            'font-size': '14',
            'color': 'rgba(0, 0, 0, 1)',
        },
        ('dark', 'desktop'): {
            'margin-left': '4',
            'margin-right': '4',
            'font-size': '14',
            'color': 'rgba(0, 0, 0, 1)',
        },
        ('dark', 'phone'): {
            'margin-left': '4',
            'margin-right': '4',
            'font-size': '14',
            'color': 'rgba(0, 0, 0, 1)',
        },
    },
    'M15': {
        ('light', 'desktop'): {
            'background-color': 'rgba(102, 58, 18, 1)',
            'opacity': '0.2',
            'geometry.width': '430.5',
            'geometry.height': '23',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(167, 80, 0, 1)',
            'opacity': '0.2',
            'geometry.width': '430.5',
            'geometry.height': '23',
        },
    },
    'M16': {
        ('light', 'desktop'): {
            'background-color': 'rgba(239, 68, 68, 1)',
            'width': '20',
            'height': '16',
            'top': '-11',
            'left': '-13',
            'transform': 'matrix(0.707107, 0.707107, -0.707107, 0.707107, 0, 0)',
            'box-shadow': '1 1 0 0 rgba(255, 255, 255, 1)',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(203, 47, 47, 1)',
            'width': '20',
            'height': '16',
            'top': '-11',
            'left': '-13',
            'transform': 'matrix(0.707107, 0.707107, -0.707107, 0.707107, 0, 0)',
            'box-shadow': '1 1 0 0 rgba(255, 255, 255, 1)',
        },
    },
    'M17': {
        ('light', 'desktop'): {
            'background-color': 'rgba(23, 162, 184, 1)',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(113, 173, 234, 1)',
        },
    },
    'M19': {
        ('light', 'desktop'): {
            'background-color': 'rgba(255, 250, 235, 1)',
            'border-left-color': 'rgba(220, 166, 101, 1)',
            'border-top-color': 'rgba(220, 166, 101, 1)',
            'border-right-color': 'rgba(222, 226, 230, 1)',
            'border-bottom-color': 'rgba(222, 226, 230, 1)',
            'border-left-width': '1',
            'border-top-width': '1',
            'color': 'rgba(0, 0, 0, 1)',
            'font-size': '14',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(255, 250, 235, 1)',
            'border-left-color': 'rgba(220, 166, 101, 1)',
            'border-top-color': 'rgba(220, 166, 101, 1)',
            'border-right-color': 'rgba(222, 226, 230, 1)',
            'border-bottom-color': 'rgba(222, 226, 230, 1)',
            'border-left-width': '1',
            'border-top-width': '1',
            'color': 'rgba(0, 0, 0, 1)',
            'font-size': '14',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(227, 156, 80, 0.15)',
            'border-left-color': 'rgba(227, 156, 80, 0.5)',
            'border-top-color': 'rgba(227, 156, 80, 0.5)',
            'border-right-color': 'rgba(62, 63, 71, 1)',
            'border-bottom-color': 'rgba(62, 63, 71, 1)',
            'border-left-width': '1',
            'border-top-width': '1',
            'color': 'rgba(255, 255, 255, 1)',
            'font-size': '14',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(227, 156, 80, 0.15)',
            'border-left-color': 'rgba(227, 156, 80, 0.5)',
            'border-top-color': 'rgba(227, 156, 80, 0.5)',
            'border-right-color': 'rgba(62, 63, 71, 1)',
            'border-bottom-color': 'rgba(62, 63, 71, 1)',
            'border-left-width': '1',
            'border-top-width': '1',
            'color': 'rgba(255, 255, 255, 1)',
            'font-size': '14',
        },
    },
    'M20': {
        ('light', 'desktop'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
            'border-left-color': 'rgba(0, 0, 0, 0)',
            'border-left-width': '1',
            'border-bottom-color': 'rgba(222, 226, 230, 1)',
            'border-bottom-width': '1',
            'color': 'rgba(0, 0, 0, 1)',
            'font-size': '14',
            'font-weight': '400',
            'geometry.height': '25',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
            'border-left-color': 'rgba(0, 0, 0, 0)',
            'border-left-width': '1',
            'border-bottom-color': 'rgba(222, 226, 230, 1)',
            'border-bottom-width': '1',
            'color': 'rgba(0, 0, 0, 1)',
            'font-size': '14',
            'font-weight': '400',
            'geometry.height': '25',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
            'border-left-color': 'rgba(0, 0, 0, 0)',
            'border-left-width': '1',
            'border-bottom-color': 'rgba(62, 63, 71, 1)',
            'border-bottom-width': '1',
            'color': 'rgba(255, 255, 255, 1)',
            'font-size': '14',
            'font-weight': '400',
            'geometry.height': '25',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
            'border-left-color': 'rgba(0, 0, 0, 0)',
            'border-left-width': '1',
            'border-bottom-color': 'rgba(62, 63, 71, 1)',
            'border-bottom-width': '1',
            'color': 'rgba(255, 255, 255, 1)',
            'font-size': '14',
            'font-weight': '400',
            'geometry.height': '25',
        },
    },
    'M21': {
        ('light', 'desktop'): {
            'background-color': 'rgba(255, 255, 255, 1)',
            'color': 'rgba(33, 37, 41, 1)',
            'font-size': '14',
            'padding-left': '8',
            'geometry.height': '25',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(44, 46, 53, 1)',
            'color': 'rgba(235, 235, 235, 1)',
            'font-size': '14',
            'padding-left': '8',
            'geometry.height': '25',
        },
    },
    'M22': {
        ('light', 'desktop'): {
            'background-color': 'rgba(255, 250, 235, 1)',
            'border-left-color': 'rgba(220, 166, 101, 1)',
            'border-left-width': '0',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(255, 250, 235, 1)',
            'border-left-color': 'rgba(220, 166, 101, 1)',
            'border-left-width': '0',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(227, 156, 80, 0.15)',
            'border-left-color': 'rgba(227, 156, 80, 0.5)',
            'border-left-width': '0',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(227, 156, 80, 0.15)',
            'border-left-color': 'rgba(227, 156, 80, 0.5)',
            'border-left-width': '0',
        },
    },
    'M23': {
        ('light', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'border-left-color': 'rgba(222, 226, 230, 1)',
            'border-left-width': '0',
            'border-bottom-color': 'rgba(222, 226, 230, 1)',
            'border-bottom-width': '1',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'border-left-color': 'rgba(222, 226, 230, 1)',
            'border-left-width': '0',
            'border-bottom-color': 'rgba(222, 226, 230, 1)',
            'border-bottom-width': '1',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'border-left-color': 'rgba(62, 63, 71, 1)',
            'border-left-width': '0',
            'border-bottom-color': 'rgba(62, 63, 71, 1)',
            'border-bottom-width': '1',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'border-left-color': 'rgba(62, 63, 71, 1)',
            'border-left-width': '0',
            'border-bottom-color': 'rgba(62, 63, 71, 1)',
            'border-bottom-width': '1',
        },
    },
    'M24': {
        ('light', 'desktop'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
            'color': 'rgba(33, 37, 41, 1)',
            'font-weight': '700',
            'font-size': '14',
            'geometry.width': '267',
            'geometry.height': '50',
            'border-right-color': 'rgba(222, 226, 230, 1)',
            'border-right-width': '1',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
            'color': 'rgba(33, 37, 41, 1)',
            'font-weight': '700',
            'font-size': '14',
            'geometry.width': '130',
            'geometry.height': '50',
            'border-right-color': 'rgba(222, 226, 230, 1)',
            'border-right-width': '1',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
            'color': 'rgba(235, 235, 235, 1)',
            'font-weight': '700',
            'font-size': '14',
            'geometry.width': '267',
            'geometry.height': '50',
            'border-right-color': 'rgba(62, 63, 71, 1)',
            'border-right-width': '1',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
            'color': 'rgba(235, 235, 235, 1)',
            'font-weight': '700',
            'font-size': '14',
            'geometry.width': '130',
            'geometry.height': '50',
            'border-right-color': 'rgba(62, 63, 71, 1)',
            'border-right-width': '1',
        },
    },
    'M25': {
        ('light', 'desktop'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
            'color': 'rgba(0, 0, 0, 1)',
            'font-weight': '400',
            'geometry.width': '267',
            'geometry.height': '40',
            'border-right-color': 'rgba(222, 226, 230, 1)',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
            'color': 'rgba(0, 0, 0, 1)',
            'font-weight': '400',
            'geometry.width': '130',
            'geometry.height': '40',
            'border-right-color': 'rgba(222, 226, 230, 1)',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
            'color': 'rgba(255, 255, 255, 1)',
            'font-weight': '400',
            'geometry.width': '267',
            'geometry.height': '40',
            'border-right-color': 'rgba(62, 63, 71, 1)',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
            'color': 'rgba(255, 255, 255, 1)',
            'font-weight': '400',
            'geometry.width': '130',
            'geometry.height': '40',
            'border-right-color': 'rgba(62, 63, 71, 1)',
        },
    },
    'M26': {
        ('light', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'border-bottom-color': 'rgba(222, 226, 230, 1)',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'border-bottom-color': 'rgba(222, 226, 230, 1)',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'border-bottom-color': 'rgba(62, 63, 71, 1)',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'border-bottom-color': 'rgba(62, 63, 71, 1)',
        },
    },
    'M27': {
        ('light', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(0, 0, 0, 0)',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(0, 0, 0, 0)',
        },
    },
    'M28': {
        ('light', 'desktop'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
            'color': 'rgba(0, 0, 0, 1)',
            'font-weight': '400',
            'font-size': '14',
            'geometry.width': '267',
            'geometry.height': '41',
            'border-bottom-color': 'rgba(222, 226, 230, 1)',
            'border-bottom-width': '1',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
            'color': 'rgba(0, 0, 0, 1)',
            'font-weight': '400',
            'font-size': '14',
            'geometry.width': '130',
            'geometry.height': '41',
            'border-bottom-color': 'rgba(222, 226, 230, 1)',
            'border-bottom-width': '1',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
            'color': 'rgba(255, 255, 255, 1)',
            'font-weight': '400',
            'font-size': '14',
            'geometry.width': '267',
            'geometry.height': '41',
            'border-bottom-color': 'rgba(62, 63, 71, 1)',
            'border-bottom-width': '1',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
            'color': 'rgba(255, 255, 255, 1)',
            'font-weight': '400',
            'font-size': '14',
            'geometry.width': '130',
            'geometry.height': '41',
            'border-bottom-color': 'rgba(62, 63, 71, 1)',
            'border-bottom-width': '1',
        },
    },
    'M29': {
        ('light', 'desktop'): {
            'padding-left': '0',
            'padding-right': '4',
        },
        ('light', 'phone'): {
            'padding-left': '0',
            'padding-right': '4',
        },
        ('dark', 'desktop'): {
            'padding-left': '0',
            'padding-right': '4',
        },
        ('dark', 'phone'): {
            'padding-left': '0',
            'padding-right': '4',
        },
    },
    'M30': {
        ('light', 'desktop'): {
            'geometry.width': '16',
            'geometry.height': '16',
            'border-top-left-radius': '6',
            'margin-right': '0',
        },
        ('light', 'phone'): {
            'geometry.width': '16',
            'geometry.height': '16',
            'border-top-left-radius': '6',
            'margin-right': '0',
        },
        ('dark', 'desktop'): {
            'geometry.width': '16',
            'geometry.height': '16',
            'border-top-left-radius': '6',
            'margin-right': '0',
        },
        ('dark', 'phone'): {
            'geometry.width': '16',
            'geometry.height': '16',
            'border-top-left-radius': '6',
            'margin-right': '0',
        },
    },
    'M31': {
        ('light', 'desktop'): {
            'color': 'rgba(0, 0, 0, 1)',
            'font-size': '14',
            'margin-right': '4',
            'geometry.width': '18',
            'geometry.height': '14',
        },
        ('light', 'phone'): {
            'color': 'rgba(0, 0, 0, 1)',
            'font-size': '14',
            'margin-right': '4',
            'geometry.width': '18',
            'geometry.height': '14',
        },
        ('dark', 'desktop'): {
            'color': 'rgba(255, 255, 255, 1)',
            'font-size': '14',
            'margin-right': '4',
            'geometry.width': '18',
            'geometry.height': '14',
        },
        ('dark', 'phone'): {
            'color': 'rgba(255, 255, 255, 1)',
            'font-size': '14',
            'margin-right': '4',
            'geometry.width': '18',
            'geometry.height': '14',
        },
    },
    'M32': {
        ('light', 'desktop'): {
            'background-color': 'rgba(113, 75, 103, 1)',
            'border-top-color': 'rgba(113, 75, 103, 1)',
            'border-top-width': '0',
            'border-right-width': '0',
            'border-left-width': '0',
            'geometry.height': '2',
            'color': 'rgba(0, 0, 0, 1)',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(113, 75, 103, 1)',
            'border-top-color': 'rgba(113, 75, 103, 1)',
            'border-top-width': '0',
            'border-right-width': '0',
            'border-left-width': '0',
            'geometry.height': '2',
            'color': 'rgba(0, 0, 0, 1)',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(146, 66, 125, 1)',
            'border-top-color': 'rgba(146, 66, 125, 1)',
            'border-top-width': '0',
            'border-right-width': '0',
            'border-left-width': '0',
            'geometry.height': '2',
            'color': 'rgba(0, 0, 0, 1)',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(146, 66, 125, 1)',
            'border-top-color': 'rgba(146, 66, 125, 1)',
            'border-top-width': '0',
            'border-right-width': '0',
            'border-left-width': '0',
            'geometry.height': '2',
            'color': 'rgba(0, 0, 0, 1)',
        },
    },
    'M33': {
        ('light', 'desktop'): {
            'background-color': 'rgba(255, 255, 255, 1)',
            'color': 'rgba(33, 37, 41, 1)',
            'font-size': '14',
            'padding-left': '4',
            'padding-right': '4',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(255, 255, 255, 1)',
            'color': 'rgba(33, 37, 41, 1)',
            'font-size': '14',
            'padding-left': '4',
            'padding-right': '4',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(44, 46, 53, 1)',
            'color': 'rgba(235, 235, 235, 1)',
            'font-size': '14',
            'padding-left': '4',
            'padding-right': '4',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(44, 46, 53, 1)',
            'color': 'rgba(235, 235, 235, 1)',
            'font-size': '14',
            'padding-left': '4',
            'padding-right': '4',
        },
    },
    'M34': {
        ('light', 'desktop'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
            'color': 'rgba(0, 0, 0, 1)',
            'font-weight': '400',
            'geometry.width': '267',
            'geometry.height': '41',
            'border-top-color': 'rgba(0, 0, 0, 1)',
            'border-top-width': '0',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
            'color': 'rgba(0, 0, 0, 1)',
            'font-weight': '400',
            'geometry.width': '130',
            'geometry.height': '41',
            'border-top-color': 'rgba(0, 0, 0, 1)',
            'border-top-width': '0',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
            'color': 'rgba(255, 255, 255, 1)',
            'font-weight': '400',
            'geometry.width': '267',
            'geometry.height': '41',
            'border-top-color': 'rgba(255, 255, 255, 1)',
            'border-top-width': '0',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
            'color': 'rgba(255, 255, 255, 1)',
            'font-weight': '400',
            'geometry.width': '130',
            'geometry.height': '41',
            'border-top-color': 'rgba(255, 255, 255, 1)',
            'border-top-width': '0',
        },
    },
    'M35': {
        ('light', 'desktop'): {
            'background-color': 'rgba(113, 75, 103, 0.5)',
            'color': 'rgba(33, 37, 41, 1)',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(113, 75, 103, 0.5)',
            'color': 'rgba(33, 37, 41, 1)',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(146, 66, 125, 0.5)',
            'color': 'rgba(235, 235, 235, 1)',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(146, 66, 125, 0.5)',
            'color': 'rgba(235, 235, 235, 1)',
        },
    },
    'M36': {
        ('light', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'color': 'rgba(0, 0, 0, 1)',
            'font-size': '9.8',
            'margin-bottom': '4',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'color': 'rgba(0, 0, 0, 1)',
            'font-size': '9.8',
            'margin-bottom': '4',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'color': 'rgba(255, 255, 255, 1)',
            'font-size': '9.8',
            'margin-bottom': '4',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'color': 'rgba(255, 255, 255, 1)',
            'font-size': '9.8',
            'margin-bottom': '4',
        },
    },
    'M37': {
        ('light', 'desktop'): {
            'background-color': 'rgba(234, 182, 133, 1)',
            'color': 'rgba(0, 0, 0, 1)',
            'box-shadow': 'none',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(255, 195, 141, 1)',
            'color': 'rgba(0, 0, 0, 1)',
            'box-shadow': 'none',
        },
    },
    'M38': {
        ('light', 'desktop'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
        },
    },
    'M39': {
        ('light', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
        },
    },
    'M40': {
        ('light', 'desktop'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
            'color': 'rgba(0, 0, 0, 1)',
            'font-weight': '400',
            'geometry.width': '267',
            'geometry.height': '41',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
            'color': 'rgba(0, 0, 0, 1)',
            'font-weight': '400',
            'geometry.width': '130',
            'geometry.height': '41',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
            'color': 'rgba(255, 255, 255, 1)',
            'font-weight': '400',
            'geometry.width': '267',
            'geometry.height': '41',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
            'color': 'rgba(255, 255, 255, 1)',
            'font-weight': '400',
            'geometry.width': '130',
            'geometry.height': '41',
        },
    },
    'M41': {
        ('light', 'desktop'): {
            'background-color': 'rgba(255, 255, 255, 1)',
            'color': 'rgba(33, 37, 41, 1)',
            'border-top-color': 'rgba(206, 212, 218, 1)',
            'border-top-width': '1',
            'padding-left': '10',
            'padding-top': '5',
            'border-top-left-radius': '6',
            'geometry.width': '59.359',
            'geometry.height': '33',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(255, 255, 255, 1)',
            'color': 'rgba(33, 37, 41, 1)',
            'border-top-color': 'rgba(206, 212, 218, 1)',
            'border-top-width': '1',
            'padding-left': '10',
            'padding-top': '5',
            'border-top-left-radius': '6',
            'geometry.width': '59.359',
            'geometry.height': '33',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(44, 46, 53, 1)',
            'color': 'rgba(235, 235, 235, 1)',
            'border-top-color': 'rgba(62, 63, 71, 1)',
            'border-top-width': '1',
            'padding-left': '10',
            'padding-top': '5',
            'border-top-left-radius': '6',
            'geometry.width': '59.359',
            'geometry.height': '33',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(44, 46, 53, 1)',
            'color': 'rgba(235, 235, 235, 1)',
            'border-top-color': 'rgba(62, 63, 71, 1)',
            'border-top-width': '1',
            'padding-left': '10',
            'padding-top': '5',
            'border-top-left-radius': '6',
            'geometry.width': '59.359',
            'geometry.height': '33',
        },
    },
    'M42': {
        ('light', 'desktop'): {
            'padding-left': '16',
            'padding-right': '16',
            'padding-top': '0',
            'padding-bottom': '16',
            'column-gap': '4',
            'background-color': 'rgba(0, 0, 0, 0)',
            'geometry.height': '49',
        },
        ('light', 'phone'): {
            'padding-left': '0',
            'padding-right': '0',
            'padding-top': '4',
            'padding-bottom': '16',
            'column-gap': '4',
            'background-color': 'rgba(0, 0, 0, 0)',
            'geometry.height': '101',
        },
        ('dark', 'desktop'): {
            'padding-left': '16',
            'padding-right': '16',
            'padding-top': '0',
            'padding-bottom': '16',
            'column-gap': '4',
            'background-color': 'rgba(0, 0, 0, 0)',
            'geometry.height': '49',
        },
        ('dark', 'phone'): {
            'padding-left': '0',
            'padding-right': '0',
            'padding-top': '4',
            'padding-bottom': '16',
            'column-gap': '4',
            'background-color': 'rgba(0, 0, 0, 0)',
            'geometry.height': '101',
        },
    },
    'M43': {
        ('light', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'geometry.width': '272',
            'geometry.height': '208.688',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(255, 255, 255, 1)',
            'geometry.width': '388',
            'geometry.height': '698',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'geometry.width': '272',
            'geometry.height': '208.688',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(62, 63, 71, 1)',
            'geometry.width': '388',
            'geometry.height': '698',
        },
    },
    'M44': {
        ('light', 'desktop'): {
            'background-color': 'rgba(233, 236, 239, 1)',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(233, 236, 239, 1)',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(86, 87, 94, 1)',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(86, 87, 94, 1)',
        },
    },
    'M45': {
        ('light', 'desktop'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
            'color': 'rgba(0, 0, 0, 1)',
            'geometry.width': '36',
            'geometry.height': '25',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
            'color': 'rgba(255, 255, 255, 1)',
            'geometry.width': '36',
            'geometry.height': '25',
        },
    },
    'M46': {
        ('light', 'desktop'): {
            'background-color': 'rgba(222, 226, 230, 1)',
            'geometry.width': '36',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(62, 63, 71, 1)',
            'geometry.width': '36',
        },
    },
    'M47': {
        ('light', 'desktop'): {
            'background-color': 'rgba(222, 226, 230, 1)',
            'geometry.width': '249.953',
            'geometry.height': '5',
            'border-top-left-radius': '3',
            'margin-left': '0',
            'margin-right': '8',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(222, 226, 230, 1)',
            'geometry.width': '112.938',
            'geometry.height': '5',
            'border-top-left-radius': '3',
            'margin-left': '0',
            'margin-right': '8',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(86, 87, 94, 1)',
            'geometry.width': '249.953',
            'geometry.height': '5',
            'border-top-left-radius': '3',
            'margin-left': '0',
            'margin-right': '8',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(86, 87, 94, 1)',
            'geometry.width': '112.938',
            'geometry.height': '5',
            'border-top-left-radius': '3',
            'margin-left': '0',
            'margin-right': '8',
        },
    },
    'M48': {
        ('light', 'desktop'): {
            'background-color': 'rgba(0, 169, 69, 0.75)',
            'geometry.width': '60.391',
            'geometry.height': '5',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(0, 169, 69, 0.75)',
            'geometry.width': '27.281',
            'geometry.height': '5',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(34, 176, 83, 0.75)',
            'geometry.width': '60.391',
            'geometry.height': '5',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(34, 176, 83, 0.75)',
            'geometry.width': '27.281',
            'geometry.height': '5',
        },
    },
    'M49': {
        ('light', 'desktop'): {
            'color': 'rgba(73, 80, 87, 0.76)',
            'font-size': '13',
            'padding-left': '4',
            'margin-right': '4',
        },
        ('light', 'phone'): {
            'color': 'rgba(73, 80, 87, 0.76)',
            'font-size': '13',
            'padding-left': '4',
            'margin-right': '4',
        },
        ('dark', 'desktop'): {
            'color': 'rgba(179, 180, 184, 0.76)',
            'font-size': '13',
            'padding-left': '4',
            'margin-right': '4',
        },
        ('dark', 'phone'): {
            'color': 'rgba(179, 180, 184, 0.76)',
            'font-size': '13',
            'padding-left': '4',
            'margin-right': '4',
        },
    },
    'M50': {
        ('light', 'desktop'): {
            'geometry.width': '267',
            'geometry.height': '66',
        },
        ('light', 'phone'): {
            'geometry.width': '130',
            'geometry.height': '66',
        },
        ('dark', 'desktop'): {
            'geometry.width': '267',
            'geometry.height': '66',
        },
        ('dark', 'phone'): {
            'geometry.width': '130',
            'geometry.height': '66',
        },
    },
    'M51': {
        ('light', 'desktop'): {
            'opacity': '0.06',
            'background-color': 'rgba(0, 0, 0, 0)',
        },
        ('light', 'phone'): {
            'opacity': '0.06',
            'background-color': 'rgba(0, 0, 0, 0)',
        },
        ('dark', 'desktop'): {
            'opacity': '0.06',
            'background-color': 'rgba(0, 0, 0, 0)',
        },
        ('dark', 'phone'): {
            'opacity': '0.06',
            'background-color': 'rgba(0, 0, 0, 0)',
        },
    },
    'M52': {
        ('light', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'geometry.y': '182',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'geometry.y': '178',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'geometry.y': '182',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(0, 0, 0, 0)',
            'geometry.y': '178',
        },
    },
    'M53': {
        ('light', 'desktop'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(255, 255, 255, 0.75)',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(44, 46, 53, 0.75)',
        },
    },
    'M54': {
        ('light', 'desktop'): {
            'background-color': 'rgba(252, 250, 243, 1)',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(252, 250, 243, 1)',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(46, 40, 38, 0.576)',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(46, 40, 38, 0.576)',
        },
    },
    'M55': {
        ('light', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
        },
        ('light', 'phone'): {
            'background-color': 'rgba(0, 0, 0, 0)',
        },
        ('dark', 'desktop'): {
            'background-color': 'rgba(0, 0, 0, 0)',
        },
        ('dark', 'phone'): {
            'background-color': 'rgba(0, 0, 0, 0)',
        },
    },
    'M56': {
        ('dark', 'desktop'): {
            'background-image': 'linear-gradient(rgb(31, 31, 35), rgb(19, 19, 21))',
        },
        ('dark', 'phone'): {
            'background-image': 'linear-gradient(rgb(31, 31, 35), rgb(19, 19, 21))',
        },
    },
    'M57': {
        ('dark', 'desktop'): {
            'background-image': 'linear-gradient(rgb(31, 31, 35), rgb(19, 19, 21))',
        },
        ('dark', 'phone'): {
            'background-image': 'linear-gradient(rgb(31, 31, 35), rgb(19, 19, 21))',
        },
    },
    'M58': {
        ('dark', 'desktop'): {
            'background-image': 'linear-gradient(rgb(31, 31, 35), rgb(19, 19, 21))',
        },
        ('dark', 'phone'): {
            'background-image': 'linear-gradient(rgb(31, 31, 35), rgb(19, 19, 21))',
        },
    },
    'M59': {
        ('dark', 'desktop'): {
            'background-image': 'linear-gradient(rgb(19, 19, 21), rgb(31, 31, 35))',
        },
    },
    'M60': {
        ('dark', 'desktop'): {
            'background-image': 'linear-gradient(rgb(19, 19, 21), rgb(31, 31, 35))',
        },
    },
    'M61': {
        ('dark', 'desktop'): {
            'background-image': 'linear-gradient(rgb(19, 19, 21), rgb(31, 31, 35))',
        },
        ('dark', 'phone'): {
            'background-image': 'linear-gradient(rgb(19, 19, 21), rgb(31, 31, 35))',
        },
    },
    'M62': {
        ('dark', 'desktop'): {
            'background-image': 'none',
        },
        ('dark', 'phone'): {
            'background-image': 'none',
        },
    },
    'M63': {
        ('dark', 'desktop'): {
            'background-image': 'linear-gradient(rgb(19, 19, 21), rgb(31, 31, 35))',
        },
        ('dark', 'phone'): {
            'background-image': 'linear-gradient(rgb(19, 19, 21), rgb(31, 31, 35))',
        },
    },
    'M64': {
        ('light', 'desktop'): {
            'color': 'rgba(73, 80, 87, 1)',
        },
        ('dark', 'desktop'): {
            'color': 'rgba(179, 180, 184, 1)',
        },
    },
}
