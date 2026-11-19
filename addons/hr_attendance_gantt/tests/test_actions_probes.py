# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes of the measured values of slice 002d3 (spec.md, "Measured values"): the creation dialog
of the attendance Gantt view with and without the contract warning, and the correction link, in a
real headless Chrome, compared with the table of the original by machine
(``actions_probe_values``).

Run only these: ``--test-tags /hr_attendance_gantt:TestActionsProbes``. The dark scheme needs
``web_enterprise``; without it the dark probes are skipped. The browser clock is Wednesday 11
November 2026, 10:00:05 UTC (11:00 in Brussels), the window 1600 x 900 (phone 390 x 844).

Elements read: M12, M17 the dialog's content box ``.modal-content``; M13, M18 its header
``.modal-header``; M14, M19 the status bar ``.o_form_statusbar``; M15, M20 the sheet
``.o_form_sheet``; M16, M21 the footer ``.modal-footer``; M22 the warning
``.o_hag_contract_warning``; M23 the link ``.o_hag_correct_employee``.
Counts: M24 the warnings drawn in the dialog of Abigail, M25 the dialogs open after the
link, M26 the breadcrumb's last item after it.
"""
import json

from odoo.addons.test_web_gantt.tests.timeline_probe import compare_value
from odoo.tests import tagged

from .actions_probe_values import measured
from .hr_rows_fixtures import TZ, _datetime
from .test_hr_rows_probes import HrProbes, in_row, row_js

SCHEMES = ('light', 'dark')
VIEWPORTS = ('desktop', 'phone')
MODAL = ".modal:not(.o_inactive_modal)"
BOXES = {
    'M12': f"document.querySelector('{MODAL} .modal-content')",
    'M13': f"document.querySelector('{MODAL} .modal-header')",
    'M14': f"document.querySelector('{MODAL} .o_form_statusbar')",
    'M15': f"document.querySelector('{MODAL} .o_form_sheet')",
    'M16': f"document.querySelector('{MODAL} .modal-footer')",
}
WITHOUT = {'M12': 'M17', 'M13': 'M18', 'M14': 'M19', 'M15': 'M20', 'M16': 'M21'}
WARNING = f"document.querySelector('{MODAL} .o_hag_contract_warning')"
LINK = f"document.querySelector('{MODAL} .o_hag_correct_employee')"
WARNINGS_DRAWN = (
    f"[...document.querySelectorAll('{MODAL} .o_hag_contract_warning')]"
    ".filter((el) => el.getClientRects().length > 0).length")


@tagged('post_install', '-at_install')
class TestActionsProbes(HrProbes):
    """Abigail (a contract) and Beth (none), named "HRA ..." as the demo-like world."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.archive_others('HRA ')
        cls.employee('HRA Abigail', ('2026-10-01', '2027-01-11'),
                     [('2026-11-11 06:00:00', '2026-11-11 09:30:00')])
        cls.employee('HRA Beth', None, [])
        cls.env.flush_all()

    @classmethod
    def employee(cls, name, contract, attendances):
        employee = cls.env['hr.employee'].create({
            'name': name, 'tz': TZ, 'resource_calendar_id': cls.schedule.id,
            'contract_date_start': contract[0] if contract else False,
            'contract_date_end': contract[1] if contract else False,
            'date_version': contract[0] if contract else '2026-01-01',
        })
        for check_in, check_out in attendances:
            cls.env['hr.attendance'].with_context(skip_time_rules=True).create({
                'employee_id': employee.id, 'check_in': _datetime(check_in),
                'check_out': _datetime(check_out)})
        return employee

    # -- the values of this slice's table -----------------------------------------------------

    def schemes(self, probes, viewport='desktop'):
        found = [scheme for scheme in SCHEMES
                 if any(scheme in measured(probe, viewport) for probe in probes)
                 and (scheme == 'light' or self.has_theme)]
        if not found:
            self.skipTest('the dark scheme needs web_enterprise, which is not installed')
        return found

    def check(self, probe, element_js, scheme, viewport, label, skip=()):
        expected = {prop: value for prop, value in measured(probe, viewport).get(scheme, {}).items()
                    if prop not in skip}
        self.assertTrue(expected, f'no value of {probe} in {scheme}/{viewport}')
        self.probe(probe, element_js, scheme, viewport, expected, label)

    def check_count(self, probe, count_js, scheme, viewport, label):
        want = int(measured(probe, viewport)[scheme]['count'])
        got = self.js(count_js)
        with self.subTest(probe=probe, scheme=scheme, viewport=viewport, element=label):
            self.assertEqual(got, want, f'{probe} {scheme}/{viewport} {label}')

    # -- the dialog ----------------------------------------------------------------------------

    def click_cell_at(self, name, hour):
        """A real click 20 px right of the left edge of the hour column, at the middle of the
        row's header (acceptance, "Navigating")."""
        cell = f"{row_js(name)}.querySelector('.o_tl_cell[data-column=\"{hour}\"]')"
        self.js(f"{cell}.scrollIntoView({{block: 'nearest', inline: 'center'}})")
        self.settle(600)
        box = self.geometry(cell)
        header = self.geometry(in_row(name, '.o_tl_row_header'))
        x, y = box['geometry.x'] + 20, header['geometry.y'] + header['geometry.height'] / 2
        self.mouse('mouseMoved', x, y, buttons=0)
        self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=1)
        self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=1)
        self.wait(f"!!document.querySelector('{MODAL} .o_form_view .o_form_sheet')", timeout=30)
        self.settle(1500)

    def dialog_for(self, name, scheme, viewport):
        self.open(scheme, viewport)
        self.loaded(viewport)
        self.click_cell_at(name, 15)

    def test_m12_to_m16_m22_m23_with_the_warning(self):
        """S5: the dialog of Beth Evans without a contract (A18)."""
        for scheme in self.schemes(['M12', 'M22']):
            for viewport in VIEWPORTS:
                with self.subTest(scheme=scheme, viewport=viewport), \
                        self.open(scheme, viewport):
                    self.loaded(viewport)
                    self.click_cell_at('HRA Beth', 15)
                    self.check_text(f"document.querySelector('{MODAL} .modal-title')", 'Create',
                                    'the dialog is titled Create')
                    for probe, element in BOXES.items():
                        self.check(probe, element, scheme, viewport, probe)
                    self.check('M22', WARNING, scheme, viewport, 'the warning line')
                    self.check('M23', LINK, scheme, viewport, 'the link')
                    self.check_text(LINK, 'Correct employee', 'the link text')
                    self.assertEqual(self.js(WARNINGS_DRAWN), 1)

    def test_m17_to_m21_m24_without_the_warning(self):
        """S6: the dialog of Abigail Peterson under contract (A19)."""
        for scheme in self.schemes(['M17']):
            for viewport in VIEWPORTS:
                with self.subTest(scheme=scheme, viewport=viewport), \
                        self.open(scheme, viewport):
                    self.loaded(viewport)
                    self.click_cell_at('HRA Abigail', 15)
                    for probe, element in BOXES.items():
                        self.check(WITHOUT[probe], element, scheme, viewport, WITHOUT[probe])
                    self.check_count('M24', WARNINGS_DRAWN, scheme, viewport, 'warnings drawn')

    def test_m25_m26_after_the_link(self):
        """S7: the dialog is gone and the employee's form ends the breadcrumb (A24)."""
        for scheme in self.schemes(['M25']):
            with self.subTest(scheme=scheme), self.open(scheme, 'desktop'):
                self.loaded('desktop')
                self.click_cell_at('HRA Beth', 15)
                self.real_click(LINK, settle=1.5)
                self.wait("document.querySelectorAll('.o_form_view [name=\"name\"]').length > 0",
                          timeout=30)
                self.check_count('M25', "document.querySelectorAll('.modal').length", scheme,
                                 'desktop', 'dialogs open')
                self.check_count(
                    'M26', "document.querySelectorAll('.o_breadcrumb .active').length", scheme,
                    'desktop', "the breadcrumb's last item")
                self.check_text("document.querySelector('.o_breadcrumb .active')", 'HRA Beth',
                                "the breadcrumb's last item")

    def test_r25_colours_are_theme_roles(self):
        """R25: the warning's colours are the theme's warning roles, not literals of the module."""
        with self.open('light'):
            self.loaded()
            self.click_cell_at('HRA Beth', 15)
            roles = self.js("""(() => {
                const probe = document.createElement('div');
                probe.className = 'text-warning-emphasis bg-warning-subtle border-warning-subtle';
                document.body.appendChild(probe);
                const cs = getComputedStyle(probe);
                const out = [cs.color, cs.backgroundColor, cs.borderLeftColor];
                probe.remove();
                return out;
            })()""")
            own = self.read(WARNING, ['color', 'background-color', 'border-left-color'])
            for role, prop in zip(roles, ('color', 'background-color', 'border-left-color'),
                                  strict=True):
                why = compare_value(prop, role, own[prop])
                self.assertIsNone(why, f'{prop}: {json.dumps(own)}')
