# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes: the host views in a real Chrome, compared with the measured values of the spec.

Run only these: ``--test-tags timeline_probes/test_web_gantt``. The dark scheme needs
``web_enterprise``; without it the dark probes are skipped.

One browser session per host and (scheme, viewport): a test method opens the host once and runs
the probe groups of that host one after the other. Elements that stick to the grid are read
resting and again after the grid was scrolled, so a value on the wrong element would show.
"""
import json
from datetime import datetime, time, timedelta

from odoo import fields
from odoo.tests import tagged

from .timeline_probe import TimelineProbeCase, compare_value
from .timeline_probe_values import MEASURED

SCHEMES = ('light', 'dark')
VIEWPORTS = ('desktop', 'phone')

PILL_NAMES = (
    # probe, name
    ('M1', 'Plan'), ('M2', 'Design'), ('M3', 'Build'), ('M4', 'Review'), ('M5', 'Test'),
    ('M6', 'Deploy'), ('M7', 'Long task'), ('M8', 'Overlap A'), ('M9', 'Overlap B'),
    ('M10', 'Overlap C'), ('M11', 'Color ten'), ('M12', 'Color eleven'),
)

# O-5: the light gradients of group rows (the table gives the dark ones)
LIGHT_OPEN = 'linear-gradient(rgb(248, 249, 250), rgb(233, 236, 239))'
LIGHT_CLOSED = 'linear-gradient(rgb(233, 236, 239), rgb(248, 249, 250))'
NEUTRAL_GREY = 'rgba(179, 180, 184, 1)'


def _first_cell(row_js, today):
    cls = '.o_tl_cell.o_tl_is_today' if today else '.o_tl_cell:not(.o_tl_is_today)'
    return f"{row_js}.querySelector('{cls}')"


def _header(row_js):
    return f"{row_js}.querySelector('.o_tl_row_header')"


@tagged('post_install', '-at_install', 'timeline_probes')
class TimelineProbes(TimelineProbeCase):

    # -- helpers --------------------------------------------------------------------

    def combos(self, probes, schemes=SCHEMES, viewports=VIEWPORTS):
        """The (scheme, viewport) pairs the table has for any of ``probes``."""
        found = []
        for scheme in schemes:
            for viewport in viewports:
                if not any((scheme, viewport) in MEASURED[p] for p in probes):
                    continue
                if scheme == 'dark' and not self.has_theme:
                    continue
                found.append((scheme, viewport))
        if not found:
            self.skipTest('the dark scheme needs web_enterprise, which is not installed')
        return found

    def check(self, probe, element_js, scheme, viewport, label, only=None, override=None):
        expected = MEASURED[probe].get((scheme, viewport))
        if expected is None:
            return
        if only:
            expected = {k: v for k, v in expected.items() if k in only}
        if override:
            expected = {**expected, **override}
        self.probe(probe, element_js, scheme, viewport, expected, label)

    # -- H1: M1 to M23 and S9 -------------------------------------------------------

    def test_h1_pills_headers_and_range_sheet(self):
        probes = [p for p, _name in PILL_NAMES] + [
            'M13', 'M14', 'M15', 'M16', 'M17', 'M19', 'M20', 'M21', 'M22', 'M23']
        for scheme, viewport in self.combos(probes):
            with self.page('test_web_gantt.host_action_h1', scheme, viewport):
                if viewport == 'desktop':
                    self._pill_colours(scheme, viewport)
                self._pill_box_fill_and_marks(scheme, viewport)
                self._headers_and_cells(scheme, viewport)
                # the range sheet of a phone opens last: it covers the grid
                if viewport == 'phone' and self.has_theme:
                    self._range_sheet(scheme)

    def _pill_colours(self, scheme, viewport):
        """Week, resting. Index 0 dark follows D4 (M64)."""
        for probe, name in PILL_NAMES:
            override = None
            if probe == 'M1' and scheme == 'dark':
                # D4: no colour is the grey 700 role, as in the list header (M64)
                override = {'background-color': MEASURED['M64'][('dark', 'desktop')]['color']}
            self.check(probe, self.pill(name), scheme, viewport, f'pill {name}',
                       override=override)

    def _pill_box_fill_and_marks(self, scheme, viewport):
        build = self.pill('Build')
        self.check('M13', build, scheme, viewport, 'pill Build')
        self.check('M14', f"{build}.querySelector('.o_tl_pill_title')", scheme, viewport,
                   'pill Build title')
        # width 430.5 at 1600 px: 75 % of the Build pill
        self.check('M15', f"{build}.querySelector('.o_tl_pill_progress')", scheme, viewport,
                   'pill Build progress fill')
        self.check('M16', f"{self.pill('Test')}.querySelector('.o_tl_pill_mark')", scheme,
                   viewport, 'pill Test corner mark')
        self.check('M17', f"{self.pill('Deploy')}.querySelector('.o_tl_pill_mark')", scheme,
                   viewport, 'pill Deploy corner mark')

    def _headers_and_cells(self, scheme, viewport):
        today_header = "document.querySelector('.o_tl_col.o_tl_is_today')"
        group_header = "document.querySelectorAll('.o_tl_col_group')[1]"
        first_row = "document.querySelector('.o_tl_row')"
        self.check('M19', today_header, scheme, viewport, 'today column header')
        self.check('M21', group_header, scheme, viewport, 'second column group header')
        self.check('M22', _first_cell(first_row, True), scheme, viewport, 'body cell of today')
        self.check('M23', _first_cell(first_row, False), scheme, viewport,
                   'body cell of another day')
        # sticky headers: read them again after the grid was scrolled by 300 px
        self.scroll_grid(300)
        self.check('M19', today_header, scheme, viewport, 'today column header (scrolled)')
        self.check('M21', group_header, scheme, viewport,
                   'second column group header (scrolled)')
        self.check('M20', "document.querySelector('.o_tl_col:not(.o_tl_is_today)')", scheme,
                   viewport, 'first non-today column header (scrolled)')

    def _range_sheet(self, scheme):
        """S9: the range sheet of a phone frames the current entry in the action colour."""
        action = {'light': 'rgba(1, 126, 132, 1)', 'dark': 'rgba(28, 188, 177, 1)'}
        self.click_js("document.querySelector('.o_tl_range_button')")
        self.wait("!!document.querySelector('.o_bottom_sheet .o_tl_range_item.selected')")
        self.probe('S9', "document.querySelector('.o_tl_range_item.selected')", scheme, 'phone',
                   {'border-top-color': action[scheme], 'border-top-width': '1'},
                   'current range entry')

    # -- H3: M24 to M42 and M53 to M63 ------------------------------------------------

    def test_h3_rows_total_pointer_and_gradients(self):
        probes = [f'M{n}' for n in (24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
                                    37, 38, 39, 41, 42, 53, 54, 55, 56, 57, 58, 59, 60, 61,
                                    62, 63)]
        for scheme, viewport in self.combos(probes):
            with self.page('test_web_gantt.host_action_h3', scheme, viewport):
                self._rows(scheme, viewport)
                self._consolidated_and_total(scheme, viewport)
                if viewport == 'desktop':
                    self._control_bar(scheme, viewport)
                    self._total_bar_hover(scheme, viewport)
                # sticky headers: the same reads after the grid was scrolled
                self.scroll_grid(300)
                self._rows(scheme, viewport, scrolled=True)
                self._total_title(scheme, viewport, scrolled=True)
                self.check('M24', "document.querySelector('.o_tl_title_cell')", scheme,
                           viewport, 'row header column title (scrolled)')
                if viewport == 'desktop':
                    self._pointer(scheme, viewport)
                self._gradients(scheme, viewport)

    def _rows(self, scheme, viewport, scrolled=False):
        note = ' (scrolled)' if scrolled else ''
        alpha = self.row('Alpha')
        first_leaf = f"{alpha}.nextElementSibling"
        self.check('M25', _header(alpha), scheme, viewport, 'Alpha group row header' + note)
        self.check('M28', _header(first_leaf), scheme, viewport,
                   'second-level row header under Alpha' + note)
        self.check('M31', f"{_header(alpha)}.querySelector('.o_tl_caret')", scheme, viewport,
                   'Alpha caret' + note)
        if scrolled:
            return
        self.check('M74', f"{_header(self.row('Undefined Contact'))}.querySelector"
                   "('.o_tl_row_label')", scheme, viewport, 'row name "Undefined Contact"')
        self.check('M26', _first_cell(alpha, False), scheme, viewport,
                   'Alpha group row, cell of another day')
        self.check('M27', _first_cell(alpha, True), scheme, viewport,
                   'Alpha group row, cell of today')
        self.check('M29', f"{_header(first_leaf)}.querySelector('.o_tl_row_name')", scheme,
                   viewport, 'second-level row name')
        self.check('M30', f"{_header(first_leaf)}.querySelector('.o_tl_thumbnail')", scheme,
                   viewport, 'thumbnail of the first contact row')

    def _total_title(self, scheme, viewport, scrolled=False):
        total = "document.querySelector('.o_tl_total_row')"
        self.check('M34', _header(total), scheme, viewport,
                   'Total row header' + (' (scrolled)' if scrolled else ''))

    def _consolidated_and_total(self, scheme, viewport):
        alpha = self.row('Alpha')
        total = "document.querySelector('.o_tl_total_row')"
        self.check('M32', f"{alpha}.querySelector('.o_tl_group_pill')", scheme, viewport,
                   'Alpha consolidated pill line')
        self.check('M33', f"{alpha}.querySelector('.o_tl_group_count')", scheme, viewport,
                   'Alpha consolidated pill count')
        self._total_title(scheme, viewport)
        self.check('M35', f"{total}.querySelector('.o_tl_total_bar')", scheme, viewport,
                   'first total bar')
        self.check('M36', f"{total}.querySelector('.o_tl_total_count')", scheme, viewport,
                   'first total bar count')

    def test_h3_control_bar_without_touch(self):
        """M41 and M42 are measured without touch (the touch size is F3's own test)."""
        for scheme, viewport in self.combos(['M41', 'M42']):
            with self.page('test_web_gantt.host_action_h3', scheme, viewport,
                           touch=False if viewport == 'phone' else None):
                self._control_bar(scheme, viewport)

    def _control_bar(self, scheme, viewport):
        self.check('M41', "document.querySelector('.o_tl_today')", scheme, viewport,
                   'Today button')
        self.check('M42', "document.querySelector('.o_tl_controls')", scheme, viewport,
                   'control bar')

    def _total_bar_hover(self, scheme, viewport):
        """M68 (P3): the fourth total bar that is not under the row headers, hovered; read
        before the grid is scrolled, as the bars at its start lie under the sticky headers."""
        bar = ("(() => { const title = document.querySelector('.o_tl_title_cell')"
               ".getBoundingClientRect().right;"
               " return [...document.querySelectorAll('.o_tl_total_bar')].filter("
               "(b) => b.getBoundingClientRect().left > title && "
               "b.getBoundingClientRect().right < innerWidth)[3]; })()")
        self.pointer_to(bar)
        self.check('M68', bar, scheme, viewport, 'fourth total bar, hovered')
        self.pointer_away()

    def _pointer(self, scheme, viewport):
        self.pointer_to(self.pill('Build'))
        self.check('M37', self.pill('Build'), scheme, viewport, 'pill Build, hovered')
        self.pointer_away()
        beta = self.row('Beta')
        self.pointer_to(_header(beta))
        self.check('M38', _header(beta), scheme, viewport, 'Beta header, hovered')
        self.check('M39', _first_cell(beta, False), scheme, viewport,
                   'Beta group row cell, header hovered')
        self.pointer_away()

    def _gradients(self, scheme, viewport):
        """Open rows, the pointer on Beta, then Alpha collapsed. Light values follow O-5."""
        light = scheme == 'light'
        open_image = {'background-image': LIGHT_OPEN} if light else None
        closed_image = {'background-image': LIGHT_CLOSED} if light else None
        alpha = self.row('Alpha')
        beta = self.row('Beta')
        self.check('M56', _header(alpha), scheme, viewport, 'Alpha header, open',
                   override=open_image)
        self.check('M57', _first_cell(alpha, False), scheme, viewport,
                   'Alpha cell of another day, open', override=open_image)
        self.check('M58', _first_cell(alpha, True), scheme, viewport,
                   'Alpha cell of today, open', override=open_image)
        # the table has M59 and M60 (the pointer over a header) for the desktop only
        if viewport == 'desktop':
            self.pointer_to(_header(beta))
            self.check('M59', _header(beta), scheme, viewport, 'Beta header, pointer over',
                       override=closed_image)
            self.check('M60', _first_cell(beta, False), scheme, viewport,
                       'Beta cell, pointer over the header', override=closed_image)
            self.pointer_away()
        self.click_js(_header(alpha))
        self.check('M53', _header(alpha), scheme, viewport, 'Alpha header, collapsed',
                   only=('background-color',))
        self.check('M54', _first_cell(alpha, True), scheme, viewport,
                   'Alpha cell of today, collapsed', only=('background-color',))
        self.check('M55', _first_cell(alpha, False), scheme, viewport,
                   'Alpha cell of another day, collapsed', only=('background-color',))
        self.check('M61', _header(alpha), scheme, viewport, 'Alpha header, collapsed',
                   override=closed_image)
        self.check('M62', _first_cell(alpha, True), scheme, viewport,
                   'Alpha cell of today, collapsed')
        self.check('M63', _first_cell(alpha, False), scheme, viewport,
                   'Alpha cell of another day, collapsed', override=closed_image)

    # -- H6: M40 ----------------------------------------------------------------------

    def test_h6_sparse_leaf(self):
        for scheme, viewport in self.combos(['M40']):
            with self.page('test_web_gantt.host_action_h6', scheme, viewport):
                self.check('M40', _header(self.row('Design')), scheme, viewport,
                           'sparse leaf row header Design')

    # -- control bar: M69 to M73, F3 (touch size), P5 to P8 ----------------------------

    def _button_edges(self, scheme, viewport, touch):
        """Previous, next, range button, Today (and the gear on a phone): height, paddings and
        widths. Without touch the table (M41, M69) holds; on a touch phone the theme's touch
        size: 37 px tall, 7 px and 14 px padding, 44 px wide arrows, Today about 67.4 px."""
        label = ' (touch)' if touch else ''
        names = ['previous', 'next', 'range_button', 'today']
        if viewport == 'phone':
            names.append('gear')
        want = {'previous': 44, 'next': 44, 'gear': 44, 'range_button': 84.5, 'today': 67.4}
        for name in names:
            element = f"document.querySelector('.o_tl_{name}')"
            if touch:
                expected = {'geometry.height': '37', 'geometry.width': str(want[name]),
                            'padding-top': '7', 'padding-bottom': '7',
                            'padding-left': '14', 'padding-right': '14'}
                self.probe('F3', element, scheme, viewport, expected, name + label)
            elif name == 'today':
                self.check('M41', element, scheme, viewport, 'Today button')
            elif name == 'range_button':
                self.check('M69', element, scheme, viewport, 'range button')
            else:
                self.probe('F3', element, scheme, viewport,
                           {'geometry.height': '33', 'padding-top': '5', 'padding-left': '10'},
                           name + label)

    def test_h1_range_button_and_touch_size(self):
        """M69, M70 (P5: 5 px before the caret) and F3 (A81: touch size on a touch phone). The
        phone is read without touch for the table and again with touch emulated."""
        for scheme, viewport in self.combos(['M69', 'M70']):
            for touch in ((False, True) if viewport == 'phone' else (None,)):
                with self.page('test_web_gantt.host_action_h1', scheme, viewport, touch=touch):
                    self._button_edges(scheme, viewport, bool(touch))
                    if not touch:
                        self.check('M70', "document.querySelector('.o_tl_range_button "
                                   "> .o_tl_range_caret')", scheme, viewport, 'caret')
                        # the caret sits 5 px after the range name
                        gap = self.js("""(() => {
                            const button = document.querySelector('.o_tl_range_button');
                            const range = document.createRange();
                            const text = [...button.childNodes].find(
                                (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
                            range.selectNodeContents(text);
                            return button.querySelector('.o_tl_range_caret')
                                .getBoundingClientRect().left - range.getBoundingClientRect().right;
                        })()""")
                        self.assertLess(abs(gap - 5), 0.6, f'gap before the caret: {gap}')

    def test_h3_touch_control_bar(self):
        """F3: on a touch phone the bar is 101 px high (4 + 37 + 7 + 37 + 16), as without touch;
        the gear shows the filled gear (P6)."""
        for scheme in ('light', 'dark') if self.has_theme else ('light',):
            with self.page('test_web_gantt.host_action_h3', scheme, 'phone', touch=True):
                self.probe('F3', "document.querySelector('.o_tl_controls')", scheme, 'phone',
                           {'geometry.height': '101', 'padding-top': '4'}, 'control bar (touch)')
                self._button_edges(scheme, 'phone', True)
                fill = self.js("getComputedStyle(document.querySelector("
                               "'.o_tl_gear .oi')).fontVariationSettings")
                self.assertIn('FILL', fill, 'the gear icon is not the filled one')
                self.assertIn('1', fill)

    def test_h5_custom_range_arrow_and_date_fields(self):
        """M71 (arrow on the range button), M72 and M73 (range menu open), P8 (the date's text
        is not selected when its picker opens). Phone: table without touch, then touch."""
        for scheme, viewport in self.combos(['M71', 'M72', 'M73']):
            for touch in ((False, True) if viewport == 'phone' else (None,)):
                with self.page('test_web_gantt.host_action_h5', scheme, viewport, touch=touch):
                    label = ' (touch)' if touch else ''
                    self.check('M71', "document.querySelector('.o_tl_range_button "
                               "> .o_tl_range_arrow')", scheme, viewport,
                               'arrow of the range button' + label)
                    self.click_js("document.querySelector('.o_tl_range_button')")
                    self.wait("!!document.querySelector('.o_tl_custom_line')")
                    self.settle()
                    self.check('M72', "document.querySelector('.o_tl_custom_line "
                               "> .o_tl_custom_arrow')", scheme, viewport,
                               'arrow of the custom line' + label)
                    field = ("document.querySelector('.o_tl_custom_start_button')"
                             if viewport == 'phone'
                             else "document.querySelector('.o_tl_custom_start input')")
                    self.check('M73', field, scheme, viewport, 'start date field' + label,
                               override={'geometry.height': '26'} if touch else None)
                    if viewport == 'desktop':
                        self._assert_date_unselected(field)

    def _assert_date_unselected(self, field):
        """P8: the click opens the picker; the text of the date is not selected."""
        self.js(f"{field}.click()")
        self.wait("!!document.querySelector('.o_datetime_picker')")
        self.settle()
        seen = self.js(f"""(() => {{
            const input = {field};
            return [document.activeElement === input, input.selectionStart,
                    input.selectionEnd, input.value.length];
        }})()""")
        self.assertTrue(seen[0], f'the start date is not focused: {seen}')
        self.assertEqual(seen[1], seen[2], f'the date text is selected: {seen}')

    def test_h2_phone_range_sheet(self):
        """P7 (A122): on a touch phone the range sheet is 424 px tall."""
        with self.page('test_web_gantt.host_action_h2', 'light', 'phone', touch=True):
            self.click_js("document.querySelector('.o_tl_range_button')")
            self.wait("!!document.querySelector('.o_bottom_sheet .o_tl_custom_line')")
            self.settle()
            sheet = self.geometry("document.querySelector('.o_bottom_sheet_sheet')")
            self.assertLess(abs(sheet['geometry.height'] - 424), 0.6, sheet)
            for which in ('start', 'stop'):
                self.probe('M73', f"document.querySelector('.o_tl_custom_{which}_button')",
                           'light', 'phone', {'geometry.height': '26',
                                              'border-bottom-width': '1', 'border-top-width': '0'},
                           f'{which} date (touch)')

    # -- H5: A116 and M43 -------------------------------------------------------------

    def test_h5_neutral_grey_and_popover_frame(self):
        """Every pill is the neutral grey with black text (A116); then the popover of Build
        (M43): a frame on a desktop, a sheet on a phone."""
        for scheme, viewport in self.combos(['M43']):
            with self.page('test_web_gantt.host_action_h5', scheme, viewport):
                if viewport == 'desktop':
                    self._neutral_grey(scheme)
                self.click_js(self.pill('Build'))
                self.wait("!!document.querySelector('.o_popover .o_tl_popover')")
                self.settle()
                self.check('M43', "document.querySelector('.o_popover')", scheme, viewport,
                           'popover frame')

    def _neutral_grey(self, scheme):
        """H5: every pill is the grey of M64 with black text; light: M1 light."""
        want = (NEUTRAL_GREY if scheme == 'dark'
                else MEASURED['M1'][('light', 'desktop')]['background-color'])
        count = self.js("document.querySelectorAll('.o_tl_pill').length")
        self.assertGreater(count, 0, 'H5 shows no pill')
        for index in range(count):
            pill = f"document.querySelectorAll('.o_tl_pill')[{index}]"
            self.probe('A116', pill, scheme, 'desktop',
                       {'background-color': want, 'color': 'rgba(0, 0, 0, 1)'},
                       f'H5 pill {index}')

    # -- H12: M44 to M50 (O-2 answers) ------------------------------------------------

    def _local(self, days, clock='00:00'):
        """UTC text of the browser-local ``clock`` on D0 + ``days`` (zone +3, D0 = host day)."""
        hour, minute = (int(part) for part in clock.split(':'))
        day = fields.Date.to_date('2026-11-12') + timedelta(days=days)
        local = datetime.combine(day, time(hour, minute))
        return fields.Datetime.to_string(local - timedelta(hours=3))

    def _capacity_state(self, folded):
        """Records and O-2 answers for the capacity probes (rolled back with the test transaction).

        The measured row is the row of Host Contact 1 ("the second employee row" of the original
        attendance host: the contact whose header has a bar, the label ``91:00`` and two lines of
        pills, 66 px). It gets a third pill that overlaps Build, so its pills need two lines;
        its answers are 29 of 120 hours and D+1 unavailable. With ``folded``, every contact is also
        unavailable on D+3 and D+4 and the pills that touch these two days are removed, so the two
        days fold into one column.
        """
        Pill = self.env['test.web.gantt.pill']
        c1, c2, c3 = (self.records[f'C{i}'] for i in (1, 2, 3))
        Pill.create({
            'name': 'Extra', 'x_contact': c1.id,
            'date_start': self._local(0, '10:00'), 'date_stop': self._local(1, '12:00'),
        })
        unavailability = {
            str(c1.id): [{'start': self._local(1), 'stop': self._local(2)}],
        }
        if folded:
            touching = ['Test', 'Long task', 'Color ten', 'Wrong order']
            Pill.search([('name', 'in', touching)]).unlink()
            fold = {'start': self._local(3), 'stop': self._local(5)}
            for contact in (c1, c2, c3):
                unavailability.setdefault(str(contact.id), []).append(fold)
        self.env['ir.config_parameter'].set_str('test_web_gantt.hook_answers', json.dumps({
            'unavailability': {'x_contact': unavailability},
            'progress': {'x_contact': {str(c1.id): {'value': 29, 'max_value': 120}}},
        }))

    def test_h12_capacity_and_unavailability(self):
        combos = self.combos(['M44', 'M45', 'M46', 'M47', 'M48', 'M49', 'M50'])
        self._capacity_state(folded=True)
        for scheme, viewport in combos:
            with self.page('test_web_gantt.host_action_h12', scheme, viewport):
                row = self.row('Host Contact 1')
                column = ("[...document.querySelectorAll('.o_tl_col')]"
                          ".findIndex((c) => c.dataset.date === '2026-11-13')")
                self.check('M44', f"{row}.querySelectorAll('.o_tl_cell')[{column}]", scheme,
                           viewport, 'unavailable cell D+1')
                self.check('M45', "document.querySelector('.o_tl_col.o_tl_folded')",
                           scheme, viewport, 'folded column header')
                self.check('M46', f"{row}.querySelector('.o_tl_folded_cell')", scheme,
                           viewport, 'folded body cell')
                header = f"{row}.querySelector('.o_tl_row_header')"
                self.check('M47', f"{header}.querySelector('.o_tl_progress')", scheme,
                           viewport, 'progress track')
                self.check('M48', f"{header}.querySelector('.o_tl_progress_fill')", scheme,
                           viewport, 'progress fill')
                self.check('M49', f"{header}.querySelector('.o_tl_progress_label')", scheme,
                           viewport, 'progress label')
                self.check('M50', header, scheme, viewport, 'row header with a bar')

    # -- H8: M51 and M52 --------------------------------------------------------------

    def test_h8_sample(self):
        """M51, M52 (phone: 178 without touch, 182 with touch), M66 and M67."""
        for scheme, viewport in self.combos(['M51', 'M52', 'M66', 'M67']):
            # the table is measured without touch; a touch phone has a 4 px taller control bar
            for touch in ((False, True) if viewport == 'phone' else (None,)):
                with self.page('test_web_gantt.host_action_h8', scheme, viewport, touch=touch):
                    label = ' (touch)' if touch else ''
                    cell = ".o_tl_row .o_tl_cell.o_tl_sample:not(.o_tl_is_today)"
                    self.check('M51', f"document.querySelector('{cell}')", scheme, viewport,
                               'sample body cell' + label)
                    override = {'geometry.y': '182'} if touch else None
                    self.check('M52', "document.querySelector('.o_tl_box .o_view_nocontent')",
                               scheme, viewport, 'no-content help' + label, override=override)
                    if touch:
                        # the help sits 26 px above the box on the phone, the top of the box
                        # moves with the touch size
                        box = self.geometry("document.querySelector('.o_tl_box')")
                        self.assertEqual(box['geometry.y'] - 26, 182)
                    self.check('M66', "document.querySelector('.o_tl_renderer')", scheme,
                               viewport, 'scroll area ends after the faded row' + label,
                               override={'geometry.y': str(self.geometry(
                                   "document.querySelector('.o_tl_renderer')")['geometry.y'])}
                               if touch else None)
                    self.check('M67', "document.querySelector('.o_tl_grid')", scheme, viewport,
                               'sample grid' + label,
                               override={'geometry.y': str(self.geometry(
                                   "document.querySelector('.o_tl_grid')")['geometry.y'])}
                               if touch else None)
                    self._assert_sample_layout(viewport, label)
                    self._assert_help_visible(viewport)

    def _assert_sample_layout(self, viewport, label=''):
        """F2: the box is transparent (page background below the faded row); the help content is
        centred in the free space under the grid (phone) and the help takes no pointer."""
        seen = self.js("""(() => {
            const box = document.querySelector('.o_tl_box');
            const renderer = document.querySelector('.o_tl_renderer');
            const help = box.querySelector('.o_view_nocontent');
            const content = help.querySelector('.o_nocontent_help') || help.firstElementChild;
            const rect = content.getBoundingClientRect();
            return {
                boxBackground: getComputedStyle(box).backgroundColor,
                helpBackground: getComputedStyle(help).backgroundColor,
                renderer: renderer.getBoundingClientRect().toJSON(),
                box: box.getBoundingClientRect().toJSON(),
                contentMiddle: (rect.top + rect.bottom) / 2,
                bottom: innerHeight,
            };
        })()""")
        self.assertEqual(seen['boxBackground'], 'rgba(0, 0, 0, 0)', f'F2 box background{label}')
        self.assertEqual(seen['helpBackground'], 'rgba(0, 0, 0, 0)', f'F2 help background{label}')
        self.assertAlmostEqual(seen['renderer']['height'], 92, delta=.5)
        if viewport == 'phone':
            # the page background shows from the faded row down to the bottom of the view
            self.assertAlmostEqual(seen['box']['bottom'], seen['bottom'], delta=1,
                                   msg=f'F2 the box reaches the bottom of the view{label}')
            free = (seen['renderer']['bottom'] + seen['bottom']) / 2
            self.assertGreater(seen['contentMiddle'], seen['renderer']['bottom'],
                               f'F2 the help content is under the faded row{label}')
            self.assertLess(abs(seen['contentMiddle'] - free), 70,
                            f'F2 the help content is centred in the free space{label}')

    def _assert_help_visible(self, viewport):
        """D-2: the help is fully opaque and inside the screen, though the grid is scrolled and
        its cells faded (M51)."""
        seen = self.js("""(() => {
            const help = document.querySelector('.o_tl_box .o_view_nocontent');
            const text = help.querySelector('.o_nocontent_help') || help;
            const rect = text.getBoundingClientRect();
            let opacity = 1;
            for (let el = text; el; el = el.parentElement) {
                opacity *= Number(getComputedStyle(el).opacity);
            }
            return {
                opacity, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                width: innerWidth, height: innerHeight, text: text.textContent.trim(),
                scrolled: document.querySelector('.o_tl_renderer').scrollLeft,
            };
        })()""")
        self.assertEqual(seen['opacity'], 1, f'help is faded: {seen}')
        self.assertTrue(seen['text'], 'help has no text')
        self.assertTrue(
            seen['left'] >= 0 and seen['right'] <= seen['width']
            and seen['top'] >= 0 and seen['bottom'] <= seen['height'],
            f'{viewport}: help is outside the screen: {seen}')

    # -- H1: M65 (F1) -----------------------------------------------------------------

    def test_f1_view_background_below_short_grid(self):
        """The area below a short grid takes the view background, light and dark, desktop and
        phone (without touch, as the table is measured). The grid's scrollbar stays under the
        grid: the scroll container is as high as the grid, the box around it fills the view."""
        for scheme, viewport in self.combos(['M65']):
            with self.page('test_web_gantt.host_action_h1', scheme, viewport, touch=False):
                self.check('M65', "document.querySelector('.o_tl_box')", scheme, viewport,
                           'the area below the last row')
                seen = self.js("""(() => {
                    const box = document.querySelector('.o_tl_box').getBoundingClientRect();
                    const grid = document.querySelector('.o_tl_renderer').getBoundingClientRect();
                    const probe = document.elementFromPoint(box.left + 60, box.bottom - 20);
                    return {
                        box: box.bottom, grid: grid.bottom, height: innerHeight,
                        under: getComputedStyle(probe.closest('.o_tl_box')).backgroundColor,
                    };
                })()""")
                self.assertAlmostEqual(seen['box'], seen['height'], delta=1)
                self.assertLess(seen['grid'], seen['box'] - 100,
                                'the grid scroll area is as high as the grid, not the view')
                self.assertIsNone(compare_value(
                    'background-color', MEASURED['M65'][(scheme, viewport)]['background-color'],
                    seen['under']))

    # -- M64 --------------------------------------------------------------------------

    def test_m64_list_header_grey(self):
        for scheme in SCHEMES:
            if scheme == 'dark' and not self.has_theme:
                continue
            with self.page('test_web_gantt.host_action_h1', scheme, 'desktop',
                           query='?view_type=list'):
                self.check('M64', "document.querySelector('.o_list_renderer th.o_column_sortable')",
                           scheme, 'desktop', 'sortable list column header')


@tagged('post_install', '-at_install', 'timeline_probes')
class TimelineScreenDefects(TimelineProbeCase):
    """The defects the screenshots of the slice showed (D-1 to D-7), read in a real Chrome."""

    def setUp(self):
        super().setUp()
        self.viewports = ('desktop', 'phone')

    def _centre_js(self):
        """JS for the middle of the visible part of the grid (title cell excluded)."""
        return """(() => {
            const grid = document.querySelector('.o_tl_renderer');
            const box = grid.getBoundingClientRect();
            const title = document.querySelector('.o_tl_title_cell');
            const left = title ? title.getBoundingClientRect().right : box.left;
            return (left + box.left + grid.clientLeft + grid.clientWidth) / 2;
        })()"""

    def test_icons_render_one_glyph(self):
        """D-1: every icon is a square glyph of the icon font, not the written-out name."""
        for viewport in self.viewports:
            with self.subTest(viewport=viewport), \
                    self.page('test_web_gantt.host_action_h3', 'light', viewport):
                self.wait("document.fonts.status === 'loaded'")
                # fold a group first: its caret and the "Open every group" entry are arrow_right
                self.click_js("document.querySelector('.o_tl_group_row .o_tl_row_header')")
                if viewport == 'phone':
                    self.click_js("document.querySelector('.o_tl_gear')")
                    self.wait("!!document.querySelector('.o_tl_gear_menu, .o_bottom_sheet')")
                else:
                    self.click_js("document.querySelector('.o_tl_range_button')")
                    self.wait("!!document.querySelector('.o_tl_range_menu')")
                icons = self.js("""[...document.querySelectorAll(
                    '.o_timeline_view i.oi, .o_tl_gear_menu i.oi, .o_bottom_sheet i.oi, ' +
                    '.o_tl_range_menu i.oi')].map((icon) => {
                    const rect = icon.getBoundingClientRect();
                    return {
                        name: icon.getAttribute('data-icon'), width: rect.width,
                        size: parseFloat(getComputedStyle(icon).fontSize),
                    };
                })""")
                self.assertGreater(len(icons), 5)
                self.assertIn('arrow_right', [icon['name'] for icon in icons])
                for icon in icons:
                    self.assertTrue(icon['name'], f'{viewport}: icon without a name')
                    self.assertTrue(0 < icon['width'] < icon['size'] * 1.6,
                                    f'{viewport}: icon {icon} has no glyph')

    def test_title_cell_and_headers_cover_the_scrolled_grid(self):
        """D-3: the title cell is stuck at the start, bold, centred, 75 % background and blur."""
        for viewport in self.viewports:
            with self.subTest(viewport=viewport), \
                    self.page('test_web_gantt.host_action_h3', 'light', viewport):
                self.scroll_grid(900)
                title = self.read("document.querySelector('.o_tl_title_cell')", [
                    'geometry.x', 'geometry.width', 'font-weight', 'justify-content',
                    'background-color', 'backdrop-filter', 'z-index'])
                grid = self.geometry("document.querySelector('.o_tl_renderer')")
                self.assertLess(abs(title['geometry.x'] - grid['geometry.x']), 2.0)
                self.assertEqual(title['font-weight'], '700')
                self.assertEqual(title['justify-content'], 'center')
                self.assertEqual(title['background-color'], 'rgba(255, 255, 255, 0.75)')
                self.assertEqual(self.js(
                    "document.querySelector('.o_tl_title_cell').textContent.trim()"), 'Pills')
                header = self.read(
                    "document.querySelector('.o_tl_row_header')",
                    ['geometry.x', 'background-color', 'backdrop-filter'])
                self.assertLess(abs(header['geometry.x'] - grid['geometry.x']), 2.0)
                self.assertEqual(header['background-color'], 'rgba(255, 255, 255, 0.75)')
                # both branches of the blur: the variable of the theme set, and not set
                filters = "[document.querySelector('.o_tl_title_cell'), " \
                          "document.querySelector('.o_tl_row_header')]" \
                          ".map((el) => getComputedStyle(el).backdropFilter)"
                root = "document.documentElement.style"
                self.js(f"{root}.setProperty('--o-backdrop-blur', 'blur(3px)')")
                self.assertEqual(self.js(filters), ['blur(3px)', 'blur(3px)'])
                # `initial` makes the variable undefined: the fallback applies
                self.js(f"{root}.setProperty('--o-backdrop-blur', 'initial')")
                self.assertEqual(self.js(filters), ['none', 'none'])
                self.js(f"{root}.removeProperty('--o-backdrop-blur')")

    def test_range_menu_marks_current_entry(self):
        """The current range entry shows the check the dropdown draws (we draw none ourselves)."""
        for viewport in self.viewports:
            with self.subTest(viewport=viewport), \
                    self.page('test_web_gantt.host_action_h3', 'light', viewport):
                self.click_js("document.querySelector('.o_tl_range_button')")
                self.wait("!!document.querySelector('.o_tl_range_item.selected')")
                marks = self.js("""['::before', '::after'].map((pseudo) =>
                    getComputedStyle(document.querySelector('.o_tl_range_item.selected'), pseudo)
                        .content)""")
                self.assertTrue(
                    any(content not in ('none', 'normal', '""') for content in marks), marks)

    def test_group_header_label_sticks(self):
        """D-5: the label of a partly scrolled group stays at the edge of the visible part."""
        for viewport in self.viewports:
            with self.subTest(viewport=viewport), \
                    self.page('test_web_gantt.host_action_h3', 'light', viewport):
                found = self.js("""(() => {
                    const grid = document.querySelector('.o_tl_renderer');
                    const edge = document.querySelector('.o_tl_row_header')
                        .getBoundingClientRect().right;
                    const groups = [...document.querySelectorAll('.o_tl_col_group')];
                    // put the second group 80 px under the row headers
                    const second = groups[1].getBoundingClientRect();
                    grid.scrollLeft += second.left - (edge - 80);
                    return edge;
                })()""")
                self.settle()
                seen = self.js("""(() => {
                    const edge = document.querySelector('.o_tl_row_header')
                        .getBoundingClientRect().right;
                    const group = document.querySelectorAll('.o_tl_col_group')[1];
                    const label = group.querySelector('.o_tl_col_group_label');
                    return {
                        edge, groupLeft: group.getBoundingClientRect().left,
                        labelLeft: label.getBoundingClientRect().left,
                        text: label.textContent.trim(),
                    };
                })()""")
                self.assertLess(seen['groupLeft'], seen['edge'], f'{found} {seen}')
                self.assertTrue(seen['text'].startswith('Week'), seen)
                self.assertLess(abs(seen['labelLeft'] - (seen['edge'] + 8)), 1.5, seen)

    def test_today_header_tint_is_painted(self):
        """The warm fill of today's header is really painted: a read of the pixels of a
        screenshot differs from the header of another day (a layer above the cell's background
        would hide a fill that the computed style still reports)."""
        import base64
        import io

        from PIL import Image
        for scheme in ('light', 'dark'):
            if scheme == 'dark' and not self.has_theme:
                continue
            with self.subTest(scheme=scheme), \
                    self.page('test_web_gantt.host_action_h1', scheme, 'desktop'):
                def pixel(selector):
                    box = self.geometry(f"document.querySelector('{selector}')")
                    shot = self.browser._websocket_request('Page.captureScreenshot')
                    image = Image.open(io.BytesIO(base64.b64decode(shot['data']))).convert('RGB')
                    # inside the cell, left of the text
                    return image.getpixel((int(box['geometry.x']) + 6,
                                           int(box['geometry.y']) + 12))
                today = pixel('.o_tl_col.o_tl_is_today')
                other = pixel('.o_tl_col:not(.o_tl_is_today)')
                if scheme == 'light':
                    self.assertEqual(today, (255, 250, 235))
                self.assertNotEqual(today, other)
                # warm: more red than blue, against the colour of the other headers
                self.assertGreater(today[0] - today[2], other[0] - other[2] + 5, (today, other))

    def test_no_stray_scrollbar_strip(self):
        """The grid is as high as its rows: its scrollbar is not at the bottom of the screen."""
        with self.page('test_web_gantt.host_action_h3', 'light', 'desktop'):
            seen = self.js("""(() => {
                const grid = document.querySelector('.o_tl_renderer');
                const rect = grid.getBoundingClientRect();
                return {bottom: rect.bottom, height: innerHeight,
                    content: grid.querySelector('.o_tl_grid').getBoundingClientRect().bottom};
            })()""")
            self.assertLess(seen['bottom'], seen['height'] - 40, seen)
            self.assertLess(seen['bottom'] - seen['content'], 20, seen)

    def test_tall_grid_scrolls_vertically_with_headers_on_top(self):
        """A grid taller than the viewport scrolls vertically; the column headers stay on top."""
        with self.page('test_web_gantt.host_action_h3', 'light', 'desktop'):
            self.browser._websocket_request('Emulation.setDeviceMetricsOverride', params={
                'width': 1600, 'height': 500, 'deviceScaleFactor': 1, 'mobile': False,
            })
            self.settle()
            before = self.js("""(() => {
                const grid = document.querySelector('.o_tl_renderer');
                return {scrollHeight: grid.scrollHeight, clientHeight: grid.clientHeight};
            })()""")
            self.assertGreater(before['scrollHeight'], before['clientHeight'], before)
            self.js("document.querySelector('.o_tl_renderer').scrollTop = 150")
            self.settle()
            seen = self.js("""(() => {
                const grid = document.querySelector('.o_tl_renderer');
                const head = document.querySelector('.o_tl_col').getBoundingClientRect();
                return {scrollTop: grid.scrollTop, headTop: head.top,
                    gridTop: grid.getBoundingClientRect().top + grid.clientTop};
            })()""")
            self.assertGreater(seen['scrollTop'], 0, seen)
            self.assertLess(abs(seen['headTop'] - seen['gridTop']), 40, seen)

    def test_focus_day_starts_in_the_middle(self):
        """D-6 (S1): the focus day starts in the middle of the visible part."""
        for host, viewport in (('h1', 'desktop'), ('h3', 'desktop'), ('h2', 'desktop')):
            with self.subTest(host=host), \
                    self.page(f'test_web_gantt.host_action_{host}', 'light', viewport):
                today = self.js(
                    "document.querySelector('.o_tl_col.o_tl_is_today').getBoundingClientRect().left")
                centre = self.js(self._centre_js())
                seen = self.js('''(() => {
                    const grid = document.querySelector('.o_tl_renderer');
                    const rect = (el) => el && JSON.stringify(el.getBoundingClientRect());
                    return {grid: rect(grid), client: grid.clientWidth, left: grid.scrollLeft,
                        title: rect(document.querySelector('.o_tl_title_cell')),
                        today: rect(document.querySelector('.o_tl_col.o_tl_is_today'))};
                })()''')
                self.assertLess(abs(today - centre), 2.0, f'{host}: {today} vs {centre} {seen}')

    def test_popover_band_cross_scroll_and_dates(self):
        """D-4: grey header band, cross in the top right corner, no scrollbar, short dates."""
        for viewport in self.viewports:
            with self.subTest(viewport=viewport), \
                    self.page('test_web_gantt.host_action_h5', 'light', viewport):
                self.click_js(self.pill('Build'))
                self.wait("!!document.querySelector('.o_popover .o_tl_popover')")
                self.settle()
                popover = self.geometry("document.querySelector('.o_tl_popover')")
                cross = self.geometry("document.querySelector('.o_card_popover_close')")
                self.assertLess(abs(cross['geometry.y'] - popover['geometry.y']), 2.0)
                self.assertLess(
                    abs(cross['geometry.x'] + cross['geometry.width']
                        - (popover['geometry.x'] + popover['geometry.width'])), 2.0)
                band = self.read("document.querySelector('.o_popover_header')",
                                 ['background-color'])['background-color']
                # the grey-200 role of the theme: neither white nor the colour of the body
                body_bg = self.read("document.querySelector('.o_tl_popover .o_popover_body')",
                                    ['background-color'])['background-color']
                self.assertNotIn(band, ('rgb(255, 255, 255)', 'rgba(0, 0, 0, 0)', body_bg))
                body = self.js("""(() => {
                    const el = document.querySelector('.o_tl_popover .o_popover_body');
                    return {
                        scroll: el.scrollWidth, client: el.clientWidth,
                        vscroll: el.scrollHeight, vclient: el.clientHeight,
                        text: el.innerText,
                    };
                })()""")
                self.assertLessEqual(body['scroll'], body['client'], body)
                self.assertLessEqual(body['vscroll'], body['vclient'], body)
                self.assertIn('Start: Nov 12, 9:00 AM', body['text'])
                self.assertIn('Stop: Nov 14, 6:00 PM', body['text'])
                if viewport == 'phone':
                    dim = self.js("getComputedStyle(document.querySelector('.o_popover:has("
                                  "> .o_tl_popover_sheet)'), '::before').backgroundColor")
                    self.assertEqual(dim, 'rgba(0, 0, 0, 0.25)')

    def test_phone_custom_range_dates_are_plain_fields(self):
        """D-7: the two dates of the custom line look like plain underlined fields."""
        with self.page('test_web_gantt.host_action_h2', 'light', 'phone'):
            self.click_js("document.querySelector('.o_tl_range_button')")
            self.wait("!!document.querySelector('.o_bottom_sheet .o_tl_custom_line')")
            self.settle()
            for which in ('start', 'stop'):
                style = self.read(f"document.querySelector('.o_tl_custom_{which}_button')", [
                    'border-top-width', 'border-bottom-width', 'border-bottom-style',
                    'background-color'])
                self.assertEqual(style['border-top-width'], '0px')
                self.assertEqual(style['border-bottom-width'], '1px')
                self.assertEqual(style['background-color'], 'rgba(0, 0, 0, 0)')
