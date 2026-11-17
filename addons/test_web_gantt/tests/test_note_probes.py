# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes of slice 002d's notes on the earlier parts (M27 to M38), on 002c's host H42.

Run only these: ``--test-tags /test_web_gantt:TestNoteProbes``. The dark scheme needs
``web_enterprise``; without it the dark probes are skipped. The values are in
``timeline_note_probe_values`` (``NOTE_PROBES``); later tasks add the tests of their probes.

Elements read: M27 the line ``.o_tl_arrow_line`` of "Build" to "Test", M28 its remove button's
circle ``.o_tl_arrow_remove_ring``, M29 the line of "Design" to "Build", M30 the wrapper of the
drawing handles of "Build" (Complete draws the wrapper only while its handles are shown: no wrapper
is the original's wrapper with ``display: none``, ruling T1-2), M31 the line after the next move.
"""
import logging
import time

from odoo.tests import tagged

from .timeline_note_probe_values import measured
from .timeline_probe import TimelineProbeCase

HOST = 'test_web_gantt.host_action_h42'
SCHEMES = ('light', 'dark')
_logger = logging.getLogger(__name__)


@tagged('post_install', '-at_install')
class TestNoteProbes(TimelineProbeCase):

    # -- helpers --------------------------------------------------------------------------------

    def schemes(self, probes):
        found = [scheme for scheme in SCHEMES
                 if any(scheme in measured(probe) for probe in probes)
                 and (scheme == 'light' or self.has_theme)]
        if not found:
            self.skipTest('the dark scheme needs web_enterprise, which is not installed')
        return found

    @staticmethod
    def arrow(source, target):
        """The layer (``svg.o_tl_arrow``) of the arrow between two pills."""
        return (
            f"(() => {{ const source = ({TimelineProbeCase.pill(source)}).dataset.pillId;"
            f" const target = ({TimelineProbeCase.pill(target)}).dataset.pillId;"
            " return [...document.querySelectorAll('.o_tl_arrow')].find((a) =>"
            " a.dataset.arrow.includes('|' + source + '>')"
            " && a.dataset.arrow.endsWith('|' + target)); })()")

    def part(self, source, target, selector):
        return f"{self.arrow(source, target)}.querySelector({selector!r})"

    def mouse(self, kind, x, y, **extra):
        self.browser._websocket_request('Input.dispatchMouseEvent', params={
            'type': kind, 'x': x, 'y': y, **extra,
        })

    def pointer_at(self, x, y):
        self.mouse('mouseMoved', x, y)
        self.settle()

    def check(self, probe, element_js, scheme, label):
        expected = measured(probe).get(scheme)
        self.assertTrue(expected, f'no value of {probe} in {scheme}')
        self.probe(probe, element_js, scheme, 'desktop', expected, label)

    def draw_to(self, end):
        """A27's path: the pointer on Build, to its end handle in 4 steps, a press, to (1552, 340)
        in 8 steps, then to `end` in 12 steps; the button is released at `end`."""
        self.pointer_at(1300, 260)
        for i in range(1, 5):
            self.mouse('mouseMoved', 1300 + 202 * i / 4, 260 + 20 * i / 4)
            time.sleep(.03)
        self.mouse('mousePressed', 1502, 280, button='left', buttons=1, clickCount=1)
        for i in range(1, 9):
            self.mouse('mouseMoved', 1502 + 50 * i / 8, 280 + 60 * i / 8, button='left', buttons=1)
            time.sleep(.03)
        for i in range(1, 13):
            self.mouse('mouseMoved', 1552 + (end[0] - 1552) * i / 12,
                       340 + (end[1] - 340) * i / 12, button='left', buttons=1)
            time.sleep(.03)
        self.wait("!!document.querySelector('.o_tl_connect_path')")
        self.mouse('mouseReleased', end[0], end[1], button='left', buttons=0, clickCount=1)
        self.settle(400)

    # -- M27 to M31: a drawing released on an empty cell (R1 point 1, A1) -----------------------

    def test_m27_m31_released_on_empty_cell(self):
        probes = ['M27', 'M28', 'M29', 'M30', 'M31']
        build = self.records['Build']
        for scheme in self.schemes(probes):
            with self.page(HOST, scheme, 'desktop'):
                self.wait("document.querySelectorAll('.o_tl_arrow').length === 3", timeout=60)
                self.settle()
                self.draw_to((1300, 225))
                self.check('M27', self.part('Build', 'Test', '.o_tl_arrow_line'), scheme,
                           'Build to Test, lit at the release')
                self.check('M28', self.part('Build', 'Test', '.o_tl_arrow_remove_ring'), scheme,
                           'the remove button of Build to Test')
                self.check('M29', self.part('Design', 'Build', '.o_tl_arrow_line'), scheme,
                           'Design to Build at rest')
                # T1-2: no handle is shown; Complete draws no wrapper then
                wrapper = self.js(
                    "document.querySelectorAll('.o_tl_connect[data-pill-id=\"' + "
                    f"({self.pill('Build')}).dataset.pillId + '\"]').length")
                self.assertEqual(wrapper, 0, 'no handles of Build are drawn')
                self.assertEqual(measured('M30')[scheme]['display'], 'none')
                self.pointer_at(1301, 225)
                self.check('M31', self.part('Build', 'Test', '.o_tl_arrow_line'), scheme,
                           'Build to Test, back at rest after the next move')
        self.assertTrue(build.exists())
