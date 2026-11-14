# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes of slice 002b3 (multi-selection, multi-creation and the side panel).

Run only these: ``--test-tags timeline_probes/test_web_gantt:TimelineMultiProbes``. The dark scheme
needs ``web_enterprise``; without it the dark probes are skipped. The values are in
``timeline_multi_probe_values``.

Elements read (the names of the plan's table): M56d, M56p, M57d, M58d and M59d read the row header
label ``.o_tl_row_label`` or the row header ``.o_tl_row_header``.
"""
import time

from odoo.tests import tagged

from .test_probes import SCHEMES, VIEWPORTS
from .timeline_multi_probe_values import MEASURED
from .timeline_probe import TimelineProbeCase

HOST = 'test_web_gantt.host_action_{}'

# the header of the row with that title; the nth one when several rows share the title
HEADERS = "[...document.querySelectorAll('.o_tl_row_header')].filter(" \
          "(h) => h.getAttribute('title') === {title!r})"
ALPHA_HEADER = HEADERS.format(title='Alpha') + '[0]'
ALPHA_LABEL = ALPHA_HEADER + ".querySelector('.o_tl_row_label')"
BETA_CONTACT_LABEL = HEADERS.format(title='Host Contact 2') + \
    ".at(-1).querySelector('.o_tl_row_label')"
# the header of the first record row under Alpha: the row after the group row
FIRST_UNDER_ALPHA = ALPHA_HEADER + ".closest('.o_tl_row').nextElementSibling" \
                                   ".querySelector('.o_tl_row_header')"


@tagged('post_install', '-at_install', 'timeline_probes')
class TimelineMultiProbes(TimelineProbeCase):

    # -- helpers --------------------------------------------------------------------

    def combos(self, probes, viewports=VIEWPORTS):
        found = []
        for scheme in SCHEMES:
            for viewport in viewports:
                if not any((scheme, viewport) in MEASURED[p] for p in probes):
                    continue
                if scheme == 'dark' and not self.has_theme:
                    continue
                found.append((scheme, viewport))
        if not found:
            self.skipTest('the dark scheme needs web_enterprise, which is not installed')
        return found

    def check(self, probe, element_js, scheme, viewport, label):
        expected = MEASURED[probe].get((scheme, viewport))
        if expected is not None:
            self.probe(probe, element_js, scheme, viewport, expected, label)

    def mouse(self, kind, x, y, **extra):
        self.browser._websocket_request('Input.dispatchMouseEvent', params={
            'type': kind, 'x': x, 'y': y, **extra,
        })

    def header_gesture(self, x0, x1):
        """Press on the Alpha header at x0, move to x1 in eight steps on the same line, release."""
        box = self.geometry(ALPHA_HEADER)
        y = box['geometry.y'] + box['geometry.height'] / 2
        self.mouse('mouseMoved', x0, y)
        self.mouse('mousePressed', x0, y, button='left', buttons=1, clickCount=1)
        for i in range(1, 9):
            self.mouse('mouseMoved', x0 + (x1 - x0) * i / 8, y, button='left', buttons=1)
            time.sleep(.03)
        self.mouse('mouseReleased', x1, y, button='left', buttons=0, clickCount=1)
        self.settle(500)

    def alpha_closed(self):
        return self.js(f"{ALPHA_HEADER}.closest('.o_tl_row').classList.contains('o_tl_collapsed')")

    # -- M56d, M57d, M58d, M59d: the gesture on a group row header, desktop (R1) -------------

    def test_002b3_m56d_m59d_no_selection_desktop(self):
        probes = ['M56d', 'M57d', 'M58d', 'M59d']
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h3'), scheme, viewport):
                self.header_gesture(60, 200)
                self.assertTrue(self.alpha_closed(), f'{scheme}: the gesture closed Alpha')
                self.assertEqual(self.js('window.getSelection().toString()'), '')
                self.check('M56d', ALPHA_LABEL, scheme, viewport, 'label of the Alpha header')
                self.check('M57d', BETA_CONTACT_LABEL, scheme, viewport,
                           'label of Beta / Host Contact 2')
                self.check('M58d', ALPHA_HEADER, scheme, viewport, 'Alpha header, closed')
                self.header_gesture(60, 200)
                self.assertFalse(self.alpha_closed(), f'{scheme}: the second gesture opened Alpha')
                self.assertEqual(self.js('window.getSelection().toString()'), '')
                self.check('M59d', FIRST_UNDER_ALPHA, scheme, viewport,
                           'first record row header under Alpha, shown again')

    # -- M56p: the same gesture on the phone, with the mouse (R1) ----------------------------

    def test_002b3_m56p_no_selection_phone(self):
        for scheme, viewport in self.combos(['M56p'], ('phone',)):
            with self.page(HOST.format('h3'), scheme, viewport, touch=False):
                self.header_gesture(20, 110)
                self.assertTrue(self.alpha_closed(), f'{scheme}: the gesture closed Alpha')
                self.assertEqual(self.js('window.getSelection().toString()'), '')
                self.check('M56p', ALPHA_LABEL, scheme, viewport, 'label of the Alpha header')
