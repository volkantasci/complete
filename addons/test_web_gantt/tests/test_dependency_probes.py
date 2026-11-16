# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes of slice 002c (dependencies, rescheduling and buffers).

Run only these: ``--test-tags timeline_probes/test_web_gantt:TimelineDependencyProbes``. The dark
scheme needs ``web_enterprise``; without it the dark probes are skipped. The values are in
``timeline_dependency_probe_values``.

Elements read: M47 the name ``.o_tl_panel_name`` of "Unscheduled" in the side panel, M48 its line
``.o_tl_panel_line``.
"""
import logging
import time

from odoo import Command
from odoo.tests import tagged

from .test_probes import SCHEMES, VIEWPORTS
from .timeline_dependency_probe_values import MEASURED
from .timeline_probe import TimelineProbeCase

HOST = 'test_web_gantt.host_action_{}'
_logger = logging.getLogger(__name__)


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

    # M4 and M11 read the original's empty outline element; Complete draws no outline (decision
    # D5, checked by the Hoot test "002c A92" and the screens); the values stay verbatim in the
    # values file and are not compared, as with M49 below.
    ORIGINAL_ONLY = ('M4', 'M11')

    # Readings not compared, by ruling; the values stay verbatim in the values file.
    SKIPPED_READINGS = {
        # T19-2, package P1 (M49 place): the overflow reading belongs to the original only; the
        # package accepts Complete's `clip` (`hidden` would make the header a scroll container and
        # the label would stop following the grid scroll, 002b D-5) and does not compare it
        # T19-3: 1 px from 002b3's scroll focus placement, an earlier part's rule
        'M49': ('overflow', 'geometry.x'),
    }

    def check(self, probe, element_js, scheme, viewport, label):
        if probe in self.ORIGINAL_ONLY:
            _logger.warning('PROBE-SKIPPED|%s|%s|%s|all|original only, decision D5', probe,
                            scheme, viewport)
            return
        expected = MEASURED[probe].get((scheme, viewport))
        skipped = self.SKIPPED_READINGS.get(probe, ())
        if expected is not None and skipped:
            for prop in skipped:
                if prop in expected:
                    _logger.warning('PROBE-SKIPPED|%s|%s|%s|%s|by ruling', probe, scheme,
                                    viewport, prop)
            expected = {p: v for p, v in expected.items() if p not in skipped}
        if expected:
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

    # -- M49, M50: the week group headers of H46, a week of another year (R27) ----------

    @staticmethod
    def week_header(text):
        return ("[...document.querySelectorAll('.o_tl_col_group')].find("
                f"(g) => g.textContent.trim() === {text!r})")

    def test_002c_m49_m50_week_header_in_another_year(self):
        for scheme, viewport in self.combos(['M49', 'M50'], ('desktop',)):
            with self.rescheduling_page(scheme, viewport):
                self.pointer_away()
                self.check('M49', self.week_header('Week 24, Jun 9 - Jun 15 2030'), scheme,
                           viewport, 'the week header of 9 June 2030')
                self.check('M50', self.week_header('Week 23, Jun 2 - Jun 8 2030'), scheme,
                           viewport, 'the week header before it')
            self.env['test.web.gantt.pill']._tl_drop_reschedule_records()

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
                self.check('M4', self.arrow('Design', 'Build'), scheme, viewport,
                           'outline of an arrow at rest')
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
                self.check('M11', self.arrow('Build', 'Test'), scheme, viewport,
                           'outline of a lit arrow')
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

    def test_002c_m52_m53_strips(self):
        """M52, M53: the strips above and below "Build", the pointer on its right part."""
        for scheme, viewport in self.combos(['M52', 'M53'], ('desktop',)):
            with self.page(HOST.format('h42'), scheme, viewport):
                self.pointer_at(1300, 260)
                self.wait("document.querySelectorAll('.o_tl_connect_strip').length === 2")
                self.check('M52', "document.querySelector('.o_tl_connect_strip_above')", scheme,
                           viewport, 'the strip above Build')
                self.check('M53', "document.querySelector('.o_tl_connect_strip_below')", scheme,
                           viewport, 'the strip below Build')

    def test_002c_m22_m26_drawing(self):
        probes = ['M22', 'M23', 'M24', 'M25', 'M26']
        overlap, build = self.records['Overlap C'], self.records['Build']
        links = overlap.dependency_field.ids
        for scheme, viewport in self.combos(probes, ('desktop',)):
            try:
                with self.page(HOST.format('h42'), scheme, viewport):
                    self.pointer_at(1300, 260)
                    # A27's path: to the handle in 4 steps, through the strip below the pill
                    for i in range(1, 5):
                        self.mouse('mouseMoved', 1300 + 202 * i / 4, 260 + 20 * i / 4)
                        time.sleep(.03)
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

    # -- the method button and its menu (R14) -------------------------------------------------

    def test_002c_m27_m32_method_menu(self):
        probes = ['M27', 'M28', 'M29', 'M30', 'M31', 'M32']
        button = "document.querySelector('.o_tl_reschedule_button')"
        menu = "document.querySelector('.o_tl_reschedule_menu')"
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h42'), scheme, viewport):
                self.wait("document.querySelectorAll('.o_tl_arrow').length === 3", timeout=60)
                self.settle()
                self.pointer_away()
                self.check('M27', button, scheme, viewport, 'the method button at rest')
                self.click_js(button)
                self.wait(f"{menu} !== null")
                self.settle()
                self.pointer_away()
                self.check('M28', button, scheme, viewport, 'the method button, menu open')
                self.check('M29', menu, scheme, viewport, 'the menu')
                self.check('M30', "document.querySelector('.o_tl_reschedule_maintainBuffer')",
                           scheme, viewport, 'the chosen method')
                self.check('M31', f"{menu}.querySelector('.dropdown-divider')", scheme, viewport,
                           'the separator')
                self.check('M32', "document.querySelector('.o_tl_reschedule_consumeBuffer')",
                           scheme, viewport, 'a method not chosen')

    # -- the notification of a rescheduling (R21) ---------------------------------------------

    def drag_pill(self, start, end, steps=12):
        """Press at `start`, move to `end` in `steps` moves, release; then wait for the notice."""
        self.mouse('mouseMoved', start[0], start[1], button='none', buttons=0)
        self.mouse('mousePressed', start[0], start[1], button='left', buttons=1, clickCount=1)
        for i in range(1, steps + 1):
            self.mouse('mouseMoved', start[0] + (end[0] - start[0]) * i / steps,
                       start[1] + (end[1] - start[1]) * i / steps, button='left', buttons=1)
            time.sleep(.03)
        self.mouse('mouseReleased', end[0], end[1], button='left', buttons=0, clickCount=1)
        self.wait("!!document.querySelector('.o_notification')", timeout=60)
        self.settle(700)

    def rescheduling_page(self, scheme, viewport):
        """H46 with the prepared records; the phone is measured without touch."""
        self.env['test.web.gantt.pill']._tl_build_reschedule_records()
        self.addCleanup(self.env['test.web.gantt.pill']._tl_drop_reschedule_records)
        return self.page(HOST.format('h46'), scheme, viewport,
                         touch=False if viewport == 'phone' else None)

    def test_002c_m42_m44_notification(self):
        notice = "document.querySelector('.o_notification')"
        for scheme, viewport in self.combos(['M42', 'M43', 'M44'], ('desktop',)):
            with self.rescheduling_page(scheme, viewport):
                self.pointer_away()
                self.drag_pill((446, 219), (638, 219))
                self.check('M42', notice, scheme, viewport, 'the notification')
                self.check('M43', f"{notice}.querySelector('.o_notification_bar')", scheme,
                           viewport, 'the coloured bar of the notification')
                self.check('M44', f"{notice}.querySelector('.o_notification_buttons button')",
                           scheme, viewport, 'the Undo button')
            self.env['test.web.gantt.pill']._tl_drop_reschedule_records()

    def test_002c_m45_notification_phone(self):
        for scheme, viewport in self.combos(['M45'], ('phone',)):
            with self.rescheduling_page(scheme, viewport):
                self.pointer_away()
                self.drag_pill((230, 267), (326, 267))
                self.check('M45', "document.querySelector('.o_notification')", scheme, viewport,
                           'the notification on the phone')
            self.env['test.web.gantt.pill']._tl_drop_reschedule_records()

    def test_002c_m46_warning_bar(self):
        for scheme, viewport in self.combos(['M46'], ('desktop',)):
            with self.rescheduling_page(scheme, viewport):
                self.pointer_away()
                self.drag_pill((1214, 219), (1310, 219))
                self.check('M46', "document.querySelector('.o_notification .o_notification_bar')",
                           scheme, viewport, 'the bar of the warning')
            self.env['test.web.gantt.pill']._tl_drop_reschedule_records()

    # -- the buffer bands (R22) -----------------------------------------------------------------

    @staticmethod
    def buffer_place(name):
        """The place box of the band of a pill."""
        return (
            f"(() => {{ const id = ({TimelineProbeCase.pill(name)}).dataset.pillId;"
            " return document.querySelector("
            "'.o_tl_buffer_place[data-pill-id=\"' + id + '\"]'); })()")

    def test_002c_m36_m38_buffer_bands(self):
        for scheme, viewport in self.combos(['M36', 'M37', 'M38'], ('desktop',)):
            with self.page(HOST.format('h44'), scheme, viewport):
                self.pointer_away()
                band = '.o_tl_buffer_band'
                self.check('M36', f"{self.buffer_place('Review')}.querySelector('{band}')", scheme,
                           viewport, 'the band of Review')
                self.check('M37', f"{self.buffer_place('Design')}.querySelector('{band}')", scheme,
                           viewport, 'the band of Design')
                self.check('M38', self.buffer_place('Review'), scheme, viewport,
                           'the place of the band of Review')

    def test_002c_m39_buffer_band_phone(self):
        for scheme, viewport in self.combos(['M39'], ('phone',)):
            # the phone is measured without touch, as for M45
            with self.page(HOST.format('h44'), scheme, viewport, touch=False):
                self.pointer_away()
                band = f"{self.buffer_place('Review')}.querySelector('.o_tl_buffer_band')"
                self.check('M39', band, scheme, viewport, 'the band of Review on the phone')

    def test_002c_m40_band_hidden_while_moved(self):
        for scheme, viewport in self.combos(['M40'], ('desktop',)):
            with self.page(HOST.format('h44'), scheme, viewport):
                self.pointer_away()
                self.mouse('mouseMoved', 1069, 285, button='none', buttons=0)
                self.mouse('mousePressed', 1069, 285, button='left', buttons=1, clickCount=1)
                for i in range(1, 13):
                    self.mouse('mouseMoved', 1069 + (1261 - 1069) * i / 12,
                               285 + (326 - 285) * i / 12, button='left', buttons=1)
                    time.sleep(.03)
                self.wait("!!document.querySelector('.o_tl_pill_moved')")
                self.settle()
                self.check('M40', self.buffer_place('Review'), scheme, viewport,
                           'the place of the band while Review is held')
                # Escape ends the gesture without a write
                for kind in ('keyDown', 'keyUp'):
                    self.browser._websocket_request('Input.dispatchKeyEvent', params={
                        'type': kind, 'key': 'Escape', 'code': 'Escape',
                        'windowsVirtualKeyCode': 27})
                self.mouse('mouseReleased', 1261, 326, button='left', buttons=0, clickCount=1)
                self.wait("!document.querySelector('.o_tl_pill_moved')")

    def test_002c_m41_arrow_of_a_moved_pill(self):
        for scheme, viewport in self.combos(['M41'], ('desktop',)):
            with self.page(HOST.format('h44'), scheme, viewport):
                self.pointer_away()
                self.mouse('mouseMoved', 1069, 285, button='none', buttons=0)
                self.mouse('mousePressed', 1069, 285, button='left', buttons=1, clickCount=1)
                for i in range(1, 13):
                    self.mouse('mouseMoved', 1069 + (1261 - 1069) * i / 12,
                               285 + (326 - 285) * i / 12, button='left', buttons=1)
                    time.sleep(.03)
                self.wait("!!document.querySelector('.o_tl_pill_moved')")
                self.settle()
                self.check('M41', self.part('Review', 'Overlap A', '.o_tl_arrow_line'), scheme,
                           viewport, 'the line of the arrow while Review is held')
                for kind in ('keyDown', 'keyUp'):
                    self.browser._websocket_request('Input.dispatchKeyEvent', params={
                        'type': kind, 'key': 'Escape', 'code': 'Escape',
                        'windowsVirtualKeyCode': 27})
                self.mouse('mouseReleased', 1261, 326, button='left', buttons=0, clickCount=1)
                self.wait("!document.querySelector('.o_tl_pill_moved')")
