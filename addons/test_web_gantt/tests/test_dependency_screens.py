# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Screenshots of the dependencies, rescheduling and buffers, taken on demand (not part of the
normal run).

One capture per screen S1 to S14 of the spec's ``screens/index.md`` of slice 002c (names 75 to 88
of ``gantt_view``; light: no suffix, dark: ``-dark``, phone: ``.mobile``). Run with
``--test-tags gantt_dependency_screens`` and ``--screenshots /mnt/cwg_shots`` on a database that
has ``web_enterprise`` (for the dark scheme), with the git-ignored
``.cache/gantt_dependency_screens`` of the checkout mounted there; the files land in
``.cache/gantt_dependency_screens/gantt_view/`` and the ones to keep are copied into
``docs/assets/gantt_view/``. The gestures are the ones of the probes of ``test_dependency_probes``
(same points, steps and pauses). The phone shows what the phone does: the host at rest, the buffer
bands and the notification after a move; always taken with a mouse.
"""
import time

from odoo import Command
from odoo.tests import tagged

from . import test_drag_screens as drag
from .timeline_probe import TimelineProbeCase

HOST = 'test_web_gantt.host_action_{}'
DESKTOP = ('desktop',)
BOTH = ('desktop', 'phone')
ESCAPE = {'key': 'Escape', 'code': 'Escape', 'windowsVirtualKeyCode': 27}


@tagged('-standard', 'gantt_dependency_screens', 'post_install', '-at_install')
class TimelineDependencyScreens(TimelineProbeCase):

    # the plumbing of the earlier screens, reused as it is
    snap = drag.TimelineDragScreens.snap
    each = drag.TimelineDragScreens.each
    visit = drag.TimelineDragScreens.visit
    restore = drag.TimelineDragScreens.restore
    _snapshot = drag.TimelineDragScreens.__dict__['_snapshot']

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env['test.web.gantt.pill']._tl_rtl_user()

    def setUp(self):
        super().setUp()
        self.stored = self._snapshot()

    # -- gestures -------------------------------------------------------------------

    def mouse(self, kind, x, y, **extra):
        self.browser._websocket_request('Input.dispatchMouseEvent', params={
            'type': kind, 'x': x, 'y': y, **extra,
        })

    def pointer_at(self, x, y):
        self.mouse('mouseMoved', x, y)
        self.settle()

    def hold_pill(self, start, end, steps=12):
        """Press at ``start``, move to ``end`` in ``steps`` moves; the button stays down."""
        self.mouse('mouseMoved', start[0], start[1], button='none', buttons=0)
        self.mouse('mousePressed', start[0], start[1], button='left', buttons=1, clickCount=1)
        for i in range(1, steps + 1):
            self.mouse('mouseMoved', start[0] + (end[0] - start[0]) * i / steps,
                       start[1] + (end[1] - start[1]) * i / steps, button='left', buttons=1)
            time.sleep(.03)

    def release(self, point):
        self.mouse('mouseReleased', point[0], point[1], button='left', buttons=0, clickCount=1)

    def drag_pill(self, start, end, steps=12):
        """A whole move; then wait for the notification."""
        self.hold_pill(start, end, steps)
        self.release(end)
        self.wait("!!document.querySelector('.o_notification')", timeout=60)
        self.settle(700)

    def abandon(self, point):
        """Escape ends the held gesture without a write."""
        for kind in ('keyDown', 'keyUp'):
            self.browser._websocket_request('Input.dispatchKeyEvent', params={
                'type': kind, **ESCAPE})
        self.release(point)
        self.wait("!document.querySelector('.o_tl_pill_moved')")

    def arrows(self, count):
        self.wait(f"document.querySelectorAll('.o_tl_arrow').length === {count}", timeout=60)
        self.settle()

    def prepared(self):
        """The prepared records of H46 and H47, built before a visit and dropped after it."""
        Pill = self.env['test.web.gantt.pill']
        Pill._tl_build_reschedule_records()
        self.addCleanup(Pill._tl_drop_reschedule_records)

    def dropped(self):
        self.env['test.web.gantt.pill']._tl_drop_reschedule_records()

    # -- S1: arrows at rest (75) ----------------------------------------------------

    def test_s01_arrows(self):
        def prepare(viewport, shot):
            if viewport == 'desktop':
                self.arrows(3)
            self.pointer_away()
            shot('75-arrows')
        self.each('h42', prepare)

    # -- S2, S3: the pointer over a pill, over a remove button (76, 77) -------------

    def test_s02_s03_hover(self):
        def prepare(viewport, shot):
            self.arrows(3)
            self.pointer_at(1300, 260)
            shot('76-pill-hover')
            self.pointer_at(1317, 293)
            shot('77-button-hover')
        self.each('h42', prepare, viewports=DESKTOP)

    # -- S4, S5: drawing a dependency, the new arrow (78, 79) -------------------------

    def test_s04_s05_drawing(self):
        overlap = self.records['Overlap C']

        def prepare(viewport, shot):
            links = overlap.dependency_field.ids
            try:
                self.arrows(3)
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
                shot('78-drawing')
                self.release((1133, 442))
                self.arrows(4)
                self.pointer_away()
                shot('79-created')
            finally:
                overlap.invalidate_recordset()
                overlap.write({'dependency_field': [Command.set(links)]})
        self.each('h42', prepare, viewports=DESKTOP)

    # -- S6: the method menu (80) ---------------------------------------------------

    def test_s06_menu(self):
        def prepare(viewport, shot):
            self.arrows(3)
            self.click_js("document.querySelector('.o_tl_reschedule_button')")
            self.wait("!!document.querySelector('.o_tl_reschedule_menu')")
            self.pointer_away()
            shot('80-menu')
        self.each('h42', prepare, viewports=DESKTOP)

    # -- S7, S8: the arrows hidden, then the pointer over a pill (81, 82) -------------

    def test_s07_s08_hidden(self):
        view = self.env.ref('test_web_gantt.host_view_h42').id
        action = self.env.ref('test_web_gantt.host_action_h42').id

        def prepare(viewport, shot):
            self.js(f"localStorage.setItem('gantt_show_connectors,{view},{action}', 'false')")
            try:
                self.js("location.reload()")
                self.wait("document.readyState === 'complete'")
                self.arrows(3)
                self.pointer_away()
                shot('81-hidden')
                self.pointer_at(1300, 260)
                shot('82-hidden-hover')
            finally:
                self.js(f"localStorage.removeItem('gantt_show_connectors,{view},{action}')")
        self.each('h42', prepare, viewports=DESKTOP)

    # -- S9: buffer bands (83) --------------------------------------------------------

    def test_s09_buffers(self):
        def prepare(viewport, shot):
            self.wait("!!document.querySelector('.o_tl_buffer_band')")
            self.pointer_away()
            shot('83-buffers')
        self.each('h44', prepare)

    # -- S10: a pill held with a band and an arrow (84) -------------------------------

    def test_s10_moving(self):
        def prepare(viewport, shot):
            self.pointer_away()
            self.hold_pill((1069, 285), (1261, 326))
            self.wait("!!document.querySelector('.o_tl_pill_moved')")
            self.settle()
            shot('84-moving')
            self.abandon((1261, 326))
        self.each('h44', prepare, viewports=DESKTOP)

    # -- S11: the rescheduling host (85) ----------------------------------------------

    def test_s11_before(self):
        self.addCleanup(self.dropped)

        def prepare(viewport, shot):
            self.pointer_away()
            shot('85-before')
        self.each('h46', prepare, viewports=DESKTOP, before=self.prepared)

    # -- S12: after a rescheduling (86) -----------------------------------------------

    def test_s12_rescheduled(self):
        self.addCleanup(self.dropped)

        def prepare(viewport, shot):
            self.pointer_away()
            if viewport == 'desktop':
                self.drag_pill((446, 219), (638, 219))
            else:
                self.drag_pill((230, 267), (326, 267))
            self.pointer_away()
            shot('86-rescheduled')
        self.each('h46', prepare, before=self.prepared)

    # -- S13: a cycle (87) ------------------------------------------------------------

    def test_s13_cycle(self):
        self.addCleanup(self.dropped)

        def prepare(viewport, shot):
            self.pointer_away()
            self.drag_pill((1214, 219), (1310, 219))
            self.pointer_away()
            shot('87-cycle')
        self.each('h46', prepare, viewports=DESKTOP, before=self.prepared)

    # -- S14: a date-only model (88) --------------------------------------------------

    def test_s14_dated(self):
        self.addCleanup(self.dropped)

        def prepare(viewport, shot):
            self.pointer_away()
            box = self.geometry(self.pill('Chain A'))
            day = self.geometry("document.querySelector('.o_tl_col')")['geometry.width']
            start = (box['geometry.x'] + 30, box['geometry.y'] + box['geometry.height'] / 2)
            self.drag_pill(start, (start[0] + day, start[1]))
            self.pointer_away()
            shot('88-dated')
        self.each('h47', prepare, viewports=DESKTOP, before=self.prepared)
