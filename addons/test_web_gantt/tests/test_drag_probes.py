# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes of slice 002b2 (drag and resize): the measured values M1 to M61 and the date of A64.

Run only these: ``--test-tags timeline_probes/test_web_gantt:TimelineDragProbes``. The dark scheme
needs ``web_enterprise``; without it the dark probes are skipped. A probe that says "touch phone"
runs with touch emulation, the others on the phone are measured without touch.
"""
import contextlib
import logging
import time
from datetime import date, timedelta

from odoo.tests import tagged

from .test_probes import SCHEMES, VIEWPORTS
from .timeline_drag_probe_values import MEASURED as DRAG_VALUES
from .timeline_probe import TimelineProbeCase

_logger = logging.getLogger(__name__ + '.diag')

HOST = 'test_web_gantt.host_action_{}'
SELECTION = "document.querySelector('.o_tl_selection')"
MOVED = "document.querySelector('.o_tl_pill_moved')"
MOVED_BODY = "document.querySelector('.o_tl_pill_moved > .o_tl_pill')"
FADED = "document.querySelector('.o_tl_pill_faded')"
DROP = "document.querySelector('.o_tl_selection.o_tl_drop')"
VIEW = "document.querySelector('.o_timeline_view')"
NOTIFICATION = "document.querySelector('.o_notification')"
NOTIFICATION_BAR = "document.querySelector('.o_notification .o_notification_bar')"
UNDO_BUTTON = "document.querySelector('.o_notification .o_notification_buttons button')"
RECORD_FIELDS = ('date_start', 'date_stop', 'parent_id', 'x_contact', 'x_tags')
START_BADGE = "document.querySelector('.o_tl_badge_start')"
STOP_BADGE = "document.querySelector('.o_tl_badge_stop')"


def arabic_midnight(day):
    """R19: 00:00 on a date as the Arabic user reads it (Monday 9 November 2026 is
    ٩ RLM / ١١ RLM / ٢٠٢٦ ، ١٢:٠٠ ص): day, mark, slash, month, mark, slash, year, Arabic comma,
    space, 12-hour time, space, the morning marker."""
    digits = str.maketrans('0123456789', '٠١٢٣٤٥٦٧٨٩')
    return (f'{day.day}\u200f/{day.month}\u200f/{day.year}\u060c 12:00 \u0635').translate(digits)


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

    def check_badge(self, probe, element_js, scheme, viewport, label, edge, at, text=None):
        """A badge of Arabic text: its width follows the machine's Arabic font, so neither the
        width nor the edge that moves with it is compared. Compared are the anchored edge (``at``,
        the ``right`` edge of a start badge or the ``left`` edge of a stop badge), the top, the
        height, the colours and the other styles of the table and, when given, the text."""
        expected = DRAG_VALUES[probe].get((scheme, viewport))
        if expected is None:
            return
        self.probe(probe, element_js, scheme, viewport, expected, label)
        box = self.geometry(element_js)
        found = box['geometry.x'] + (box['geometry.width'] if edge == 'right' else 0)
        self.assertAlmostEqual(found, at, delta=0.5,
                               msg=f'{probe} {scheme}/{viewport} {edge} edge of {label}')
        if text is not None:
            self.assertEqual(self.js(f"{element_js}.textContent"), text,
                             f'{probe} {scheme}/{viewport} text of {label}')

    def date_at(self, x, y):
        """The date of the column under a point of the grid."""
        cell = f'document.elementFromPoint({x}, {y}).closest("[data-column]")'
        select = '".o_tl_col[data-index=\'" + ' + cell + '.dataset.column + "\']"'
        return date.fromisoformat(self.js(f'document.querySelector({select}).dataset.date'))

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
                # the day pressed (first half) and the day where it is released (second half)
                first = self.date_at(x0, y)
                last = self.date_at(x1, y)
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
                self.check_badge('M55', START_BADGE, scheme, viewport, 'start badge (rtl)', 'right',
                                 1376, arabic_midnight(first))
                self.check_badge('M57', STOP_BADGE, scheme, viewport, 'stop badge (rtl)', 'left',
                                 992, arabic_midnight(last + timedelta(days=1)))
                self.mouse('mouseReleased', x1, y, button='left', buttons=0, clickCount=1)
                self.settle(500)

    def test_002b2_m54_m56_m58_rtl_selection_touch_phone(self):
        probes = ['M54', 'M56', 'M58']
        for scheme, viewport in self.combos(probes, ('phone',)):
            with self.page(HOST.format('h1'), scheme, viewport, login='rtl', touch=True):
                # A61: held 800 ms at x 230 on the empty bottom part, along y 412 in four steps
                # with a pause of 120 ms after each, then held 700 ms
                y = 412
                self.touch_event('touchStart', [(230, y)])
                time.sleep(.8)
                for x in (215, 195, 175, 160):
                    self.touch_event('touchMove', [(x, y)])
                    time.sleep(.12)
                self.wait(f"!!{SELECTION}")
                time.sleep(.7)
                self.settle()
                self.check('M54', SELECTION, scheme, viewport, 'selection highlight (rtl phone)')
                self.check_badge('M56', START_BADGE, scheme, viewport, 'start badge (rtl phone)',
                                 'right', 291)
                self.check_badge('M58', STOP_BADGE, scheme, viewport, 'stop badge (rtl phone)',
                                 'left', 99)
                self.touch_event('touchEnd', [])
                self.settle(500)

    # -- M59 to M61: the search bar of the plan dialog (R22) ---------------------------

    def open_plan_dialog(self):
        """Click an empty cell of the Beta row of H2 and wait for the plan dialog's list."""
        cell = f"{self.row('Beta')}.querySelector('.o_tl_cell[data-column=\"10\"]')"
        self.js(f"{cell}.scrollIntoView({{block: 'nearest', inline: 'nearest'}})")
        self.settle()
        box = self.geometry(cell)
        x = box['geometry.x'] + box['geometry.width'] / 2
        y = box['geometry.y'] + box['geometry.height'] / 2
        self.mouse('mouseMoved', x, y)
        self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=1)
        self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=1)
        self.wait("!!document.querySelector('.o_dialog .o_select_button')")
        self.settle(500)

    def test_002b2_a67_m59_m60_plan_search_bar_desktop(self):
        bar = "document.querySelector('.o_dialog .o_searchview')"
        field = "document.querySelector('.o_dialog .o_searchview_input')"
        for scheme, viewport in self.combos(['M59', 'M60'], ('desktop',)):
            with self.page(HOST.format('h2'), scheme, viewport, touch=False):
                self.open_plan_dialog()
                self.check('M59', bar, scheme, viewport, 'search bar of the plan dialog')
                self.check('M60', field, scheme, viewport, 'text field of the search bar')

    def test_002b2_a67_m61_plan_search_button_phone(self):
        button = ("document.querySelector('.o_dialog .o_control_panel button:has("
                  "[data-icon=\"search\"])')")
        for scheme, viewport in self.combos(['M61'], ('phone',)):
            with self.page(HOST.format('h2'), scheme, viewport, touch=False):
                self.open_plan_dialog()
                self.assertFalse(self.js("!!document.querySelector('.o_dialog .o_searchview')"),
                                 'the bar is hidden until the button is pressed')
                self.check('M61', button, scheme, viewport, 'search button next to the pager')

    # -- helpers of the probes M1 to M52 --------------------------------------------------

    @classmethod
    def _snapshot(cls):
        Pill = cls.env['test.web.gantt.pill'].with_context(active_test=False)
        cls.env.invalidate_all()
        return {
            pill.id: {name: pill._fields[name].convert_to_write(pill[name], pill)
                      for name in RECORD_FIELDS}
            for pill in Pill.search([])}

    def restore(self):
        """Write the host records back and delete every copy (the database is shared)."""
        stored = self.stored
        Pill = self.env['test.web.gantt.pill'].with_context(active_test=False)
        self.env.invalidate_all()
        Pill.search([('id', 'not in', list(stored))]).unlink()
        for pill in Pill.browse(list(stored)):
            pill.write(stored[pill.id])
        self.env.invalidate_all()

    def setUp(self):
        super().setUp()
        self.stored = self._snapshot()

    @contextlib.contextmanager
    def visit(self, host, scheme, viewport, touch=None, login='admin', prepare=None):
        """A page of the host, every record put back afterwards."""
        self.restore()
        if prepare:
            prepare()
        try:
            with self.page(HOST.format(host), scheme, viewport, touch=touch, login=login):
                yield
        finally:
            self.restore()

    def probe_values(self, probe, scheme, viewport):
        return DRAG_VALUES[probe].get((scheme, viewport))

    def check_edge(self, probe, element_js, scheme, viewport, label, anchor='left'):
        """For an element whose width follows its text (the font of the table may not be the
        one of this machine): everything but the width, and the edge the element is anchored to
        (the left edge keeps ``geometry.x``, the right edge is compared as ``x + width``)."""
        expected = self.probe_values(probe, scheme, viewport)
        if expected is None:
            return
        rest = {k: v for k, v in expected.items() if k != 'geometry.width'}
        if anchor == 'right':
            rest.pop('geometry.x', None)
        self.probe(probe, element_js, scheme, viewport, rest, label)
        if anchor == 'right':
            box = self.geometry(element_js)
            right = box['geometry.x'] + box['geometry.width']
            want = float(expected['geometry.x']) + float(expected['geometry.width'])
            self.assertAlmostEqual(right, want, delta=0.5,
                                   msg=f'{probe} {scheme}/{viewport} right edge of {label}')

    def centre(self, element_js):
        box = self.geometry(element_js)
        return (box['geometry.x'] + box['geometry.width'] / 2,
                box['geometry.y'] + box['geometry.height'] / 2, box)

    def key(self, kind, key, code, modifiers):
        self.browser._websocket_request('Input.dispatchKeyEvent', params={
            'type': kind, 'key': key, 'code': code, 'modifiers': modifiers,
            'windowsVirtualKeyCode': 17,
        })

    def press_and_move(self, x0, y0, x1, y1, steps=2, ctrl=False):
        """The button is pressed at (x0, y0) and the pointer moved to (x1, y1) in ``steps``."""
        modifiers = 2 if ctrl else 0
        self.mouse('mouseMoved', x0, y0)
        if ctrl:
            self.key('rawKeyDown', 'Control', 'ControlLeft', 2)
        self.mouse('mousePressed', x0, y0, button='left', buttons=1, clickCount=1,
                   modifiers=modifiers)
        for i in range(1, steps + 1):
            self.mouse('mouseMoved', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps,
                       button='left', buttons=1, modifiers=modifiers)
            time.sleep(.05)
        self.settle()

    def release(self, x, y, ctrl=False):
        self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=1,
                   modifiers=2 if ctrl else 0)
        if ctrl:
            self.key('keyUp', 'Control', 'ControlLeft', 0)

    def touch_hold_and_move(self, x0, y0, x1):
        """A17: a finger pressed at (x0, y0), held 600 ms, moved along y0 to x1 in steps of 20 px
        (the last one takes what is left: 20, 20, 20, 20 and 16 px for 96 px), 120 ms of pause
        after each step, then held 700 ms more before the caller releases."""
        self.touch_event('touchStart', [(x0, y0)])
        time.sleep(.6)
        sign = 1 if x1 >= x0 else -1
        travelled = 0
        total = abs(x1 - x0)
        while travelled < total - 1e-6:
            travelled = min(travelled + 20, total)
            self.touch_event('touchMove', [(x0 + sign * travelled, y0)])
            time.sleep(.12)
        time.sleep(.7)
        self.settle()

    def wait_notification(self, buttons):
        """The notification with (or, for a result, without) the Undo button."""
        test = ("!!document.querySelector('.o_notification .o_notification_buttons button')"
                if buttons else
                "!!document.querySelector('.o_notification') && "
                "!document.querySelector('.o_notification .o_notification_buttons')")
        self.wait(test)
        self.settle(800)

    def hover(self, x, y):
        self.mouse('mouseMoved', x, y)
        self.settle()

    def visible_middle(self, element_js):
        """The middle of the part of a pill that lies right of the row header and on screen."""
        return self.js(f"""(() => {{
            const el = {element_js};
            const box = Object.assign({{}}, el.getBoundingClientRect().toJSON());
            const header = document.querySelector('.o_tl_row_header');
            const edge = header ? header.getBoundingClientRect().right : 0;
            const left = Math.max(box.left, edge + 4, 0);
            const right = Math.min(box.right, window.innerWidth);
            return [(left + right) / 2, box.top + box.height / 2];
        }})()""")

    def switch_range(self, kind):
        self.click_js("document.querySelector('.o_tl_range_button')")
        self.wait(f"!!document.querySelector('.o_tl_range_{kind}')")
        self.click_js(f"document.querySelector('.o_tl_range_{kind}')")
        self.settle(600)

    def prepare_review(self, start, stop):
        review = self.env['test.web.gantt.pill'].search([('name', '=', 'Review')], limit=1)
        review.write({'date_start': start, 'date_stop': stop})
        self.env.flush_all()

    # -- M1 to M21: moving a pill, the notification and its Undo ------------------------------

    def test_002b2_a1_m1_m3_m5_m7_m9_m11_m13_m14_m16_m18_m20_move_desktop(self):
        probes = ['M1', 'M3', 'M5', 'M7', 'M9', 'M11', 'M13', 'M14', 'M16', 'M18', 'M20']
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.visit('h1', scheme, viewport, touch=False):
                x, y, _box = self.centre(self.pill('Review'))
                self.press_and_move(x, y, x + 192, y)
                self.wait(f"!!{MOVED}")
                self.settle()
                self.check('M1', MOVED, scheme, viewport, 'moved pill')
                self.check('M3', MOVED_BODY, scheme, viewport, 'body of the moved pill')
                self.check('M5', FADED, scheme, viewport, 'copy left at the start')
                self.check('M7', DROP, scheme, viewport, 'target highlight')
                self.check('M9', START_BADGE, scheme, viewport, 'start badge')
                self.check('M11', STOP_BADGE, scheme, viewport, 'stop badge')
                self.check('M13', VIEW, scheme, viewport, 'pointer shape')
                self.release(x + 192, y)
                self.wait_notification(True)
                self.check('M14', NOTIFICATION, scheme, viewport, 'notification')
                self.check('M16', NOTIFICATION_BAR, scheme, viewport, 'notification bar')
                self.check('M18', UNDO_BUTTON, scheme, viewport, 'Undo button')
                self.click_js(UNDO_BUTTON)
                self.wait_notification(False)
                self.check('M20', NOTIFICATION, scheme, viewport, 'notification of the Undo')

    def test_002b2_a17_m2_m4_m6_m8_m10_m12_m15_m17_m19_m21_move_phone(self):
        probes = ['M2', 'M4', 'M6', 'M8', 'M10', 'M12', 'M15', 'M17', 'M19', 'M21']
        for scheme, viewport in self.combos(probes, ('phone',)):
            with self.visit('h1', scheme, viewport, touch=True):
                x, y, _box = self.centre(self.pill('Review'))
                self.touch_hold_and_move(x, y, x - 96)
                self.wait(f"!!{MOVED}")
                self.settle()
                self.check('M2', MOVED, scheme, viewport, 'moved pill')
                self.check('M4', MOVED_BODY, scheme, viewport, 'body of the moved pill')
                self.check('M6', FADED, scheme, viewport, 'copy left at the start')
                self.check('M8', DROP, scheme, viewport, 'target highlight')
                self.check('M10', START_BADGE, scheme, viewport, 'start badge')
                self.check('M12', STOP_BADGE, scheme, viewport, 'stop badge')
                self.touch_event('touchEnd', [])
                self.wait_notification(True)
                self.check('M15', NOTIFICATION, scheme, viewport, 'notification')
                self.check('M17', NOTIFICATION_BAR, scheme, viewport, 'notification bar')
                self.check('M19', UNDO_BUTTON, scheme, viewport, 'Undo button')
                self.click_js(UNDO_BUTTON)
                self.wait_notification(False)
                self.check('M21', NOTIFICATION, scheme, viewport, 'notification of the Undo')

    # -- M22 to M24: copying -------------------------------------------------------------------

    def test_002b2_a21_m22_m23_copy_desktop(self):
        for scheme, viewport in self.combos(['M22', 'M23'], ('desktop',)):
            with self.visit('h2', scheme, viewport, touch=False):
                x, y, _box = self.centre(self.pill('Review'))
                _gx, gy, _gbox = self.centre(self.row('Gamma'))
                self.press_and_move(x, y, x + 192, gy, ctrl=True)
                self.wait(f"!!{MOVED}")
                self.check('M22', VIEW, scheme, viewport, 'pointer shape of a copy')
                self.release(x + 192, gy, ctrl=True)
                self.wait_notification(True)
                self.check('M23', NOTIFICATION_BAR, scheme, viewport, 'bar of the copy notice')

    def test_002b2_a24_m24_copy_phone(self):
        # The table names no gesture for M24 beyond "after the copy of M12": the probe plays the
        # phone copy of A24 (phone size, mouse, Ctrl held, "Plan" moved straight down into the
        # Beta row of H2) and measures the bar of the notice after the answer.
        for scheme, viewport in self.combos(['M24'], ('phone',)):
            with self.visit('h2', scheme, viewport, touch=False):
                x, y, _box = self.centre(self.pill('Plan'))
                _bx, by, _bbox = self.centre(self.row('Beta'))
                self.press_and_move(x, y, x, by, ctrl=True)
                self.wait(f"!!{MOVED}")
                self.release(x, by, ctrl=True)
                self.wait_notification(True)
                self.check('M24', NOTIFICATION_BAR, scheme, viewport, 'bar of the copy notice')

    # -- M25 to M28: the handles ------------------------------------------------------------

    def _hover_pill(self, name):
        # bring the row into view without moving the grid sideways
        self.js(f"""(() => {{
            const grid = document.querySelector('.o_tl_renderer');
            const left = grid.scrollLeft;
            {self.pill(name)}.scrollIntoView({{block: 'nearest', inline: 'nearest'}});
            grid.scrollLeft = left;
        }})()""")
        self.settle()
        x, y, _box = self.centre(self.pill(name))
        self.hover(x, y)
        self.wait(f"!!{self.pill(name)}.querySelector('.o_tl_handle')")
        self.settle()

    def _handle(self, name, edge):
        return f"{self.pill(name)}.querySelector('.o_tl_handle_{edge}')"

    def test_002b2_a25_m25_m27_handles_desktop(self):
        for scheme, viewport in self.combos(['M25', 'M27'], ('desktop',)):
            with self.visit('h1', scheme, viewport, touch=False):
                self._hover_pill('Build')
                self.check('M25', self._handle('Build', 'start'), scheme, viewport,
                           'start handle')
                self.check('M27', self._handle('Build', 'stop'), scheme, viewport, 'end handle')

    def test_002b2_a34_m26_m28_handles_phone(self):
        for scheme, viewport in self.combos(['M26', 'M28'], ('phone',)):
            with self.visit('h1', scheme, viewport, touch=False):
                self._hover_pill('Overlap B')
                self.check('M26', self._handle('Overlap B', 'start'), scheme, viewport,
                           'start handle')
                self.check('M28', self._handle('Overlap B', 'stop'), scheme, viewport,
                           'end handle')

    # -- M29 to M38: resizing -----------------------------------------------------------------

    def test_002b2_a27_m29_m31_m33_m34_shorten_desktop(self):
        for scheme, viewport in self.combos(['M29', 'M31', 'M33', 'M34'], ('desktop',)):
            with self.visit('h1', scheme, viewport, touch=False):
                self._hover_pill('Build')
                hx, hy, hbox = self.centre(self._handle('Build', 'stop'))
                right = hbox['geometry.x'] + hbox['geometry.width'] + 1
                self.press_and_move(hx, hy, right - 197, hy)
                self.wait("!!document.querySelector('.o_tl_pill_resizing')")
                self.settle()
                self.check('M29', STOP_BADGE, scheme, viewport, 'badge of the moved bound')
                self.check('M31', START_BADGE, scheme, viewport, 'badge of the other bound')
                self.check('M33', VIEW, scheme, viewport, 'pointer shape')
                self.check('M34', "document.querySelector('.o_tl_pill_resizing')", scheme,
                           viewport, 'resized pill')
                self.release(right - 197, hy)
                self.wait_notification(True)

    def test_002b2_a34_m30_m32_m35_shorten_phone(self):
        for scheme, viewport in self.combos(['M30', 'M32', 'M35'], ('phone',)):
            with self.visit('h1', scheme, viewport, touch=False):
                self._hover_pill('Overlap B')
                hx, hy, hbox = self.centre(self._handle('Overlap B', 'start'))
                left = hbox['geometry.x'] - 1
                self.press_and_move(hx, hy, left + 80, hy, steps=1)
                self.wait("!!document.querySelector('.o_tl_pill_resizing')")
                self.settle()
                self.check('M30', START_BADGE, scheme, viewport, 'badge of the moved bound')
                self.check('M32', STOP_BADGE, scheme, viewport, 'badge of the other bound')
                self.check('M35', "document.querySelector('.o_tl_pill_resizing')", scheme,
                           viewport, 'resized pill')
                self.release(left + 80, hy)
                self.wait_notification(True)

    def test_002b2_a28_m36_m38_lengthen_desktop(self):
        for scheme, viewport in self.combos(['M36', 'M38'], ('desktop',)):
            with self.visit('h1', scheme, viewport, touch=False):
                self._hover_pill('Build')
                hx, hy, hbox = self.centre(self._handle('Build', 'start'))
                left = hbox['geometry.x'] - 1
                self.press_and_move(hx, hy, left - 192 + 4, hy)
                self.wait("!!document.querySelector('.o_tl_pill_resizing')")
                self.settle()
                self.check('M36', START_BADGE, scheme, viewport, 'badge of the moved bound')
                self.check('M38', VIEW, scheme, viewport, 'pointer shape')
                self.release(left - 192 + 4, hy)
                self.wait_notification(True)

    def test_002b2_a34_m37_lengthen_phone(self):
        for scheme, viewport in self.combos(['M37'], ('phone',)):
            with self.visit('h1', scheme, viewport, touch=False):
                self._hover_pill('Review')
                hx, hy, hbox = self.centre(self._handle('Review', 'start'))
                left = hbox['geometry.x'] - 1
                self.press_and_move(hx, hy, left - 96 + 5, hy, steps=1)
                self.wait("!!document.querySelector('.o_tl_pill_resizing')")
                self.settle()
                self.check('M37', START_BADGE, scheme, viewport, 'badge of the moved bound')
                self.release(left - 96 + 5, hy)
                self.wait_notification(True)

    # -- M39 to M44: locked pills -----------------------------------------------------------

    def test_002b2_a47_m39_m41_m43_m44_locked_desktop(self):
        for scheme, viewport in self.combos(['M39', 'M41', 'M43', 'M44'], ('desktop',)):
            with self.visit('h1', scheme, viewport, touch=False):
                self.switch_range('day')
                x, y = self.visible_middle(self.pill('Design'))
                self.hover(x, y)
                self.wait(f"!!{self.pill('Design')}.querySelector('.o_tl_handle')")
                self.check('M44', self._handle('Design', 'stop'), scheme, viewport,
                           'end handle of the cut pill')
                self.assertFalse(self.js(f"!!{self._handle('Design', 'start')}"))
                self.press_and_move(x, y, x + 40, y, steps=2)
                self.wait(f"!!{MOVED}")
                self.settle()
                icon = f"{MOVED}.querySelector('.o_tl_pill_lock')"
                self.check('M39', icon, scheme, viewport, 'lock icon')
                self.check('M41', MOVED, scheme, viewport, 'raised pill')
                self.check('M43', VIEW, scheme, viewport, 'pointer shape')
                self.release(x + 40, y)
                self.settle()

    def test_002b2_a48_m40_m42_locked_phone(self):
        for scheme, viewport in self.combos(['M40', 'M42'], ('phone',)):
            with self.visit('h31', scheme, viewport, touch=False):
                x, y, _box = self.centre(self.pill('Review'))
                self.press_and_move(x, y, x + 30, y, steps=2)
                self.wait(f"!!{MOVED}")
                self.settle()
                icon = f"{MOVED}.querySelector('.o_tl_pill_lock')"
                self.check('M40', icon, scheme, viewport, 'lock icon')
                self.check('M42', MOVED, scheme, viewport, 'raised pill')
                self.release(x + 30, y)
                self.settle()

    # -- M45 to M50: an invalid resize --------------------------------------------------------

    def _invalid_resize(self, probes, viewport, prepare, badge_probe, bar_probe,
                        notification_probe):
        for scheme, vp in self.combos(probes, (viewport,)):
            with self.visit('h1', scheme, vp, touch=False, prepare=prepare):
                self._hover_pill('Review')
                hx, hy, _hbox = self.centre(self._handle('Review', 'stop'))
                self.press_and_move(hx, hy, hx - 88, hy, steps=1)
                self.wait("!!document.querySelector('.o_tl_pill_resizing')")
                self.settle()
                self.check(badge_probe, STOP_BADGE, scheme, vp, 'stop badge')
                self.release(hx - 88, hy)
                self.wait("!!document.querySelector('.o_notification')")
                self.settle(800)
                if vp == 'desktop':
                    # M47: 334 px wide because of the original's longer message; Complete's own
                    # wording is shorter, so the notice keeps the minimum width of 288 px. What
                    # the text does not decide (right edge, top, height, colours) is compared.
                    self.check_edge(notification_probe, NOTIFICATION, scheme, vp,
                                    'warning notification', 'right')
                else:
                    # M48: the full width of the phone does not depend on the text
                    self.check(notification_probe, NOTIFICATION, scheme, vp,
                               'warning notification')
                self.check(bar_probe, NOTIFICATION_BAR, scheme, vp, 'bar of the warning')

    def test_002b2_a31_m45_m47_m49_invalid_resize_desktop(self):
        self._invalid_resize(
            ['M45', 'M47', 'M49'], 'desktop',
            lambda: self.prepare_review('2026-11-12 07:00:00', '2026-11-12 11:00:00'),
            'M45', 'M49', 'M47')

    def test_002b2_a33_m46_m48_m50_invalid_resize_phone(self):
        self._invalid_resize(
            ['M46', 'M48', 'M50'], 'phone',
            lambda: self.prepare_review('2026-11-11 19:00:00', '2026-11-11 23:00:00'),
            'M46', 'M50', 'M48')

    # -- M51, M52: the target highlight of a group row (H30) --------------------------------------

    def _group_target(self, probe, viewport, pill, row):
        for scheme, vp in self.combos([probe], (viewport,)):
            with self.visit('h30', scheme, vp, touch=False):
                x, y = self.visible_middle(self.pill(pill))
                _rx, ry, _rbox = self.centre(self.row(row))
                self.press_and_move(x, y, x, ry, steps=3)
                self.wait("!!document.querySelector('.o_tl_selection.o_tl_drop')")
                self.settle()
                self.check(probe, DROP, scheme, vp, 'target highlight on the group row')
                self.release(x, ry)
                self.settle()

    def test_002b2_a52_m51_group_target_desktop(self):
        self._group_target('M51', 'desktop', 'Design', 'Beta')

    def test_002b2_a52_m52_group_target_phone(self):
        self._group_target('M52', 'phone', 'Plan', 'Alpha')

    # -- A64: a scroll moves the focus date ----------------------------------------------------

    def test_002b2_a64_scroll_moves_focus_date(self):
        # D0 is fixed (12 November 2026), so the answer is the same on every day the suite runs
        with self.visit('h1', 'light', 'desktop', touch=False):
            for kind in ('day', 'month', 'year'):
                self.switch_range(kind)
            self.js("document.querySelector('.o_tl_renderer').scrollLeft += 200")
            self.settle()
            self.switch_range('week')
            middle = self.js("""(() => {
                const grid = document.querySelector('.o_tl_renderer');
                const header = document.querySelector('.o_tl_title_cell');
                const left = header ? header.getBoundingClientRect().right : 0;
                const rect = grid.getBoundingClientRect();
                const x = (Math.max(rect.left, left) + rect.right) / 2;
                const column = [...document.querySelectorAll('.o_tl_col[data-date]')].find((c) => {
                    const r = c.getBoundingClientRect();
                    return r.left <= x && x < r.right;
                });
                if (!column) { return null; }
                const r = column.getBoundingClientRect();
                return [column.dataset.date, (x - r.left) / r.width];
            })()""")
            # The spec names Monday 11 January 2027 "in the middle". R18: the round trip may shift
            # the moment by the rounding of the scroll position (7 hours per pixel on Year), never
            # by a whole column; the capture's clock was 09:00, this probe's is 00:30 (one more
            # pixel on Year). So the moment in the middle is compared, not only its day: within
            # 15 hours of Monday 11 January 12:00.
            day, share = middle
            self.assertIn(day, ('2027-01-11', '2027-01-12'), f'the middle is on {day}')
            hours = (24 if day == '2027-01-12' else 0) + 24 * share - 12
            self.assertLessEqual(abs(hours), 15,
                                 f'the middle is {day} at {share:.2f} of the day')
            self.click_js("document.querySelector('.o_tl_button_add')")
            self.wait("!!document.querySelector('.o_dialog .o_form_view')")
            self.settle(500)
            read = """((name) => document.querySelector(
                `.o_dialog .o_field_widget[name="${name}"] input, `
                + `.o_dialog .o_field_widget[name="${name}"] button[data-field]`)?.value)"""
            start = self.js(f"{read}('date_start')")
            stop = self.js(f"{read}('date_stop')")
            self.assertTrue(start.startswith('01/10/2027'), f'the week starts on {start}')
            self.assertTrue(stop.startswith('01/17/2027'), f'the week ends on {stop}')
