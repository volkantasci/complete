# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes of the editing interface (slice 002b): selection, New button, dialogs, popover buttons.

Run only these: ``--test-tags timeline_probes/test_web_gantt:TimelineEditProbes``. The dark scheme
needs ``web_enterprise``; without it the dark probes are skipped. The phone is measured without
touch, except where a probe says "touch phone" (M9, M12 and the note on 002a's M75).
"""
import json
import logging
import time

from odoo.tests import tagged

from .test_probes import SCHEMES, VIEWPORTS
from .timeline_edit_probe_values import MEASURED as EDIT_VALUES
from .timeline_probe import TimelineProbeCase

_logger = logging.getLogger(__name__ + '.diag')

HOST = 'test_web_gantt.host_action_{}'
SIZES = {'desktop': (1600, 900), 'phone': (390, 844)}
MODAL = "[...document.querySelectorAll('.o_dialog .modal-dialog')].at(-1)"


def _first_cell(row_js, column):
    return f"{row_js}.querySelector('.o_tl_cell[data-column=\"{column}\"]')"


@tagged('post_install', '-at_install', 'timeline_probes')
class TimelineEditProbes(TimelineProbeCase):

    # -- helpers --------------------------------------------------------------------

    def _callTestMethod(self, method):
        try:
            return super()._callTestMethod(method)
        except Exception as error:
            state = None
            try:
                state = self.js("""JSON.stringify({
                    url: location.pathname,
                    selecting: !!document.querySelector('.o_tl_selecting'),
                    selection: !!document.querySelector('.o_tl_selection'),
                    dialogs: document.querySelectorAll('.o_dialog').length,
                    popover: !!document.querySelector('.o_tl_popover'),
                    sheet: !!document.querySelector('.o_tl_popover_sheet'),
                    error: document.querySelector('.o_error_dialog .modal-body')
                        ?.textContent.slice(0, 300),
                })""")
            except Exception:  # noqa: BLE001 - the page may be gone
                pass
            _logger.warning('EDIT-PROBE-EXC|%s|%r|%s', method.__name__, str(error)[:300], state)
            raise

    def combos(self, probes, viewports=VIEWPORTS):
        found = []
        for scheme in SCHEMES:
            for viewport in viewports:
                if not any((scheme, viewport) in EDIT_VALUES[p] for p in probes):
                    continue
                if scheme == 'dark' and not self.has_theme:
                    continue
                found.append((scheme, viewport))
        if not found:
            self.skipTest('the dark scheme needs web_enterprise, which is not installed')
        return found

    def check(self, probe, element_js, scheme, viewport, label, only=None, override=None,
              skip=()):
        expected = EDIT_VALUES[probe].get((scheme, viewport))
        if expected is None:
            return
        if only:
            expected = {k: v for k, v in expected.items() if k in only}
        if skip:
            expected = {k: v for k, v in expected.items() if k not in skip}
        if override:
            expected = {**expected, **override}
        self.probe(probe, element_js, scheme, viewport, expected, label)

    def mouse(self, kind, x, y, **extra):
        self.browser._websocket_request('Input.dispatchMouseEvent', params={
            'type': kind, 'x': x, 'y': y, **extra,
        })

    def touch_event(self, kind, points):
        self.browser._websocket_request('Input.dispatchTouchEvent', params={
            'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': 1} for x, y in points],
        })

    def box(self, element_js):
        return self.geometry(element_js)

    def wait_for(self, selector_js, what=None):
        self.wait(f"!!({selector_js})")
        self.settle()

    def target_points(self, first_day, last_day):
        """Press point (second half of the first day's cell, bottom part of the row) and the
        release point (first half of the last day's cell) in the only row of H1 or H2's first."""
        row = "document.querySelector('.o_tl_row')"
        first = self.box(_first_cell(row, first_day))
        last = self.box(_first_cell(row, last_day))
        y = first['geometry.y'] + first['geometry.height'] - 12
        x0 = first['geometry.x'] + first['geometry.width'] * 0.75
        x1 = last['geometry.x'] + last['geometry.width'] * 0.25
        return x0, y, x1

    def hold_mouse(self, x0, y, x1):
        """Press at (x0, y), move to x1 in steps and keep the button down."""
        self.mouse('mouseMoved', x0, y)
        self.mouse('mousePressed', x0, y, button='left', buttons=1, clickCount=1)
        steps = 8
        for i in range(1, steps + 1):
            self.mouse('mouseMoved', x0 + (x1 - x0) * i / steps, y, button='left', buttons=1)
            time.sleep(.03)
        self.wait("!!document.querySelector('.o_tl_selection')")
        self.settle()

    def release_mouse(self, x, y):
        self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=1)
        self.settle(500)

    def click_at(self, element_js):
        self.js(f"{element_js}.scrollIntoView({{block: 'nearest', inline: 'nearest'}})")
        self.settle()
        box = self.box(element_js)
        x = box['geometry.x'] + box['geometry.width'] / 2
        y = box['geometry.y'] + box['geometry.height'] / 2
        self.mouse('mouseMoved', x, y)
        self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=1)
        self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=1)
        self.settle(500)

    def close_dialogs(self):
        for _attempt in range(4):
            if not self.js("document.querySelectorAll('.o_dialog').length"):
                break
            for kind in ('keyDown', 'keyUp'):
                self.browser._websocket_request('Input.dispatchKeyEvent', params={
                    'type': kind, 'key': 'Escape', 'code': 'Escape',
                    'windowsVirtualKeyCode': 27, 'nativeVirtualKeyCode': 27,
                })
            self.settle(400)
        self.wait("!document.querySelector('.o_dialog')")
        self.settle()

    def open_edit(self, name='Build'):
        """Click the pill and wait for its popover (or phone sheet)."""
        self.click_at(self.pill(name))
        self.wait_for("document.querySelector('.o_tl_popover_button')")

    # -- M1 to M6: the selection and the pointer shapes ------------------------------

    def test_002b_m1_m4_selection_mouse(self):
        probes = ['M1', 'M2', 'M3', 'M4']
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h1'), scheme, viewport):
                x0, y, x1 = self.target_points(7, 9)
                self.hold_mouse(x0, y, x1)
                self.check('M1', "document.querySelector('.o_tl_selection')", scheme,
                           viewport, 'selection highlight')
                self.check('M2', "document.querySelector('.o_tl_badge_start')", scheme,
                           viewport, 'start badge')
                self.check('M3', "document.querySelector('.o_tl_badge_stop')", scheme,
                           viewport, 'stop badge')
                self.check('M4', "document.querySelector('.o_content')", scheme, viewport,
                           'content area while held')
                self.release_mouse(x1, y)
                self.close_dialogs()

    def test_002b_m5_m6_hover(self):
        for scheme, viewport in self.combos(['M5', 'M6'], ('desktop',)):
            with self.page(HOST.format('h1'), scheme, viewport):
                row = "document.querySelector('.o_tl_row')"
                cell = _first_cell(row, 7)
                box = self.box(cell)
                self.mouse('mouseMoved', box['geometry.x'] + box['geometry.width'] * 0.75,
                           box['geometry.y'] + box['geometry.height'] - 12)
                self.settle()
                self.check('M5', cell, scheme, viewport, 'empty cell of Sunday 8 hovered')
                self.pointer_to(self.pill('Build'))
                self.check('M6', self.pill('Build'), scheme, viewport, 'pill Build hovered')

    # -- M7 to M9: the phone ---------------------------------------------------------

    THURSDAY_HEADER = "document.querySelector('.o_tl_col[data-date=\"2026-11-12\"]')"

    def check_phone_start(self, probe, scheme, viewport, label):
        """The grid as opened (R39 scroll): the column header of Thursday 12 at x 195."""
        self.check(probe, self.THURSDAY_HEADER, scheme, viewport, label)

    def test_002b_m32_m33_phone_start_position(self):
        for scheme, viewport in self.combos(['M32', 'M33'], ('phone',)):
            with self.page(HOST.format('h1'), scheme, viewport, touch=False):
                self.check_phone_start('M32', scheme, viewport, 'Thursday 12 header (phone)')
            with self.page(HOST.format('h1'), scheme, viewport, touch=True):
                self.check_phone_start('M33', scheme, viewport,
                                       'Thursday 12 header (touch phone)')

    def badge_named(self, text):
        return ("[...document.querySelectorAll('.o_tl_badge_start, .o_tl_badge_stop')]"
                f".find((b) => b.textContent.trim() === {json.dumps(text)})")

    def test_002b_m7_m8_selection_phone_mouse(self):
        # the gesture stays between x 150 and x 240, outside both edge zones: nothing scrolls
        for scheme, viewport in self.combos(['M7', 'M8'], ('phone',)):
            with self.page(HOST.format('h1'), scheme, viewport, touch=False):
                self.hold_mouse(160, 401, 230)
                self.check('M7', "document.querySelector('.o_tl_selection')", scheme,
                           viewport, 'selection highlight (phone)')
                self.check('M8', self.badge_named('11/11/2026, 12:00 PM'), scheme,
                           viewport, 'start badge (phone)')
                self.release_mouse(230, 401)
                self.close_dialogs()

    def test_002b_m9_selection_touch_phone(self):
        for scheme, viewport in self.combos(['M9'], ('phone',)):
            with self.page(HOST.format('h1'), scheme, viewport, touch=True):
                x0, y, x1 = 160, 405, 230
                self.touch_event('touchStart', [(x0, y)])
                time.sleep(.7)
                for i in range(1, 9):
                    self.touch_event('touchMove', [(x0 + (x1 - x0) * i / 8, y)])
                    time.sleep(.03)
                self.wait("!!document.querySelector('.o_tl_selection')")
                self.settle()
                self.check('M9', "document.querySelector('.o_tl_selection')", scheme,
                           viewport, 'selection highlight (touch phone)')
                self.touch_event('touchEnd', [])
                self.settle(500)
                self.close_dialogs()

    # -- M10 to M12: the New button ---------------------------------------------------

    NEW_BUTTON = ("[...document.querySelectorAll('.o_control_panel .btn-primary')]"
                  ".find((b) => b.textContent.trim() === 'New')")

    def test_002b_m10_m12_new_button(self):
        for scheme, viewport in self.combos(['M10', 'M11', 'M12']):
            with self.page(HOST.format('h1'), scheme, viewport, touch=False):
                probe = 'M10' if viewport == 'desktop' else 'M11'
                self.check(probe, self.NEW_BUTTON, scheme, viewport, 'New button')
            if viewport == 'phone':
                with self.page(HOST.format('h1'), scheme, viewport, touch=True):
                    self.check('M12', self.NEW_BUTTON, scheme, viewport,
                               'New button (touch)')

    # -- M13 to M25: the dialogs ------------------------------------------------------

    def test_002b_m13_m14_create_dialog(self):
        for scheme, viewport in self.combos(['M13', 'M14']):
            with self.page(HOST.format('h1'), scheme, viewport, touch=False):
                if viewport == 'desktop':
                    x0, y, x1 = self.target_points(7, 9)
                else:
                    box = self.box(_first_cell("document.querySelector('.o_tl_row')", 10))
                    y = box['geometry.y'] + box['geometry.height'] - 12
                    x0 = box['geometry.x'] + box['geometry.width'] * 0.25
                    x1 = box['geometry.x'] + box['geometry.width'] * 0.75
                self.hold_mouse(x0, y, x1)
                self.release_mouse(x1, y)
                self.wait_for("document.querySelector('.o_dialog .modal-dialog')")
                self.check('M13' if viewport == 'desktop' else 'M14', MODAL, scheme, viewport,
                           'create dialog frame')
                self.close_dialogs()

    def test_002b_m15_m25_popover_record_and_confirmation(self):
        probes = [f'M{n}' for n in range(15, 26)]
        for scheme, viewport in self.combos(probes):
            desktop = viewport == 'desktop'
            with self.page(HOST.format('h1'), scheme, viewport, touch=False):
                self.open_edit('Build')
                self.check('M15' if desktop else 'M16', "document.querySelector("
                           "'.o_tl_popover_button')", scheme, viewport, 'popover Edit button')
                self.click_at("document.querySelector('.o_tl_popover_button')")
                self.wait_for("document.querySelector('.o_dialog .o_form_button_remove')")
                self.check('M17' if desktop else 'M18', MODAL, scheme, viewport,
                           'record dialog frame')
                remove = "document.querySelector('.o_dialog .o_form_button_remove')"
                self.check('M19' if desktop else 'M20', remove, scheme, viewport,
                           'Remove button')
                self.click_at(remove)
                self.wait("document.querySelectorAll('.o_dialog').length === 2")
                self.settle(500)
                self.check('M21' if desktop else 'M22',
                           f"{MODAL}.querySelector('.btn-danger')", scheme, viewport,
                           'Delete button')
                if desktop:
                    self.check('M23', f"{MODAL}.querySelector('.modal-footer .btn-secondary')",
                               scheme, viewport, 'keep button')
                self.check('M24' if desktop else 'M25', MODAL, scheme, viewport,
                           'confirmation frame')
                self.close_dialogs()

    def open_confirmation(self):
        self.open_edit('Build')
        self.click_at("document.querySelector('.o_tl_popover_button')")
        self.wait_for("document.querySelector('.o_dialog .o_form_button_remove')")
        self.click_at("document.querySelector('.o_dialog .o_form_button_remove')")
        self.wait("document.querySelectorAll('.o_dialog').length === 2")
        self.settle(500)

    def test_002b_m34_m37_confirmation_box(self):
        """The visible box of the confirmation is its ``.modal-content``, centred vertically."""
        box = f"{MODAL}.querySelector('.modal-content')"
        for scheme, viewport in self.combos(['M34', 'M35', 'M36', 'M37']):
            desktop = viewport == 'desktop'
            with self.page(HOST.format('h1'), scheme, viewport, touch=False):
                self.open_confirmation()
                self.check('M34' if desktop else 'M35', box, scheme, viewport,
                           'confirmation box')
                self.close_dialogs()
            if not desktop:
                with self.page(HOST.format('h1'), scheme, viewport, touch=True):
                    self.open_confirmation()
                    self.check('M36', box, scheme, viewport, 'confirmation box (touch)')
                    self.check('M37', f"{MODAL}.querySelector('.btn-danger')", scheme,
                               viewport, 'Delete button (touch)')
                    self.close_dialogs()

    def test_002b_m26_m27_plan_dialog(self):
        for scheme, viewport in self.combos(['M26', 'M27'], ('desktop',)):
            with self.page(HOST.format('h2'), scheme, viewport, touch=False):
                cell = f"{self.row('Beta')}.querySelector('.o_tl_cell[data-column=\"10\"]')"
                self.click_at(cell)
                self.wait_for("document.querySelector('.o_dialog .o_select_button')")
                self.check('M26', MODAL, scheme, viewport, 'plan dialog frame')
                self.check('M27', "document.querySelector('.o_dialog .o_select_button')",
                           scheme, viewport, 'Select button (nothing selected)')
                self.close_dialogs()

    # -- M28 to M31: popover of the read-only and editable views ----------------------

    TOGGLE = "document.querySelector('.o_tl_popover .o_field_widget[name=\"x_done\"] input')"

    def test_002b_m28_m31_view_button_and_switch(self):
        for scheme, viewport in self.combos(['M28', 'M29', 'M30', 'M31']):
            desktop = viewport == 'desktop'
            with self.page(HOST.format('h19'), scheme, viewport, touch=False):
                self.open_edit('Build')
                self.check('M28' if desktop else 'M31', "document.querySelector("
                           "'.o_tl_popover_button')", scheme, viewport, 'popover View button')
                if desktop:
                    self.check('M29', self.TOGGLE, scheme, viewport, 'Done switch (read-only)')
            if desktop:
                with self.page(HOST.format('h24'), scheme, viewport, touch=False):
                    self.open_edit('Build')
                    self.check('M30', self.TOGGLE, scheme, viewport, 'Done switch (editable)')

    # -- 002a's M75 on a touch phone ------------------------------------------------

    def test_002b_m75_touch_range_line(self):
        for scheme in ('light', 'dark') if self.has_theme else ('light',):
            with self.page(HOST.format('h5'), scheme, 'phone', touch=True):
                self.click_js("document.querySelector('.o_tl_range_button')")
                self.wait("!!document.querySelector('.o_bottom_sheet .o_tl_custom_line')")
                self.settle()
                self.probe('M75', "document.querySelector('.o_tl_custom_line')", scheme, 'phone',
                           {'geometry.width': '358'}, 'custom line on a touch phone')
