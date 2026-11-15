# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes of slice 002b3 (multi-selection, multi-creation and the side panel).

Run only these: ``--test-tags timeline_probes/test_web_gantt:TimelineMultiProbes``. The dark scheme
needs ``web_enterprise``; without it the dark probes are skipped. The values are in
``timeline_multi_probe_values``.

Elements read (the names of the plan's table): M56d, M56p, M57d, M58d and M59d read the row header
label ``.o_tl_row_label`` or the row header ``.o_tl_row_header``.
"""
import json
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

    # -- M71, M72, M73: no text selection in the control panel and the side panel (R1) ----------
    #
    # Elements read: M71 the last breadcrumb item `.o_last_breadcrumb_item` (the action name), M72
    # the search field `.o_searchview_input`, M73 the name of "Unscheduled" in the side panel.

    def test_002b3_m71_m73_no_selection_control_panel(self):
        for scheme, viewport in self.combos(['M71', 'M72', 'M73'], ('desktop',)):
            with self.page(HOST.format('h37'), scheme, viewport):
                self.wait("document.querySelectorAll('.o_tl_panel_line').length === 4")
                self.check('M71', "document.querySelector('.o_last_breadcrumb_item')", scheme,
                           viewport, 'the breadcrumb (the action name)')
                self.check('M72', "document.querySelector('.o_searchview_input')", scheme,
                           viewport, 'the search field')
                self.check('M73', f"{self.panel_line('Unscheduled')}"
                                  ".querySelector('.o_tl_panel_name')", scheme, viewport,
                           'the name of Unscheduled in the side panel')
                # a drag over the action name selects nothing; typing in the field works
                box = self.geometry("document.querySelector('.o_last_breadcrumb_item')")
                y = box['geometry.y'] + box['geometry.height'] / 2
                self.mouse('mouseMoved', box['geometry.x'] + 2, y)
                self.mouse('mousePressed', box['geometry.x'] + 2, y, button='left', buttons=1,
                           clickCount=1)
                self.mouse('mouseMoved', box['geometry.x'] + box['geometry.width'] - 2, y,
                           button='left', buttons=1)
                self.mouse('mouseReleased', box['geometry.x'] + box['geometry.width'] - 2, y,
                           button='left', buttons=0, clickCount=1)
                self.assertEqual(self.js('window.getSelection().toString()'), '')
                self.js("document.querySelector('.o_searchview_input').focus()")
                for char in 'Alp':
                    self.browser._websocket_request('Input.dispatchKeyEvent', params={
                        'type': 'char', 'text': char})
                self.assertEqual(
                    self.js("document.querySelector('.o_searchview_input').value"), 'Alp')

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

    # -- the template form popover and the new pill: M17 to M27 (R10, R11) -----------------------
    #
    # Elements read: M17 the popover `.o_popover` holding `.o_multi_create_popover`; M18 and M19
    # its two time inputs `.o_time_picker_input`; M20 the arrow icon `i.oi`; M21 `.o_form_renderer`;
    # M22 and M23 the footer buttons `.btn-primary` and `.btn-secondary`; M24 `.popover-footer`;
    # M25 the new pill titled "Sprint" (M26's place must stay empty); M27 the popover of H35.

    POPOVER = "document.querySelector('.o_multi_create_popover').closest('.o_popover')"

    def open_popover(self):
        """Click the Add button of the selection buttons and wait for the popover."""
        box = self.geometry(f"{self.BUTTONS}.querySelector('[data-tooltip=\"Add\"]')")
        self.click_at(box['geometry.x'] + box['geometry.width'] / 2,
                      box['geometry.y'] + box['geometry.height'] / 2)
        self.wait("!!document.querySelector('.o_multi_create_popover .o_form_renderer')")
        self.settle(500)

    def type_name(self, name):
        self.js(f"""(() => {{
            const input = document.querySelector(
                '.o_multi_create_popover .o_field_widget[name="name"] input');
            input.focus();
            input.value = {json.dumps(name)};
            input.dispatchEvent(new Event('input', {{bubbles: true}}));
            input.dispatchEvent(new Event('change', {{bubbles: true}}));
        }})()""")
        self.settle(200)

    def test_002b3_m17_m24_template_popover(self):
        probes = ['M17', 'M18', 'M19', 'M20', 'M21', 'M22', 'M23', 'M24']
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h34'), scheme, viewport):
                self.click_at(452, 470)
                self.open_popover()
                popover = self.POPOVER
                self.check('M17', popover, scheme, viewport, 'the popover')
                inputs = f"{popover}.querySelectorAll('.o_time_picker_input')"
                self.check('M18', f"{inputs}[0]", scheme, viewport, 'the start time')
                self.check('M19', f"{inputs}[1]", scheme, viewport, 'the end time')
                self.check('M20', f"{popover}.querySelector('i.oi')", scheme, viewport,
                           'the arrow between the times')
                self.check('M21', f"{popover}.querySelector('.o_form_renderer')", scheme,
                           viewport, 'the template form')
                self.check('M22', f"{popover}.querySelector('.popover-footer .btn-primary')",
                           scheme, viewport, 'the Add button of the popover')
                self.check('M23', f"{popover}.querySelector('.popover-footer .btn-secondary')",
                           scheme, viewport, 'the Discard button of the popover')
                self.check('M24', f"{popover}.querySelector('.popover-footer')", scheme,
                           viewport, 'the footer of the popover')

    def test_002b3_m25_new_pill(self):
        for scheme, viewport in self.combos(['M25', 'M26'], ('desktop',)):
            # the record of the scheme before is not part of this one's picture
            self.env['test.web.gantt.pill'].search([('name', '=', 'Sprint')]).unlink()
            with self.page(HOST.format('h34'), scheme, viewport):
                self.click_at(452, 470)
                self.open_popover()
                self.type_name('Sprint')
                box = self.geometry(f"{self.POPOVER}.querySelector('.popover-footer .btn-primary')")
                self.click_at(box['geometry.x'] + box['geometry.width'] / 2,
                              box['geometry.y'] + box['geometry.height'] / 2)
                self.wait("!document.querySelector('.o_multi_create_popover')")
                self.settle(800)
                sprints = self.js("[...document.querySelectorAll('.o_tl_pill')].filter("
                                  "(p) => p.textContent.trim() === 'Sprint').length")
                self.assertEqual(sprints, 1, 'decision D1: one record for the clicked day')
                # M25 measured the pill's slot: the pill (96 wide, 25 high there) with the 1 px
                # inset of 002a's pills (94 by 23, drawn at 454, 451) added back on each side
                pill = self.geometry(self.pill('Sprint'))
                slot = {
                    'geometry.x': pill['geometry.x'] - 1, 'geometry.y': pill['geometry.y'] - 1,
                    'geometry.width': pill['geometry.width'] + 2,
                    'geometry.height': pill['geometry.height'] + 2,
                }
                # and the pill's own box directly, so that a size regression cannot hide
                # behind the delta above
                for prop, want in {
                    'geometry.x': 454, 'geometry.y': 451,
                    'geometry.width': 94, 'geometry.height': 23,
                }.items():
                    with self.subTest(probe='M25', scheme=scheme, prop=prop, own_box=True):
                        self.assertAlmostEqual(float(pill[prop]), float(want), delta=1,
                                               msg='the new pill drawn as 002a\'s pills')
                for prop, want in MEASURED['M25'][(scheme, viewport)].items():
                    with self.subTest(probe='M25', scheme=scheme, viewport=viewport, prop=prop):
                        self.assertAlmostEqual(float(slot[prop]), float(want), delta=1,
                                               msg='the one new pill in Beta / Undefined Contact')
                # M26 (the original's second pill, a defect) has no element in Complete
                expected = MEASURED['M26'][(scheme, viewport)]
                at_lower = self.js(f"""[...document.querySelectorAll('.o_tl_pill')].some((p) => {{
                    const r = p.getBoundingClientRect();
                    return Math.abs(r.left - {expected['geometry.x']}) < 1
                        && Math.abs(r.top - {expected['geometry.y']}) < 1;
                }})""")
                self.assertFalse(at_lower, "no second pill at M26's place")

    def test_002b3_m27_date_only_popover(self):
        for scheme, viewport in self.combos(['M27'], ('desktop',)):
            with self.page(HOST.format('h35'), scheme, viewport):
                # Saturday 14 of the first row: the column's place depends on the host's layout
                column = self.geometry(
                    "document.querySelector('.o_tl_col[data-date=\"2026-11-14\"]')")
                row = self.geometry("document.querySelector('.o_tl_row[data-row-id]')")
                self.click_at(column['geometry.x'] + column['geometry.width'] / 2,
                              row['geometry.y'] + row['geometry.height'] - 4)
                self.assertEqual(
                    self.js("document.querySelectorAll('.o_tl_cell_picked').length"), 2)
                # no record under the day: the count 0 and no Delete, as in the capture (the
                # popover is centred under Add, whose place depends on the group of buttons)
                self.assertEqual(
                    self.js("[...document.querySelectorAll('.o_multi_selection_buttons button')]"
                            ".map((b) => b.dataset.tooltip || b.textContent.trim())"),
                    ['Unselect All', 'Add'],
                    self.js("JSON.stringify([...document.querySelectorAll('.o_tl_pill')].map("
                            "(p) => [p.textContent.trim(), p.getBoundingClientRect().left, "
                            "p.getBoundingClientRect().right]))"))
                self.open_popover()
                self.assertFalse(self.js("!!document.querySelector('.o_time_picker_input')"),
                                 'a date-only model shows no time fields')
                self.check('M27', self.POPOVER, scheme, viewport,
                           'the popover without time fields')

    # -- the side panel: M28, M29, M37, M38, M50 to M52, M54, M55 (R17, R18) ---------------------
    #
    # Elements read: M28 and M52 the grid box `.o_tl_box`, M29 the panel `.o_tl_panel`, M37 and
    # M51 the panel button `.o_tl_panel_toggle`, M38 its icon, M50 the count text
    # `.o_tl_panel_count`. Without a panel (M54d, M54p, M55p) the box carries the geometry, the
    # margins and the padding, and its scroll area `.o_tl_renderer` the line above the headers
    # (002a puts that line on the scroll area, not on the box), so those probes read both.

    PANEL_BOX = "document.querySelector('.o_tl_box')"
    TOGGLE = "document.querySelector('.o_tl_panel_toggle')"

    def check_keys(self, probe, element_js, scheme, viewport, label, keep):
        """The expected values of ``probe`` whose property satisfies ``keep``."""
        expected = MEASURED[probe].get((scheme, viewport))
        if expected is not None:
            self.probe(probe, element_js, scheme, viewport,
                       {k: v for k, v in expected.items() if keep(k)}, label)

    def test_002b3_m28_m38_panel_open(self):
        probes = ['M28', 'M29', 'M37', 'M38']
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h37'), scheme, viewport):
                self.wait("!!document.querySelector('.o_tl_panel')")
                self.settle(500)
                self.check('M28', self.PANEL_BOX, scheme, viewport, 'the grid box, panel open')
                self.check('M29', "document.querySelector('.o_tl_panel')", scheme, viewport,
                           'the side panel')
                self.check('M37', self.TOGGLE, scheme, viewport, 'the panel button, open')
                self.check('M38', f"{self.TOGGLE}.querySelector('i')", scheme, viewport,
                           'the icon of the panel button, open')

    def test_002b3_m50_m52_panel_closed(self):
        probes = ['M50', 'M51', 'M52']
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h37'), scheme, viewport):
                self.wait("!!document.querySelector('.o_tl_panel')")
                self.js(f"{self.TOGGLE}.click()")
                self.wait("!document.querySelector('.o_tl_panel')")
                self.wait("!!document.querySelector('.o_tl_panel_count')")
                self.settle(500)
                # the text follows the count and the language: the box is compared by its right
                # edge (8 px before the button, x 1540), its top, height and styles, not by its x
                # and width (M50 leaves them out)
                count = "document.querySelector('.o_tl_panel_count')"
                self.check('M50', count, scheme, viewport, 'the count text before the button')
                text = self.geometry(count)
                self.assertAlmostEqual(text['geometry.x'] + text['geometry.width'], 1540, delta=.5,
                                       msg='the right edge of the count text')
                self.check('M51', self.TOGGLE, scheme, viewport, 'the panel button, closed')
                self.check('M52', self.PANEL_BOX, scheme, viewport, 'the grid box, panel closed')

    def check_without_panel(self, probe, scheme, viewport, sample):
        """The box of a view without panel. In the sample state the measured box is the scrolling
        area that carries the top line (92 px: the two header lines only, the no-content help
        lies outside it; M54d, M54p): every property is read from it. Otherwise the box carries
        the geometry, the margins and the padding and its scroll area the line above the headers
        (002a puts that line on the scroll area, not on the box)."""
        line = "document.querySelector('.o_tl_renderer')"
        around = ('margin-', 'padding-')
        if sample:
            self.check(probe, line, scheme, viewport, 'the scrolling area, no panel')
        else:
            self.check_keys(probe, self.PANEL_BOX, scheme, viewport, 'the grid box, no panel',
                            lambda k: k.startswith(around) or k.startswith('geometry'))
            self.check_keys(probe, line, scheme, viewport, 'the scroll area, no panel',
                            lambda k: not k.startswith(around)
                            and (k.startswith('border-top-width')
                                 or k.startswith('border-top-style')))
        self.assertFalse(self.js("!!document.querySelector('.o_tl_panel_toggle')"),
                         'no panel button')
        self.assertFalse(self.js("!!document.querySelector('.o_tl_panel')"), 'no panel')

    def test_002b3_m54d_sample_no_panel_desktop(self):
        for scheme, viewport in self.combos(['M54d'], ('desktop',)):
            with self.page(HOST.format('h38'), scheme, viewport):
                self.wait("!!document.querySelector('.o_tl_box_sample')")
                self.settle(500)
                self.check_without_panel('M54d', scheme, viewport, sample=True)

    def test_002b3_m54p_sample_no_panel_phone(self):
        for scheme, viewport in self.combos(['M54p'], ('phone',)):
            with self.page(HOST.format('h38'), scheme, viewport, touch=False):
                self.wait("!!document.querySelector('.o_tl_box_sample')")
                self.settle(500)
                self.check_without_panel('M54p', scheme, viewport, sample=True)

    def test_002b3_m55p_no_panel_phone(self):
        for scheme, viewport in self.combos(['M55p'], ('phone',)):
            with self.page(HOST.format('h37'), scheme, viewport, touch=False):
                self.wait("!!document.querySelector('.o_tl_row[data-row-id]')")
                self.settle(500)
                self.check_without_panel('M55p', scheme, viewport, sample=False)

    # -- the list of the panel: M30 to M33, M39, M53 (R19) -----------------------------------------
    #
    # Elements read: M30 the title `.o_tl_panel_title`, M31 the line `.o_tl_panel_line` of
    # "Unscheduled", M32 its handle `.o_tl_panel_handle`, M33 its name `.o_tl_panel_name`, M39 the
    # handle of the line "Gamma" under the pointer, M53 the Load more button `.o_tl_panel_more`.

    @staticmethod
    def panel_line(name):
        return ("[...document.querySelectorAll('.o_tl_panel_line')].find("
                f"(l) => l.querySelector('.o_tl_panel_name').textContent === {name!r})")

    def test_002b3_m30_m33_list_at_rest(self):
        probes = ['M30', 'M31', 'M32', 'M33']
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h37'), scheme, viewport):
                self.wait("document.querySelectorAll('.o_tl_panel_line').length === 4")
                self.pointer_away()
                line = self.panel_line('Unscheduled')
                self.check('M30', "document.querySelector('.o_tl_panel_title')", scheme,
                           viewport, 'the panel title')
                self.check('M31', line, scheme, viewport, 'the line Unscheduled')
                self.check('M32', f"{line}.querySelector('.o_tl_panel_handle')", scheme, viewport,
                           'the handle of the line Unscheduled')
                # the name's width follows the text and the font: only what is not geometry
                self.check_keys('M33', f"{line}.querySelector('.o_tl_panel_name')", scheme,
                                viewport, 'the name of the line Unscheduled',
                                lambda k: not k.startswith('geometry.')
                                or k in ('geometry.x', 'geometry.y'))

    def test_002b3_m39_handle_hover(self):
        for scheme, viewport in self.combos(['M39'], ('desktop',)):
            with self.page(HOST.format('h37'), scheme, viewport):
                self.wait("document.querySelectorAll('.o_tl_panel_line').length === 4")
                handle = f"{self.panel_line('Gamma')}.querySelector('.o_tl_panel_handle')"
                self.pointer_to(handle)
                self.check('M39', handle, scheme, viewport, 'the handle of Gamma under the pointer')

    # -- the resize strip: M34 to M36 (R20) -------------------------------------------------------
    #
    # Elements read: M34 and M36 the strip `.o_tl_panel_strip`, M35 its line
    # `.o_tl_panel_strip_line`; M36 with the pointer at (1313, 520).

    STRIP = "document.querySelector('.o_tl_panel_strip')"

    def test_002b3_m34_m35_strip_at_rest(self):
        for scheme, viewport in self.combos(['M34', 'M35'], ('desktop',)):
            with self.page(HOST.format('h37'), scheme, viewport):
                self.wait("!!document.querySelector('.o_tl_panel_strip')")
                self.pointer_away()
                self.check('M34', self.STRIP, scheme, viewport, 'the resize strip at rest')
                self.check('M35', f"{self.STRIP}.querySelector('.o_tl_panel_strip_line')", scheme,
                           viewport, 'the line in the resize strip at rest')

    def test_002b3_m36_strip_hover(self):
        for scheme, viewport in self.combos(['M36'], ('desktop',)):
            with self.page(HOST.format('h37'), scheme, viewport):
                self.wait("!!document.querySelector('.o_tl_panel_strip')")
                self.mouse('mouseMoved', 1313, 520)
                self.settle(500)
                self.check('M36', self.STRIP, scheme, viewport,
                           'the resize strip under the pointer')

    def test_002b3_m53_load_more(self):
        queue = self.env['test.web.gantt.pill'].create(
            [{'name': f'Queue {i:02d}'} for i in range(1, 23)])
        try:
            for scheme, viewport in self.combos(['M53'], ('desktop',)):
                with self.page(HOST.format('h36'), scheme, viewport):
                    self.wait("!!document.querySelector('.o_tl_panel_more')")
                    self.js("(() => { const p = document.querySelector('.o_tl_panel');"
                            " p.scrollTop = p.scrollHeight; })()")
                    self.pointer_away()
                    self.check('M53', "document.querySelector('.o_tl_panel_more')", scheme,
                               viewport, 'the Load more button, the panel scrolled to its end')
        finally:
            queue.unlink()

    # -- dragging a line onto the grid: M40 to M47 (R21) -------------------------------------------
    #
    # Elements read: M40 the highlight `.o_tl_selection.o_tl_drop`, M41 the copy that follows the
    # pointer `.o_tl_panel_ghost`, M42 its handle, M43 the line left in the list, M44 and M45 the
    # badges `.o_tl_badge_start` and `.o_tl_badge_stop`, M46 the cursor of the view root
    # `.o_timeline_view`, M47 the new pill "Unscheduled" (after the release). The line is pressed
    # at its centre (the copy's x is 1000 - 131) and moved in steps to (1000, 335).

    def hold_line(self, name='Unscheduled', to=(1000, 335)):
        box = self.geometry(self.panel_line(name))
        x0 = box['geometry.x'] + box['geometry.width'] / 2
        y0 = box['geometry.y'] + box['geometry.height'] / 2
        self.mouse('mouseMoved', x0, y0)
        self.mouse('mousePressed', x0, y0, button='left', buttons=1, clickCount=1)
        for i in range(1, 7):
            self.mouse('mouseMoved', x0 + (to[0] - x0) * i / 6, y0 + (to[1] - y0) * i / 6,
                       button='left', buttons=1)
            time.sleep(.05)
        self.settle(300)

    def test_002b3_m40_m47_schedule_drag(self):
        probes = ['M40', 'M41', 'M42', 'M43', 'M44', 'M45', 'M46', 'M47']
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h37'), scheme, viewport):
                self.wait("document.querySelectorAll('.o_tl_panel_line').length === 4")
                self.hold_line()
                self.wait("!!document.querySelector('.o_tl_panel_ghost')")
                # the x of the highlight and the badges is checked: the first scroll puts Thursday
                # 12 at x 819 with the panel open (R18), so its second half starts at 915
                self.check('M40', "document.querySelector('.o_tl_selection.o_tl_drop')", scheme,
                           viewport, 'the target highlight')
                ghost = "document.querySelector('.o_tl_panel_ghost')"
                self.check('M41', ghost, scheme, viewport, 'the line that follows the pointer')
                self.check('M42', f"{ghost}.querySelector('.o_tl_panel_handle')", scheme,
                           viewport, 'the handle of the line that follows the pointer')
                self.check('M43', self.panel_line('Unscheduled'), scheme, viewport,
                           'the line left in the list')
                self.check('M44', "document.querySelector('.o_tl_badge_start')", scheme,
                           viewport, 'the start badge')
                self.check('M45', "document.querySelector('.o_tl_badge_stop')", scheme,
                           viewport, 'the stop badge')
                self.check('M46', "document.querySelector('.o_timeline_view')", scheme, viewport,
                           'the pointer shape over the view')
                self.mouse('mouseReleased', 1000, 335, button='left', buttons=0, clickCount=1)
                self.settle(800)
                self.wait("!!document.querySelector('.o_tl_pill')")
                # M47 measured the pill's slot: the pill's box with the 1 px inset added back
                pill = self.geometry(self.pill('Unscheduled'))
                slot = {
                    'geometry.x': pill['geometry.x'] - 1,
                    'geometry.y': pill['geometry.y'] - 1,
                    'geometry.width': pill['geometry.width'] + 2,
                    'geometry.height': pill['geometry.height'] + 2,
                }
                for prop, want in MEASURED['M47'][(scheme, viewport)].items():
                    if prop in slot:
                        with self.subTest(probe='M47', scheme=scheme, prop=prop):
                            self.assertAlmostEqual(float(slot[prop]), float(want), delta=1,
                                                   msg='the new pill Unscheduled in the Beta row')
                # the write is the test's own: put the record back for the next scheme
                self.env['test.web.gantt.pill'].search([('name', '=', 'Unscheduled')]).write(
                    {'date_start': False, 'date_stop': False})

    # -- the drop zone while a pill is moved: M48, M49 (R22) ---------------------------------------
    #
    # Elements read: M48 the drop zone `.o_tl_panel_dropzone`, M49 the moved pill
    # `.o_tl_pill_moved`. "Unscheduled" is scheduled by a write of the probe (Thursday 12 from
    # 12:00, Parent Beta), pressed 40 px left of its centre and moved to (1450, 420), held.

    def test_002b3_m48_m49_drop_zone(self):
        probes = ['M48', 'M49', 'M74']
        record = self.env['test.web.gantt.pill'].search([('name', '=', 'Unscheduled')])
        beta = self.env['test.web.gantt.pill'].search([('name', '=', 'Beta')], limit=1)
        for scheme, viewport in self.combos(probes, ('desktop',)):
            # Thursday 12, 12:00 to Friday 13, 12:00 on the host's clock (zone three hours ahead)
            record.write({'date_start': '2026-11-12 09:00:00', 'date_stop': '2026-11-13 09:00:00',
                          'parent_id': beta.id})
            with self.page(HOST.format('h37'), scheme, viewport):
                self.wait(f"!!({self.pill('Unscheduled')})")
                box = self.geometry(self.pill('Unscheduled'))
                x0 = box['geometry.x'] + box['geometry.width'] / 2 - 40
                y0 = box['geometry.y'] + box['geometry.height'] / 2
                self.mouse('mouseMoved', x0, y0)
                self.mouse('mousePressed', x0, y0, button='left', buttons=1, clickCount=1)
                for i in range(1, 7):
                    self.mouse('mouseMoved', x0 + (1450 - x0) * i / 6, y0 + (420 - y0) * i / 6,
                               button='left', buttons=1)
                    time.sleep(.05)
                self.settle(300)
                self.wait("!!document.querySelector('.o_tl_panel_dropzone')")
                self.check('M48', "document.querySelector('.o_tl_panel_dropzone')", scheme,
                           viewport, 'the drop zone')
                self.check('M74', "document.querySelector('.o_tl_panel_dropzone_text')", scheme,
                           viewport, 'the text of the drop zone')
                # the pill follows the pointer, pressed 40 px left of its centre: its x does not
                # depend on where the grid sits
                self.check('M49', "document.querySelector('.o_tl_pill_moved')", scheme,
                           viewport, 'the moved pill over the panel')
                self.mouse('mouseReleased', 1450, 420, button='left', buttons=0, clickCount=1)
                self.settle(800)
            record.write({'date_start': False, 'date_stop': False})

    # -- the row header and the first scroll with the panel: M60 to M70 (R18) ---------------------
    #
    # Elements read: the row header column (M60, M62, M64, M66, M68) is the rectangle from the top
    # of the first row header to the bottom of the last one, the column header of Thursday 12
    # (M61, M63, M65, M67, M69) is `.o_tl_col[data-date="2026-11-12"]`, M70 the side panel.

    HEADER_COLUMN = """(() => {
        const rects = [...document.querySelectorAll('.o_tl_row_header')]
            .map((h) => h.getBoundingClientRect());
        const left = Math.min(...rects.map((r) => r.left));
        const top = Math.min(...rects.map((r) => r.top));
        return {'geometry.x': left, 'geometry.y': top,
                'geometry.width': Math.max(...rects.map((r) => r.right)) - left,
                'geometry.height': Math.max(...rects.map((r) => r.bottom)) - top};
    })()"""
    THURSDAY = "document.querySelector('.o_tl_col[data-date=\"2026-11-12\"]')"

    def check_header_column(self, probe, scheme, viewport):
        measured = self.js(self.HEADER_COLUMN)
        for prop, want in MEASURED[probe][(scheme, viewport)].items():
            with self.subTest(probe=probe, scheme=scheme, viewport=viewport, prop=prop,
                              element='the row header column'):
                self.assertAlmostEqual(float(measured[prop]), float(want), delta=1,
                                       msg=f'{probe} {prop}')

    def reopen(self):
        """Open the page again in the same browser: the storage keeps the panel's state."""
        self.js('location.reload()')
        time.sleep(1)
        self.wait("!!document.querySelector('.o_tl_renderer .o_tl_row')", timeout=60)
        self.wait("document.readyState === 'complete'")
        self.settle(800)

    def test_002b3_m60_m70_row_header_and_first_scroll(self):
        probes = [f'M{n}' for n in range(60, 71)]
        for scheme, viewport in self.combos(probes, ('desktop',)):
            with self.page(HOST.format('h37'), scheme, viewport):
                self.wait("!!document.querySelector('.o_tl_panel')")
                self.settle(500)
                self.check_header_column('M60', scheme, viewport)
                self.check('M61', self.THURSDAY, scheme, viewport, 'Thursday 12, panel open')
                self.js(f"{self.TOGGLE}.click()")
                self.wait("!document.querySelector('.o_tl_panel')")
                self.settle(500)
                self.check_header_column('M62', scheme, viewport)
                self.check('M63', self.THURSDAY, scheme, viewport, 'Thursday 12, panel closed')
                self.reopen()
                self.assertFalse(self.js("!!document.querySelector('.o_tl_panel')"),
                                 'the panel opens as it was left: closed')
                self.check_header_column('M64', scheme, viewport)
                self.check('M65', self.THURSDAY, scheme, viewport,
                           'Thursday 12, opened with the panel remembered as closed')
                self.js(f"{self.TOGGLE}.click()")
                self.wait("!!document.querySelector('.o_tl_panel')")
                self.settle(500)
                self.check_header_column('M66', scheme, viewport)
                self.check('M67', self.THURSDAY, scheme, viewport,
                           'Thursday 12, panel opened again')
                strip = self.geometry(self.STRIP)
                x = strip['geometry.x'] + strip['geometry.width'] / 2
                y = strip['geometry.y'] + 200
                self.mouse('mouseMoved', x, y)
                self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=1)
                for i in range(1, 7):
                    self.mouse('mouseMoved', x - 50 * i, y, button='left', buttons=1)
                    time.sleep(.05)
                self.mouse('mouseReleased', x - 300, y, button='left', buttons=0, clickCount=1)
                self.settle(500)
                self.check_header_column('M68', scheme, viewport)
                self.check('M69', self.THURSDAY, scheme, viewport,
                           'Thursday 12, panel dragged to 562 px')
                self.check('M70', "document.querySelector('.o_tl_panel')", scheme, viewport,
                           'the side panel, 562 px wide')

    # -- the first centring (002a R39, 002b3 R18) with and without the panel -----------------------

    CENTRE = """(() => {
        const grid = document.querySelector('.o_tl_renderer');
        const box = grid.getBoundingClientRect();
        const title = grid.querySelector('.o_tl_title_cell').getBoundingClientRect();
        const panel = document.querySelector('.o_tl_panel');
        const frame = document.querySelector('.o_tl_frame');
        const content = panel ? frame.clientWidth : grid.clientWidth;
        const place = title.right
            + (content - title.width - (panel ? panel.getBoundingClientRect().width : 0)) / 2;
        const today = document.querySelector('.o_tl_col.o_tl_is_today').getBoundingClientRect();
        const middle = (title.right + box.left + grid.clientLeft + grid.clientWidth) / 2;
        return {place, middle, start: today.left};
    })()"""

    def test_002b3_centre_of_the_first_scroll(self):
        """Today's column starts at half of (content width - row header - open panel) from the
        cells' left edge: with the panel that is right of the middle of the visible cells,
        without a panel it is the middle."""
        for action in ('h37', 'h34'):
            with self.page(HOST.format(action), 'light', 'desktop'):
                self.wait("!!document.querySelector('.o_tl_col.o_tl_is_today')")
                self.settle(800)
                measured = self.js(self.CENTRE)
                with_panel = action == 'h37'
                self.assertEqual(bool(self.js("!!document.querySelector('.o_tl_panel')")),
                                 with_panel)
                self.assertAlmostEqual(measured['start'], measured['place'], delta=2,
                                       msg=f'{action}: the day starts at the place {measured}')
                if not with_panel:
                    self.assertAlmostEqual(measured['place'], measured['middle'], delta=1,
                                           msg=f'{action}: no panel, the middle {measured}')
