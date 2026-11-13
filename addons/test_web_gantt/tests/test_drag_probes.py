# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes of slice 002b2 (drag and resize): the measured values M53 and following.

Run only these: ``--test-tags timeline_probes/test_web_gantt:TimelineDragProbes``. The dark scheme
needs ``web_enterprise``; without it the dark probes are skipped. A probe that says "touch phone"
runs with touch emulation, the others on the phone are measured without touch.
"""
import logging
import time

from odoo.tests import tagged

from .test_probes import SCHEMES, VIEWPORTS
from .timeline_drag_probe_values import MEASURED as DRAG_VALUES
from .timeline_probe import TimelineProbeCase

_logger = logging.getLogger(__name__ + '.diag')

HOST = 'test_web_gantt.host_action_{}'
SELECTION = "document.querySelector('.o_tl_selection')"
START_BADGE = "document.querySelector('.o_tl_badge_start')"
STOP_BADGE = "document.querySelector('.o_tl_badge_stop')"


@tagged('post_install', '-at_install', 'timeline_probes')
class TimelineDragProbes(TimelineProbeCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env['test.web.gantt.pill']._tl_rtl_user()

    # -- helpers --------------------------------------------------------------------

    def combos(self, probes, viewports=VIEWPORTS):
        found = []
        for scheme in SCHEMES:
            for viewport in viewports:
                if not any((scheme, viewport) in DRAG_VALUES[p] for p in probes):
                    continue
                if scheme == 'dark' and not self.has_theme:
                    continue
                found.append((scheme, viewport))
        if not found:
            self.skipTest('the dark scheme needs web_enterprise, which is not installed')
        return found

    def check(self, probe, element_js, scheme, viewport, label):
        expected = DRAG_VALUES[probe].get((scheme, viewport))
        if expected is not None:
            self.probe(probe, element_js, scheme, viewport, expected, label)

    def check_badge(self, probe, element_js, scheme, viewport, label, edge):
        """A badge of Arabic text: its width is the width of the digits and letters in the
        font the machine holds for Arabic, so the width is not compared. What is compared is
        everything else, with the edge that sits at the highlight (``right`` for the start badge
        of a right-to-left selection, ``left`` for the stop badge) at the measured place."""
        expected = DRAG_VALUES[probe].get((scheme, viewport))
        if expected is None:
            return
        rest = {k: v for k, v in expected.items() if k != 'geometry.width'}
        if edge == 'right':
            rest.pop('geometry.x', None)
        self.probe(probe, element_js, scheme, viewport, rest, label)
        if edge == 'right':
            box = self.geometry(element_js)
            right = box['geometry.x'] + box['geometry.width']
            want = float(expected['geometry.x']) + float(expected['geometry.width'])
            self.assertAlmostEqual(right, want, delta=0.5,
                                   msg=f'{probe} {scheme}/{viewport} right edge of {label}')

    def mouse(self, kind, x, y, **extra):
        self.browser._websocket_request('Input.dispatchMouseEvent', params={
            'type': kind, 'x': x, 'y': y, **extra,
        })

    def touch_event(self, kind, points):
        self.browser._websocket_request('Input.dispatchTouchEvent', params={
            'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': 1} for x, y in points],
        })

    def bottom_of_first_row(self):
        box = self.geometry("document.querySelector('.o_tl_row')")
        return box['geometry.y'] + box['geometry.height'] - 12

    # -- M53 to M58: the badges of a right-to-left selection (R19) ---------------------

    def test_002b2_m53_m55_m57_rtl_selection_mouse(self):
        probes = ['M53', 'M55', 'M57']
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h1'), scheme, viewport, login='rtl'):
                y = self.bottom_of_first_row()
                x0, x1 = 1330, 1030
                self.mouse('mouseMoved', x0, y)
                self.mouse('mousePressed', x0, y, button='left', buttons=1, clickCount=1)
                for i in range(1, 9):
                    self.mouse('mouseMoved', x0 + (x1 - x0) * i / 8, y, button='left', buttons=1)
                    time.sleep(.03)
                self.wait(f"!!{SELECTION}")
                self.settle()
                _logger.info('RTL-BADGES|%s', self.js(
                    "[...document.querySelectorAll('.o_tl_selection_badge')]"
                    ".map((b) => b.textContent).join(' // ')"))
                self.check('M53', SELECTION, scheme, viewport, 'selection highlight (rtl)')
                self.check_badge('M55', START_BADGE, scheme, viewport, 'start badge (rtl)', 'right')
                self.check_badge('M57', STOP_BADGE, scheme, viewport, 'stop badge (rtl)', 'left')
                self.mouse('mouseReleased', x1, y, button='left', buttons=0, clickCount=1)
                self.settle(500)

    def test_002b2_m54_m56_m58_rtl_selection_touch_phone(self):
        probes = ['M54', 'M56', 'M58']
        for scheme, viewport in self.combos(probes, ('phone',)):
            with self.page(HOST.format('h1'), scheme, viewport, login='rtl', touch=True):
                y = self.bottom_of_first_row()
                x0, x1 = 230, 160
                self.touch_event('touchStart', [(x0, y)])
                time.sleep(.8)
                for i in range(1, 5):
                    self.touch_event('touchMove', [(x0 + (x1 - x0) * i / 4, y)])
                    time.sleep(.03)
                self.wait(f"!!{SELECTION}")
                self.settle()
                self.check('M54', SELECTION, scheme, viewport, 'selection highlight (rtl phone)')
                self.check_badge('M56', START_BADGE, scheme, viewport, 'start badge (rtl phone)',
                                 'right')
                self.check_badge('M58', STOP_BADGE, scheme, viewport, 'stop badge (rtl phone)',
                                 'left')
                self.touch_event('touchEnd', [])
                self.settle(500)
