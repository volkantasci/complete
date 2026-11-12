# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes: the host views in a real Chrome, compared with the measured values of the spec.

Run only these: ``--test-tags timeline_probes/test_web_gantt``. The dark scheme needs
``web_enterprise``; without it the dark probes are skipped.
"""
import json
from datetime import datetime, time, timedelta

from odoo import fields
from odoo.tests import tagged

from .timeline_probe import TimelineProbeCase
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

    # -- M1 to M17: pills of H1 -----------------------------------------------------

    def test_m1_m12_pill_colours(self):
        """H1, week, resting; light and dark, desktop. Index 0 dark follows D4 (M64)."""
        for scheme, viewport in self.combos([p for p, _name in PILL_NAMES], viewports=('desktop',)):
            with self.page('test_web_gantt.host_action_h1', scheme, viewport):
                for probe, name in PILL_NAMES:
                    override = None
                    if probe == 'M1' and scheme == 'dark':
                        # D4: no colour is the grey 700 role, as in the list header (M64)
                        override = {
                            'background-color': MEASURED['M64'][('dark', 'desktop')]['color'],
                        }
                    self.check(probe, self.pill(name), scheme, viewport, f'pill {name}',
                               override=override)

    def test_m13_m14_pill_box(self):
        for scheme, viewport in self.combos(['M13', 'M14']):
            with self.page('test_web_gantt.host_action_h1', scheme, viewport):
                self.check('M13', self.pill('Build'), scheme, viewport, 'pill Build')
                self.check('M14', f"{self.pill('Build')}.querySelector('.o_tl_pill_title')",
                           scheme, viewport, 'pill Build title')

    def test_m15_progress_fill(self):
        """Width 430.5 at 1600 px: 75 % of the Build pill."""
        for scheme, viewport in self.combos(['M15']):
            with self.page('test_web_gantt.host_action_h1', scheme, viewport):
                self.check('M15', f"{self.pill('Build')}.querySelector('.o_tl_pill_progress')",
                           scheme, viewport, 'pill Build progress fill')

    def test_m16_m17_marks(self):
        for scheme, viewport in self.combos(['M16', 'M17']):
            with self.page('test_web_gantt.host_action_h1', scheme, viewport):
                self.check('M16', f"{self.pill('Test')}.querySelector('.o_tl_pill_mark')",
                           scheme, viewport, 'pill Test corner mark')
                self.check('M17', f"{self.pill('Deploy')}.querySelector('.o_tl_pill_mark')",
                           scheme, viewport, 'pill Deploy corner mark')

    # -- M19 to M23: headers and cells of H1 ----------------------------------------

    def test_m19_m23_headers_and_cells(self):
        probes = ['M19', 'M20', 'M21', 'M22', 'M23']
        for scheme, viewport in self.combos(probes):
            with self.page('test_web_gantt.host_action_h1', scheme, viewport):
                self.check('M19', "document.querySelector('.o_tl_col.o_tl_is_today')", scheme,
                           viewport, 'today column header')
                self.check('M21', "document.querySelectorAll('.o_tl_col_group')[1]", scheme,
                           viewport, 'second column group header')
                first_row = "document.querySelector('.o_tl_row')"
                self.check('M22', _first_cell(first_row, True), scheme, viewport,
                           'body cell of today')
                self.check('M23', _first_cell(first_row, False), scheme, viewport,
                           'body cell of another day')
                # sticky headers: read them after the grid was scrolled by 300 px
                self.scroll_grid(300)
                self.check('M20', "document.querySelector('.o_tl_col:not(.o_tl_is_today)')",
                           scheme, viewport, 'first non-today column header (scrolled)')

    # -- M24 to M42: H3 -------------------------------------------------------------

    def test_m24_m31_rows(self):
        probes = ['M24', 'M25', 'M26', 'M27', 'M28', 'M29', 'M30', 'M31']
        for scheme, viewport in self.combos(probes):
            with self.page('test_web_gantt.host_action_h3', scheme, viewport):
                alpha = self.row('Alpha')
                first_leaf = f"{alpha}.nextElementSibling"
                self.check('M25', _header(alpha), scheme, viewport, 'Alpha group row header')
                self.check('M26', _first_cell(alpha, False), scheme, viewport,
                           'Alpha group row, cell of another day')
                self.check('M27', _first_cell(alpha, True), scheme, viewport,
                           'Alpha group row, cell of today')
                self.check('M28', _header(first_leaf), scheme, viewport,
                           'second-level row header under Alpha')
                self.check('M29', f"{_header(first_leaf)}.querySelector('.o_tl_row_name')",
                           scheme, viewport, 'second-level row name')
                self.check('M30', f"{_header(first_leaf)}.querySelector('.o_tl_thumbnail')",
                           scheme, viewport, 'thumbnail of the first contact row')
                self.check('M31', f"{_header(alpha)}.querySelector('.o_tl_caret')", scheme,
                           viewport, 'Alpha caret')
                self.scroll_grid(300)
                self.check('M24', "document.querySelector('.o_tl_title_cell')", scheme,
                           viewport, 'row header column title (scrolled)')

    def test_m32_m36_consolidated_and_total(self):
        probes = ['M32', 'M33', 'M34', 'M35', 'M36']
        for scheme, viewport in self.combos(probes):
            with self.page('test_web_gantt.host_action_h3', scheme, viewport):
                alpha = self.row('Alpha')
                self.check('M32', f"{alpha}.querySelector('.o_tl_group_pill')", scheme,
                           viewport, 'Alpha consolidated pill line')
                self.check('M33', f"{alpha}.querySelector('.o_tl_group_count')", scheme,
                           viewport, 'Alpha consolidated pill count')
                total = "document.querySelector('.o_tl_total_row')"
                self.check('M34', _header(total), scheme, viewport, 'Total row header')
                self.check('M35', f"{total}.querySelector('.o_tl_total_bar')", scheme,
                           viewport, 'first total bar')
                self.check('M36', f"{total}.querySelector('.o_tl_total_count')", scheme,
                           viewport, 'first total bar count')

    def test_m37_m39_pointer(self):
        for scheme, viewport in self.combos(['M37', 'M38', 'M39'], viewports=('desktop',)):
            with self.page('test_web_gantt.host_action_h3', scheme, viewport):
                self.pointer_to(self.pill('Build'))
                self.check('M37', self.pill('Build'), scheme, viewport, 'pill Build, hovered')
                self.pointer_away()
                beta = self.row('Beta')
                self.pointer_to(_header(beta))
                self.check('M38', _header(beta), scheme, viewport, 'Beta header, hovered')
                self.check('M39', _first_cell(beta, False), scheme, viewport,
                           'Beta group row cell, header hovered')

    def test_m40_sparse_leaf(self):
        for scheme, viewport in self.combos(['M40']):
            with self.page('test_web_gantt.host_action_h6', scheme, viewport):
                self.check('M40', _header(self.row('Design')), scheme, viewport,
                           'sparse leaf row header Design')

    def test_m41_m42_control_bar(self):
        for scheme, viewport in self.combos(['M41', 'M42']):
            with self.page('test_web_gantt.host_action_h3', scheme, viewport):
                self.check('M41', "document.querySelector('.o_tl_today')", scheme, viewport,
                           'Today button')
                self.check('M42', "document.querySelector('.o_tl_controls')", scheme, viewport,
                           'control bar')

    # -- M43: the popover frame -----------------------------------------------------

    def test_m43_popover_frame(self):
        """H5 (the minimal view): the popover of Build, a frame on a desktop, a sheet on a phone."""
        for scheme, viewport in self.combos(['M43']):
            with self.page('test_web_gantt.host_action_h5', scheme, viewport):
                self.click_js(self.pill('Build'))
                self.wait("!!document.querySelector('.o_popover .o_tl_popover')")
                self.settle()
                self.check('M43', "document.querySelector('.o_popover')", scheme, viewport,
                           'popover frame')

    def test_range_sheet_current_entry_action_colour(self):
        """S9: the range sheet of a phone frames the current entry in the action colour."""
        action = {'light': 'rgba(1, 126, 132, 1)', 'dark': 'rgba(28, 188, 177, 1)'}
        for scheme in SCHEMES:
            if scheme == 'dark' and not self.has_theme:
                continue
            if not self.has_theme:
                self.skipTest('the action colour of the theme needs web_enterprise')
            with self.page('test_web_gantt.host_action_h1', scheme, 'phone'):
                self.click_js("document.querySelector('.o_tl_range_button')")
                self.wait("!!document.querySelector('.o_bottom_sheet .o_tl_range_item.selected')")
                self.probe('S9', "document.querySelector('.o_tl_range_item.selected')", scheme,
                           'phone', {'border-top-color': action[scheme],
                                     'border-top-width': '1'}, 'current range entry')

    # -- M44 to M50: capacity and unavailability on H12 (O-2 answers) ------------------

    def _local(self, days, clock='00:00'):
        """UTC text of the browser-local ``clock`` on D0 + ``days`` (zone +3, D0 = host day)."""
        hour, minute = (int(part) for part in clock.split(':'))
        day = fields.Date.to_date('2026-11-12') + timedelta(days=days)
        local = datetime.combine(day, time(hour, minute))
        return fields.Datetime.to_string(local - timedelta(hours=3))

    def _capacity_state(self, folded):
        """Records and O-2 answers for the capacity probes.

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

    def test_m44_unavailable_cell(self):
        combos = self.combos(['M44'])
        self._capacity_state(folded=False)
        for scheme, viewport in combos:
            with self.page('test_web_gantt.host_action_h12', scheme, viewport):
                row = self.row('Host Contact 1')
                column = ("[...document.querySelectorAll('.o_tl_col')]"
                          ".findIndex((c) => c.dataset.date === '2026-11-13')")
                cell = f"{row}.querySelectorAll('.o_tl_cell')[{column}]"
                self.check('M44', cell, scheme, viewport, 'unavailable cell D+1')

    def test_m45_m46_folded_column(self):
        combos = self.combos(['M45', 'M46'])
        self._capacity_state(folded=True)
        for scheme, viewport in combos:
            with self.page('test_web_gantt.host_action_h12', scheme, viewport):
                self.check('M45', "document.querySelector('.o_tl_col.o_tl_folded')",
                           scheme, viewport, 'folded column header')
                folded_cell = f"{self.row('Host Contact 1')}.querySelector('.o_tl_folded_cell')"
                self.check('M46', folded_cell, scheme, viewport, 'folded body cell')

    def test_m47_m50_row_header_capacity(self):
        combos = self.combos(['M47', 'M48', 'M49', 'M50'])
        self._capacity_state(folded=True)
        for scheme, viewport in combos:
            with self.page('test_web_gantt.host_action_h12', scheme, viewport):
                header = f"{self.row('Host Contact 1')}.querySelector('.o_tl_row_header')"
                self.check('M47', f"{header}.querySelector('.o_tl_progress')", scheme, viewport,
                           'progress track')
                self.check('M48', f"{header}.querySelector('.o_tl_progress_fill')", scheme,
                           viewport, 'progress fill')
                self.check('M49', f"{header}.querySelector('.o_tl_progress_label')", scheme,
                           viewport, 'progress label')
                self.check('M50', header, scheme, viewport, 'row header with a bar')

    # -- M51 and M52: the sample state of H8 ----------------------------------------

    def test_m51_m52_sample(self):
        for scheme, viewport in self.combos(['M51', 'M52']):
            with self.page('test_web_gantt.host_action_h8', scheme, viewport):
                cell = ".o_tl_row .o_tl_cell.o_tl_sample:not(.o_tl_is_today)"
                self.check('M51', f"document.querySelector('{cell}')", scheme, viewport,
                           'sample body cell')
                override = None
                if viewport == 'phone':
                    # residual difference (T17-5): the table reads 178, which is above the header
                    # rows of the spec's own phone screen (S15); the help stays under them
                    top = self.geometry("document.querySelector('.o_tl_renderer')")['geometry.y']
                    override = {'geometry.y': str(top + 26)}
                self.check('M52', "document.querySelector('.o_tl_renderer .o_view_nocontent')",
                           scheme, viewport, 'no-content help', override=override)

    # -- M53 to M63 and O-5: gradients of group rows --------------------------------

    def test_m53_m63_group_gradients(self):
        """Open rows, the pointer on Beta, then Alpha collapsed. Light values follow O-5."""
        probes = [f'M{n}' for n in (53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63)]
        for scheme, viewport in self.combos(probes + ['M25'], schemes=SCHEMES):
            light = scheme == 'light'
            open_image = {'background-image': LIGHT_OPEN} if light else None
            closed_image = {'background-image': LIGHT_CLOSED} if light else None
            with self.page('test_web_gantt.host_action_h3', scheme, viewport):
                alpha = self.row('Alpha')
                beta = self.row('Beta')
                self.check('M56', _header(alpha), scheme, viewport, 'Alpha header, open',
                           override=open_image)
                self.check('M57', _first_cell(alpha, False), scheme, viewport,
                           'Alpha cell of another day, open', override=open_image)
                self.check('M58', _first_cell(alpha, True), scheme, viewport,
                           'Alpha cell of today, open', override=open_image)
                if viewport == 'desktop':
                    self.pointer_to(_header(beta))
                    self.check('M59', _header(beta), scheme, viewport,
                               'Beta header, pointer over', override=closed_image)
                    self.check('M60', _first_cell(beta, False), scheme, viewport,
                               'Beta cell, pointer over the header', override=closed_image)
                    self.pointer_away()
                self.click_js(_header(alpha))
                self.check('M53', _header(alpha), scheme, viewport,
                           'Alpha header, collapsed', only=('background-color',))
                self.check('M54', _first_cell(alpha, True), scheme, viewport,
                           'Alpha cell of today, collapsed', only=('background-color',))
                self.check('M55', _first_cell(alpha, False), scheme, viewport,
                           'Alpha cell of another day, collapsed', only=('background-color',))
                self.check('M61', _header(alpha), scheme, viewport,
                           'Alpha header, collapsed', override=closed_image)
                self.check('M62', _first_cell(alpha, True), scheme, viewport,
                           'Alpha cell of today, collapsed')
                self.check('M63', _first_cell(alpha, False), scheme, viewport,
                           'Alpha cell of another day, collapsed', override=closed_image)

    # -- A116 and M64: pills without colour -----------------------------------------

    def test_a116_neutral_grey_dark(self):
        """H5 dark: every pill is the grey of M64 with black text; light: M1 light."""
        for scheme in SCHEMES:
            if scheme == 'dark' and not self.has_theme:
                continue
            want = (NEUTRAL_GREY if scheme == 'dark'
                    else MEASURED['M1'][('light', 'desktop')]['background-color'])
            with self.page('test_web_gantt.host_action_h5', scheme, 'desktop'):
                count = self.js("document.querySelectorAll('.o_tl_pill').length")
                self.assertGreater(count, 0, 'H5 shows no pill')
                for index in range(count):
                    pill = f"document.querySelectorAll('.o_tl_pill')[{index}]"
                    label = f'H5 pill {index}'
                    self.probe('A116', pill, scheme, 'desktop',
                               {'background-color': want, 'color': 'rgba(0, 0, 0, 1)'}, label)

    def test_m64_list_header_grey(self):
        for scheme in SCHEMES:
            if scheme == 'dark' and not self.has_theme:
                continue
            with self.page('test_web_gantt.host_action_h1', scheme, 'desktop',
                           query='?view_type=list'):
                self.check('M64', "document.querySelector('.o_list_renderer th.o_column_sortable')",
                           scheme, 'desktop', 'sortable list column header')
