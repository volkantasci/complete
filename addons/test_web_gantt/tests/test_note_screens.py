# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Screenshots of slice 002d's notes on the earlier parts, taken on demand (not part of the
normal run).

One capture per screen S9 to S11 of the spec's ``screens/index.md`` of slice 002d (names 89 to 91
of ``gantt_view``; light: no suffix, dark: ``-dark``). Run with ``--test-tags
gantt_note_screens`` and ``--screenshots /mnt/cwg_shots`` on a database that has
``web_enterprise`` (for the dark scheme), with the git-ignored ``.cache/screens_002d`` of the
checkout mounted there; the files land in ``.cache/screens_002d/gantt_view/`` and are copied into
``docs/assets/gantt_view/``. The gestures are the ones of the probes of ``test_note_probes``
(same points, steps and pauses). All three screens are desktop-sized.
"""
import time

from odoo.tests import tagged

from . import test_drag_screens as drag
from .test_note_probes import TestNoteProbes as Probes
from .timeline_probe import TimelineProbeCase

HOST = 'test_web_gantt.host_action_h42'
ARROWS = "document.querySelectorAll('.o_tl_arrow').length === {}"


@tagged('-standard', 'gantt_note_screens', 'post_install', '-at_install')
class TimelineNoteScreens(TimelineProbeCase):

    # the plumbing of the earlier screens and of the note probes, reused as it is
    snap = drag.TimelineDragScreens.snap
    restore = drag.TimelineDragScreens.restore
    _snapshot = drag.TimelineDragScreens.__dict__['_snapshot']
    mouse = Probes.mouse
    pointer_at = Probes.pointer_at
    draw_to = Probes.draw_to
    touch_event = Probes.touch_event
    wrapper_of = Probes.wrapper_of

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env['test.web.gantt.pill']._tl_rtl_user()

    def setUp(self):
        super().setUp()
        self.stored = self._snapshot()

    def each(self, prepare, touch=False, before=None):
        """Run ``prepare(shot)`` once per scheme; ``shot(stem)`` stores the viewport as the file
        of ``stem``. ``touch`` is touch input at desktop size, without the phone's mobile mode."""
        errors = []
        for scheme in ('light', 'dark'):
            if scheme == 'dark' and not self.has_theme:
                continue
            suffix = ('-dark' if scheme == 'dark' else '') + '.png'
            admin = self.env['res.users'].search([('login', '=', 'admin')], limit=1)
            self.env['res.users.settings']._find_or_create_for_user(admin).color_scheme = scheme

            def shot(stem, suffix=suffix):
                self.snap(stem + suffix)

            try:
                self.restore()
                if before:
                    before()
                # touch input at desktop size: the page is not in the phone's mobile mode
                with self.page(HOST, scheme, 'desktop', touch=touch, mobile=False):
                    prepare(shot)
            except Exception as error:  # noqa: BLE001 - keep capturing the other scheme
                errors.append(f'{suffix}: {error}')
                try:
                    self.snap('failed-' + suffix)
                except Exception:  # noqa: BLE001
                    pass
            finally:
                self.restore()
        self.assertFalse(errors, '\n'.join(errors))

    # -- S9: a drawing released on an empty cell (89) ---------------------------------------------

    def test_s09_released_empty(self):
        def prepare(shot):
            self.wait(ARROWS.format(3), timeout=60)
            self.settle()
            self.draw_to((1300, 225))
            shot('89-released-empty')
        self.each(prepare)

    # -- S10: a popover and a press on the end handle (90) ----------------------------------------

    def test_s10_handle_pressed(self):
        def prepare(shot):
            self.wait(ARROWS.format(3), timeout=60)
            self.settle()
            self.pointer_at(1300, 260)
            self.mouse('mousePressed', 1300, 260, button='left', buttons=1, clickCount=1)
            self.mouse('mouseReleased', 1300, 260, button='left', buttons=0, clickCount=1)
            self.wait("!!document.querySelector('.o_tl_popover')")
            self.settle()
            for i in range(1, 5):
                self.mouse('mouseMoved', 1300 + 202 * i / 4, 260 + 20 * i / 4)
                time.sleep(.03)
            self.mouse('mousePressed', 1502, 280, button='left', buttons=1, clickCount=1)
            self.settle(300)
            shot('90-handle-pressed')
            self.mouse('mouseReleased', 1502, 280, button='left', buttons=0, clickCount=1)
        self.each(prepare)

    # -- S11: after a touch drawing is saved (91) -------------------------------------------------

    def test_s11_touch_saved(self):
        overlap = self.records['Overlap C']

        def prepare(shot):
            self.wait(ARROWS.format(3), timeout=60)
            self.settle()
            body = self.geometry(self.pill('Build'))
            left = body['geometry.x'] - 1
            right = body['geometry.x'] + body['geometry.width'] + 1
            bottom = body['geometry.y'] + body['geometry.height'] + 1
            middle = body['geometry.y'] + body['geometry.height'] / 2
            self.touch_event('touchStart', left + 368, middle)
            self.touch_event('touchEnd', None, None)
            self.settle(600)
            self.wait(f"!!{self.wrapper_of('Build')}")
            other = self.geometry(self.pill('Overlap C'))
            end = (other['geometry.x'] + other['geometry.width'] / 2,
                   other['geometry.y'] + other['geometry.height'] / 2)
            start = (right - 7, bottom + 7)
            self.touch_event('touchStart', *start)
            self.settle(400)
            for i in range(1, 11):
                self.touch_event('touchMove', start[0] + (end[0] - start[0]) * i / 10,
                                 start[1] + (end[1] - start[1]) * i / 10)
                time.sleep(.03)
            self.settle(400)
            self.touch_event('touchEnd', None, None)
            self.wait(ARROWS.format(4), timeout=30)
            self.settle(1500)
            shot('91-touch-saved')
        def before():
            # no link into "Overlap C" yet (the former scheme wrote one)
            overlap.dependency_field = [(5,)]
            self.env.flush_all()
        self.each(prepare, touch=True, before=before)
