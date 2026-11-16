# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes of slice 002c (dependencies, rescheduling and buffers).

Run only these: ``--test-tags timeline_probes/test_web_gantt:TimelineDependencyProbes``. The dark
scheme needs ``web_enterprise``; without it the dark probes are skipped. The values are in
``timeline_dependency_probe_values``.

Elements read: M47 the name ``.o_tl_panel_name`` of "Unscheduled" in the side panel, M48 its line
``.o_tl_panel_line``.
"""
import time

from odoo import Command
from odoo.tests import tagged

from .test_probes import SCHEMES, VIEWPORTS
from .timeline_dependency_probe_values import MEASURED
from .timeline_probe import TimelineProbeCase

HOST = 'test_web_gantt.host_action_{}'


@tagged('post_install', '-at_install', 'timeline_probes')
class TimelineDependencyProbes(TimelineProbeCase):

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

    @staticmethod
    def panel_line(name):
        return ("[...document.querySelectorAll('.o_tl_panel_line')].find("
                f"(l) => l.querySelector('.o_tl_panel_name').textContent === {name!r})")

    # -- M47, M48: the name and the line in the side panel, at rest (R1) ---------------

    def test_002c_m47_m48_panel_line(self):
        for scheme, viewport in self.combos(['M47', 'M48'], ('desktop',)):
            with self.page(HOST.format('h37'), scheme, viewport):
                self.wait("document.querySelectorAll('.o_tl_panel_line').length === 4")
                self.pointer_away()
                line = self.panel_line('Unscheduled')
                self.check('M47', f"{line}.querySelector('.o_tl_panel_name')", scheme, viewport,
                           'the name of Unscheduled in the side panel')
                self.check('M48', line, scheme, viewport, 'the line of Unscheduled')

    # -- arrows (R4 to R10, R13) ------------------------------------------------------

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

    def pointer_at(self, x, y):
        self.browser._websocket_request('Input.dispatchMouseEvent', params={
            'type': 'mouseMoved', 'x': x, 'y': y,
        })
        self.settle()

    def test_002c_m1_m8_arrows_at_rest(self):
        probes = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8']
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h42'), scheme, viewport):
                self.pointer_away()
                self.check('M1', self.part('Design', 'Build', '.o_tl_arrow_line'), scheme,
                           viewport, 'line Design to Build')
                self.check('M2', self.part('Build', 'Test', '.o_tl_arrow_line'), scheme, viewport,
                           'line Build to Test')
                self.check('M3', self.part('Review', 'Overlap A', '.o_tl_arrow_line'), scheme,
                           viewport, 'line Review to Overlap A')
                self.check('M4', self.part('Design', 'Build', '.o_tl_arrow_halo'), scheme,
                           viewport, 'outline Design to Build')
                self.check('M5', self.part('Build', 'Test', '.o_tl_arrow_band'), scheme, viewport,
                           'band Build to Test')
                self.check('M6', self.part('Build', 'Test', '.o_tl_arrow_head'), scheme, viewport,
                           'head Build to Test')
                self.check('M7', self.arrow('Design', 'Build'), scheme, viewport,
                           'layer Design to Build')
                self.check('M8', self.pill('Build'), scheme, viewport, 'pill Build')

    def test_002c_m9_m14_arrows_highlighted_by_a_pill(self):
        probes = ['M9', 'M10', 'M11', 'M12', 'M13', 'M14']
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h42'), scheme, viewport):
                self.pointer_at(1300, 260)
                self.check('M9', self.part('Design', 'Build', '.o_tl_arrow_line'), scheme,
                           viewport, 'line Design to Build lit')
                self.check('M10', self.part('Build', 'Test', '.o_tl_arrow_line'), scheme,
                           viewport, 'line Build to Test lit')
                self.check('M11', self.part('Design', 'Build', '.o_tl_arrow_halo'), scheme,
                           viewport, 'outline Design to Build lit')
                self.check('M12', self.arrow('Build', 'Test'), scheme, viewport,
                           'layer Build to Test lit')
                self.check('M13', self.part('Build', 'Test', '.o_tl_arrow_remove_ring'), scheme,
                           viewport, 'remove button of Build to Test')
                self.check('M14', self.part('Build', 'Test', '.o_tl_arrow_cross'), scheme,
                           viewport, 'cross of the remove button')

    def test_002c_m20_m21_remove_button_under_the_pointer(self):
        for scheme, viewport in self.combos(['M20', 'M21'], ('desktop',)):
            with self.page(HOST.format('h42'), scheme, viewport):
                self.pointer_at(1300, 260)
                self.pointer_at(1317, 293)
                self.check('M20', self.part('Build', 'Test', '.o_tl_arrow_remove_ring'), scheme,
                           viewport, 'remove button under the pointer')
                self.check('M21', self.part('Build', 'Test', '.o_tl_arrow_cross'), scheme,
                           viewport, 'bar of its cross')

    def test_002c_m33_m35_hidden_arrows(self):
        probes = ['M33', 'M34', 'M35']
        view = self.env.ref('test_web_gantt.host_view_h42').id
        action = self.env.ref('test_web_gantt.host_action_h42').id
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h42'), scheme, viewport):
                # "Show dependencies" off: the choice of the method menu is stored per view+action
                self.js(f"localStorage.setItem('gantt_show_connectors,{view},{action}', 'false')")
                self.js("location.reload()")
                self.wait("document.readyState === 'complete'")
                self.wait("document.querySelectorAll('.o_tl_arrow').length === 3", timeout=60)
                self.settle()
                self.pointer_away()
                self.check('M33', self.arrow('Design', 'Build'), scheme, viewport,
                           'hidden layer Design to Build')
                self.pointer_at(1300, 260)
                self.check('M34', self.arrow('Design', 'Build'), scheme, viewport,
                           'layer Design to Build with the pointer on Build')
                self.check('M35', self.arrow('Review', 'Overlap A'), scheme, viewport,
                           'layer Review to Overlap A, not connected to Build')
                self.js(f"localStorage.removeItem('gantt_show_connectors,{view},{action}')")

    # -- the drawing handles and the drawing (R11, R12) --------------------------------

    @staticmethod
    def handle(name, edge, part=''):
        """A handle of a pill (``edge``: 'start' or 'stop') or one of its parts."""
        return (
            f"(() => {{ const id = ({TimelineProbeCase.pill(name)}).dataset.pillId;"
            " return document.querySelector('.o_tl_connect[data-pill-id=\"' + id + '\"]"
            f" .o_tl_connect_{edge}{part}'); }})()")

    def mouse(self, kind, x, y, **extra):
        self.browser._websocket_request('Input.dispatchMouseEvent', params={
            'type': kind, 'x': x, 'y': y, **extra,
        })

    def test_002c_m15_m19_drawing_handles(self):
        probes = ['M15', 'M16', 'M17', 'M18', 'M19']
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h42'), scheme, viewport):
                self.pointer_at(1300, 260)
                self.check('M15', self.handle('Build', 'stop'), scheme, viewport,
                           'end handle of Build')
                self.check('M16', self.handle('Build', 'stop', ' .o_tl_connect_dot'), scheme,
                           viewport, 'dot of the end handle')
                self.check('M17', self.handle('Build', 'start'), scheme, viewport,
                           'start handle of Build')
                self.check('M18', self.handle('Build', 'stop', ' .o_tl_connect_corner'), scheme,
                           viewport, 'corner line of the end handle')
                self.check('M19', self.handle('Build', 'stop', ' .o_tl_connect_halo'), scheme,
                           viewport, 'halo of the corner line')

    def test_002c_m22_m26_drawing(self):
        probes = ['M22', 'M23', 'M24', 'M25', 'M26']
        overlap, build = self.records['Overlap C'], self.records['Build']
        links = overlap.dependency_field.ids
        for scheme, viewport in self.combos(probes, ('desktop',)):
            try:
                with self.page(HOST.format('h42'), scheme, viewport):
                    self.pointer_at(1300, 260)
                    self.mouse('mouseMoved', 1502, 280)
                    self.mouse('mousePressed', 1502, 280, button='left', buttons=1, clickCount=1)
                    for i in range(1, 9):
                        self.mouse('mouseMoved', 1502 + 50 * i / 8, 280 + 60 * i / 8,
                                   button='left', buttons=1)
                        time.sleep(.03)
                    for i in range(1, 13):
                        self.mouse('mouseMoved', 1552 + (1133 - 1552) * i / 12,
                                   340 + (442 - 340) * i / 12, button='left', buttons=1)
                        time.sleep(.03)
                    self.wait("!!document.querySelector('.o_tl_connect_path')")
                    self.settle()
                    self.check('M22', "document.querySelector('.o_tl_connect_path')", scheme,
                               viewport, 'the line being drawn')
                    self.check('M23', "document.querySelector('.o_content')", scheme, viewport,
                               'the content area while drawing')
                    self.check('M24', self.handle('Overlap C', 'stop'), scheme, viewport,
                               'end handle of Overlap C')
                    self.check('M25', self.handle('Build', 'stop'), scheme, viewport,
                               'end handle of Build')
                    self.mouse('mouseReleased', 1133, 442, button='left', buttons=0, clickCount=1)
                    self.wait("document.querySelectorAll('.o_tl_arrow').length === 4", timeout=60)
                    self.pointer_away()
                    self.check('M26', self.part('Build', 'Overlap C', '.o_tl_arrow_line'), scheme,
                               viewport, 'the new arrow Build to Overlap C')
            finally:
                overlap.invalidate_recordset()
                overlap.write({'dependency_field': [Command.set(links)]})
        self.assertNotIn(build.id, overlap.dependency_field.ids)
