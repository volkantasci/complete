# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes of slice 002d's notes on the earlier parts (M27 to M38, M41 to M44, M47), on 002c's
host H42.

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

    def check_popover(self, probe, scheme, label):
        """The outer box of the popover (``.o_popover``, 002d Q4) as the package measures it, 274 x
        210.688 px at (1084, 281), every value compared; its frame ``.o_tl_popover`` (002a M43) lies
        1 px inside on each side (M45); from M32 to M33 the box did not change."""
        expected = measured(probe)[scheme]
        self.probe(probe, "document.querySelector('.o_popover')", scheme, 'desktop', expected,
                   label)
        rect = ("(() => { const r = document.querySelector(%r).getBoundingClientRect();"
                " return [r.x, r.y, r.width, r.height]; })()")
        box = self.js(rect % '.o_popover')
        frame = self.js(rect % '.o_popover > .o_tl_popover')
        inside = (box[0] + 1, box[1] + 1, box[2] - 2, box[3] - 2)
        for got, want in zip(frame, inside, strict=True):
            self.assertAlmostEqual(got, want, delta=.6, msg=f'{probe} frame {frame} in {box}')
        previous = getattr(self, '_popover_box', None)
        if probe == 'M33':
            self.assertEqual(box, previous, 'the popover did not change at 9 px')
        self._popover_box = box

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
        probes = ['M27', 'M28', 'M29', 'M31']
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
                # M30 is not compared on Complete (it reads a hidden strip it does not
                # draw, N4): A1 checks that no handle shows
                wrapper = self.js(
                    "document.querySelectorAll('.o_tl_connect[data-pill-id=\"' + "
                    f"({self.pill('Build')}).dataset.pillId + '\"]').length")
                self.assertEqual(wrapper, 0, 'no handles of Build are drawn')
                self.pointer_at(1301, 225)
                self.check('M31', self.part('Build', 'Test', '.o_tl_arrow_line'), scheme,
                           'Build to Test, back at rest after the next move')
        self.assertTrue(build.exists())

    # -- M41 to M43: where the band of an arrow begins (R1a, A9) --------------------------------

    def test_m41_m43_band_begins_at_the_outer_box(self):
        """The pointer from (1300, 260) to (1506, 260), over the end of Build's body: the line of
        "Design" to "Build" is lit (M41); then at (1509, 260), Build's outer right edge, on the band
        of "Build" to "Test": it is back at rest (M42); the band is 13 px wide with square ends
        and the box of the arrow (M43)."""
        probes = ['M41', 'M42', 'M43']
        for scheme in self.schemes(probes):
            with self.page(HOST, scheme, 'desktop'):
                self.wait("document.querySelectorAll('.o_tl_arrow').length === 3", timeout=60)
                self.settle()
                self.pointer_at(1300, 260)
                for i in range(1, 7):
                    self.mouse('mouseMoved', 1300 + 206 * i / 6, 260)
                    time.sleep(.03)
                self.settle()
                self.check('M41', self.part('Design', 'Build', '.o_tl_arrow_line'), scheme,
                           'Design to Build, the pointer over the end of Build')
                self.pointer_at(1509, 260)
                self.check('M42', self.part('Design', 'Build', '.o_tl_arrow_line'), scheme,
                           'Design to Build, the pointer on the band')
                self.check('M43', self.part('Build', 'Test', '.o_tl_arrow_band'), scheme,
                           'the band of Build to Test')

    # -- M44, M47: a resize released where it started (R1a, A9) --------------------------------

    def test_m44_m47_resize_released_where_it_started(self):
        """Review's right handle pressed at (1121, 285), moved to (1060, 285) and back, released:
        the line of "Review" to "Overlap A" is still lit (M44) and Review did not move (M47). The
        package reads the body of "Review" (1030, 274, 94 x 23, P4)."""
        probes = ['M44', 'M47']
        for scheme in self.schemes(probes):
            with self.page(HOST, scheme, 'desktop'):
                self.wait("document.querySelectorAll('.o_tl_arrow').length === 3", timeout=60)
                self.settle()
                self.pointer_at(1077, 285)
                for i in range(1, 4):
                    self.mouse('mouseMoved', 1077 + 44 * i / 3, 285)
                    time.sleep(.03)
                self.mouse('mousePressed', 1121, 285, button='left', buttons=1, clickCount=1)
                for i in range(1, 6):
                    self.mouse('mouseMoved', 1121 - 61 * i / 5, 285, button='left', buttons=1)
                    time.sleep(.03)
                for i in range(1, 6):
                    self.mouse('mouseMoved', 1060 + 61 * i / 5, 285, button='left', buttons=1)
                    time.sleep(.03)
                self.mouse('mouseReleased', 1121, 285, button='left', buttons=0, clickCount=1)
                self.settle(600)
                self.check('M44', self.part('Review', 'Overlap A', '.o_tl_arrow_line'), scheme,
                           'Review to Overlap A, still lit')
                self.check('M47', self.pill('Review'), scheme, 'the pill Review after the release')

    # -- M32 to M34: a popover and a press on the end handle (R2 point 1, A11) ------------------

    def test_m32_m34_popover_and_handle_press(self):
        """The popover box (the element ``.o_popover``) while the end handle is held still (M32),
        after a move of 9 px (M33), and the line drawn after 10 px with the popover gone (M34)."""
        probes = ['M32', 'M33', 'M34']
        popover = "document.querySelector('.o_popover')"
        for scheme in self.schemes(probes):
            with self.page(HOST, scheme, 'desktop'):
                self.wait("document.querySelectorAll('.o_tl_arrow').length === 3", timeout=60)
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
                self.check_popover('M32', scheme, 'the popover, the end handle held still')
                self.mouse('mouseMoved', 1493, 280, button='left', buttons=1)
                self.settle()
                self.check_popover('M33', scheme, 'the popover, 9 px to the left')
                self.mouse('mouseMoved', 1492, 280, button='left', buttons=1)
                self.wait("!!document.querySelector('.o_tl_connect_path')")
                self.assertFalse(self.js(f"!!{popover}"), 'the popover is gone')
                self.check('M34', "document.querySelector('.o_tl_connect_path')", scheme,
                           'the line being drawn')
                self.browser._websocket_request('Input.dispatchKeyEvent', params={
                    'type': 'keyDown', 'key': 'Escape', 'code': 'Escape',
                    'windowsVirtualKeyCode': 27, 'nativeVirtualKeyCode': 27})
                self.mouse('mouseReleased', 1492, 280, button='left', buttons=0, clickCount=1)

    # -- M35 to M38: touch, after a drawing is saved (R3, A17) ---------------------------------

    def touch_event(self, kind, x, y):
        self.browser._websocket_request('Input.dispatchTouchEvent', params={
            'type': kind, 'touchPoints': [] if x is None else [{'x': x, 'y': y, 'id': 1}],
        })

    def wrapper_of(self, name):
        """The wrapper of the drawing handles of a pill, or null (T1-2: drawn only while shown)."""
        return ("document.querySelector('.o_tl_connect[data-pill-id=\"' + "
                f"({self.pill(name)}).dataset.pillId + '\"]')")

    def test_m35_m38_touch_handles(self):
        """Touch input at desktop size (no mobile mode): a tap on Build, the drawing of A91 to
        "Overlap C" written and the view reloaded, 1.5 s on. M35 is the strip above Build's pill,
        which holds its start handle (``.o_tl_connect_strip_above`` of the wrapper): the size and
        x of the package, and y 11 px above the pill's outer box (the package's y follows the
        original's control bar, Complete's is taller). M36 and M38 are not compared on
        Complete (N4): A17 checks that no handle shows.
        M37 is the line of the new arrow at rest."""
        probes = ['M35', 'M37']
        for scheme in self.schemes(probes):
            # the records of the host: no link into "Overlap C" yet (a former scheme wrote one)
            self.records['Overlap C'].dependency_field = [(5,)]
            self.env.flush_all()
            with self.page(HOST, scheme, 'desktop', touch=True, mobile=False):
                self.wait("document.querySelectorAll('.o_tl_arrow').length === 3", timeout=60)
                self.settle()
                body = self.geometry(self.pill('Build'))
                left, top = body['geometry.x'] - 1, body['geometry.y'] - 1
                right = body['geometry.x'] + body['geometry.width'] + 1
                bottom = body['geometry.y'] + body['geometry.height'] + 1
                middle = body['geometry.y'] + body['geometry.height'] / 2
                # a tap at (L + 368, M), 600 ms
                self.touch_event('touchStart', left + 368, middle)
                self.touch_event('touchEnd', None, None)
                self.settle(600)
                self.wait(f"!!{self.wrapper_of('Build')}")
                # a finger on (R - 7, B + 7) held 400 ms, to the middle of "Overlap C" in 10 steps,
                # held 400 ms, lifted
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
                self.wait("document.querySelectorAll('.o_tl_arrow').length === 4", timeout=30)
                self.settle(1500)
                strip = f"{self.wrapper_of('Build')}.querySelector('.o_tl_connect_strip_above')"
                expected = {key: value for key, value in measured('M35')[scheme].items()
                            if key in ('display', 'geometry.x', 'geometry.width',
                                       'geometry.height')}
                self.probe('M35', strip, scheme, 'desktop', expected, 'the start handle strip')
                box = self.geometry(strip)
                # the strip ends where the pill's outer box begins: the package's 251 + 11 = 262
                self.assertAlmostEqual(box['geometry.y'] + box['geometry.height'], top, delta=.6,
                                       msg='M35 the strip lies right above the outer box of Build')
                self.assertTrue(self.js(f"!{self.wrapper_of('Overlap C')}"),
                                'A17 Overlap C shows no handle (no wrapper is drawn)')
                self.check('M37', self.part('Build', 'Overlap C', '.o_tl_arrow_line'), scheme,
                           'the new arrow at rest')
                # the next tap, on the empty cell 23 px above Build's outer box
                self.touch_event('touchStart', 1300, top - 23)
                self.touch_event('touchEnd', None, None)
                self.settle(600)
                self.assertTrue(self.js(f"!{self.wrapper_of('Build')}"),
                                'A17 Build shows no handle after a tap on an empty cell')
        self.assertTrue(self.records['Build'].exists())
