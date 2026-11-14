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

    # -- selecting cells: M1 to M3, M12 to M16 (R3, R5, R15) ----------------------------------
    #
    # Elements read: M1, M2, M3, M15 and M16 read one `.o_tl_cell_picked` (the first one of the
    # row they name, or the one under Friday 13 for M16); M12 an empty cell `.o_tl_cell` of a
    # record row, M13 a row header `.o_tl_row_header`, M14 a column header `.o_tl_col`.

    def row_after(self, title):
        """The row that follows the group row titled ``title`` (its first sub row)."""
        return (f"{self.row(title)}.nextElementSibling")

    def picked_in(self, row_js):
        return f"{row_js}.querySelector('.o_tl_cell_picked')"

    def draw_h34(self, release):
        """Press at (600, 470), move in steps to (790, 633) and hold; release when asked."""
        self.mouse('mouseMoved', 600, 470)
        self.mouse('mousePressed', 600, 470, button='left', buttons=1, clickCount=1)
        for x, y in ((650, 500), (700, 560), (750, 600), (790, 633)):
            self.mouse('mouseMoved', x, y, button='left', buttons=1)
            time.sleep(.05)
        self.settle(300)
        if release:
            self.mouse('mouseReleased', 790, 633, button='left', buttons=0, clickCount=1)
            self.settle(300)

    def click_at(self, x, y, modifiers=0):
        self.mouse('mouseMoved', x, y, modifiers=modifiers)
        self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=1,
                   modifiers=modifiers)
        self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=1,
                   modifiers=modifiers)
        self.settle(400)

    def test_002b3_m1_m3_drawing_and_selection(self):
        probes = ['M1', 'M2', 'M3']
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h34'), scheme, viewport):
                beta = self.picked_in(self.row_after('Beta'))
                self.draw_h34(release=False)
                self.check('M1', beta, scheme, viewport, 'first highlight, button held')
                self.draw_h34_release()
                self.check('M2', beta, scheme, viewport, 'first highlight after release')
                self.check('M3', self.picked_in(self.row('Gamma')), scheme, viewport,
                           'highlight in the Gamma group row')

    def draw_h34_release(self):
        self.mouse('mouseReleased', 790, 633, button='left', buttons=0, clickCount=1)
        self.settle(300)

    def test_002b3_m12_m14_pointer_shapes(self):
        for scheme, viewport in self.combos(['M12', 'M13', 'M14'], ('desktop',)):
            with self.page(HOST.format('h34'), scheme, viewport):
                self.click_at(452, 470)
                picked = self.js("document.querySelectorAll('.o_tl_cell_picked').length")
                self.assertTrue(picked > 0)
                row = self.row_after('Beta')
                monday = "document.querySelector('.o_tl_col[data-date=\"2026-11-09\"]')"
                cell = f"{row}.querySelectorAll('.o_tl_cell')[{monday}.dataset.index * 1]"
                self.check('M12', cell, scheme, viewport, 'an empty cell of a record row')
                self.check('M13', f"{row}.querySelector('.o_tl_row_header')", scheme, viewport,
                           'a row header')
                self.check('M14', monday, scheme, viewport, 'the column header Monday 9')

    def test_002b3_m15_column_selection(self):
        for scheme, viewport in self.combos(['M15'], ('desktop',)):
            with self.page(HOST.format('h34'), scheme, viewport):
                self.click_at(452, 194)
                self.click_at(835, 194, modifiers=8)
                first_row = "document.querySelector('.o_tl_row[data-row-id]')"
                self.check('M15', self.picked_in(first_row), scheme, viewport,
                           'first highlight of the Undefined Parent group row')

    def test_002b3_m16_row_selection(self):
        for scheme, viewport in self.combos(['M16'], ('desktop',)):
            with self.page(HOST.format('h34'), scheme, viewport):
                self.click_at(100, 511)
                # after the scroll of the row header click: the cell under Friday 13, first half
                friday = "document.querySelector('.o_tl_col[data-date=\"2026-11-13\"]')"
                row = f"({HEADERS.format(title='Host Contact 2')}.at(-1)).closest('.o_tl_row')"
                cell = (f"[...{row}.querySelectorAll('.o_tl_cell_picked')].find((c) => "
                        f"Math.abs(c.getBoundingClientRect().left - "
                        f"{friday}.getBoundingClientRect().left) < 1)")
                self.check('M16', cell, scheme, viewport,
                           'highlight under Friday 13 of Beta / Douglas Fletcher')

    # -- the selection buttons: M4 to M11 (R8) -----------------------------------------------------
    #
    # Elements read: M4 the Community root `.o_multi_selection_buttons`; M5, M6, M7 the count box
    # `.o_selection_box .list-group-item`, its `b` and `.o_unselect_all`; M8 the Add button,
    # M9 the Delete button and M10 its icon, M11 `.o_tl_multi_plan`.

    BUTTONS = "document.querySelector('.o_multi_selection_buttons')"

    def test_002b3_m4_m10_selection_buttons(self):
        probes = ['M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10']
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h34'), scheme, viewport):
                self.draw_h34(release=True)
                root = self.BUTTONS
                self.check('M4', root, scheme, viewport, 'the group of selection buttons')
                self.check('M5', f"{root}.querySelector('.o_selection_box .list-group-item')",
                           scheme, viewport, 'the count box')
                self.check('M6', f"{root}.querySelector('.o_selection_box b')", scheme,
                           viewport, 'the count number')
                self.check('M7', f"{root}.querySelector('.o_unselect_all')", scheme, viewport,
                           'the cross')
                self.check('M8', f"{root}.querySelector('[data-tooltip=\"Add\"]')", scheme,
                           viewport, 'the Add button')
                delete = f"{root}.querySelector('[data-tooltip=\"Delete\"]')"
                self.check('M9', delete, scheme, viewport, 'the Delete button')
                self.check('M10', f"{delete}.querySelector('i')", scheme, viewport,
                           'the bin icon')

    def test_002b3_m11_plan_button(self):
        for scheme, viewport in self.combos(['M11'], ('desktop',)):
            with self.page(HOST.format('h34'), scheme, viewport):
                self.mouse('mouseMoved', 560, 470)
                self.mouse('mousePressed', 560, 470, button='left', buttons=1, clickCount=1)
                for x in (570, 580, 585):
                    self.mouse('mouseMoved', x, 470, button='left', buttons=1)
                    time.sleep(.05)
                self.mouse('mouseReleased', 585, 470, button='left', buttons=0, clickCount=1)
                self.settle(400)
                picked = self.js("document.querySelectorAll('.o_tl_cell_picked').length")
                self.assertEqual(picked, 1)
                self.check('M11', f"{self.BUTTONS}.querySelector('.o_tl_multi_plan')", scheme,
                           viewport, 'the Plan button')
