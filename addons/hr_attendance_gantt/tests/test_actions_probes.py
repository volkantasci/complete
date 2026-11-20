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

from .actions_fixtures import action_in_november
from .actions_probe_values import measured
from .hr_rows_fixtures import PREFIX, TZ, _datetime, make_prepared
from .test_hr_rows_probes import (
    CLOCK,
    LABEL,
    HrProbes,
    cell_of_day,
    in_row,
    pills_of,
    row_js,
)

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


DIALOGS = f"document.querySelectorAll('{MODAL}').length"
POPOVERS = "document.querySelectorAll('.o_popover:not(:has(.o-tooltip))').length"
FOOTER_BUTTONS = (
    f"[...document.querySelectorAll('{MODAL} .modal-footer button')]"
    ".filter((el) => el.getClientRects().length > 0).length")
TITLE = f"document.querySelector('{MODAL} .modal-title')"
CONTENT = f"document.querySelector('{MODAL} .modal-content')"
CUT = ".o_tl_pill_cut_start, .o_tl_pill_cut_stop"
MOVABLE = (
    "[...document.querySelectorAll('.o_tl_pill')]"
    f".filter((el) => !el.matches('{CUT}')).length")


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
        # the cut pills of the Day range (M50, M51)
        cls.employee('HRA Anita', ('2026-01-01', None), [
            ('2026-11-10 03:00:00', '2026-11-11 03:00:00'),
            ('2026-11-11 03:00:10', '2026-11-11 08:00:00')])
        cls.employee('HRA Jennie', ('2024-11-01', '2026-12-01'),
                     [('2026-11-10 19:00:00', '2026-11-11 07:00:00')])
        cls.env.flush_all()

    @classmethod
    def employee(cls, name, contract, attendances):
        staff = cls.env['hr.employee']
        employee = staff.create({
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

    # -- Task 6: the record dialog opened by a click, a tap or a handle (R9 to R12; M5 to M11,
    # M49 to M51). M11 is the original's defect (two dialogs, decision D1): Complete shows one.

    def abigail(self):
        return f"({pills_of('HRA Abigail')})[0]"

    def test_m05_to_m08_the_dialog_of_a_click(self):
        for scheme in self.schemes(['M5', 'M8']):
            for viewport in VIEWPORTS:
                with self.subTest(scheme=scheme, viewport=viewport), self.open(scheme, viewport):
                    self.loaded(viewport)
                    if viewport == 'phone':
                        self.js(f"{self.abigail()}.scrollIntoView({{inline: 'center'}})")
                        self.settle(500)
                        self.finger_tap(self.abigail())
                    else:
                        self.real_click(self.abigail())
                    self.wait(f"!!document.querySelector('{MODAL} .o_form_view .o_form_sheet')",
                              timeout=30)
                    self.settle(1500)
                    self.check_text(TITLE, 'Open', 'the dialog is titled Open')
                    self.check('M5', CONTENT, scheme, viewport, 'the dialog')
                    self.check('M8', TITLE, scheme, viewport, 'the title')
                    self.check_count('M6', POPOVERS, scheme, viewport, 'popovers')
                    self.check_count('M7', FOOTER_BUTTONS, scheme, viewport, 'footer buttons')

    def test_m09_tap_with_touch_on_the_desktop(self):
        for scheme in self.schemes(['M9']):
            with self.subTest(scheme=scheme), self.open(scheme, 'desktop', touch=True):
                self.loaded('desktop')
                self.finger_tap(self.abigail())
                self.settle(1500)
                self.check_count('M9', DIALOGS, scheme, 'desktop', 'dialogs')

    def test_m10_tap_on_the_phone_scrolled(self):
        for scheme in self.schemes(['M10'], 'phone'):
            with self.subTest(scheme=scheme), self.open(scheme, 'phone', touch=True):
                self.loaded('phone')
                self.js("document.querySelector('.o_tl_renderer').scrollLeft += 120")
                self.settle(600)
                self.finger_tap(self.abigail())
                self.settle(1500)
                self.check_count('M10', DIALOGS, scheme, 'phone', 'dialogs')

    def test_m11_two_clicks_open_one_dialog(self):
        """The original opens two dialogs (M11); Complete opens one (decision D1)."""
        with self.open('light'):
            self.loaded()
            x, y = self.centre(self.abigail())
            self.mouse('mouseMoved', x, y, buttons=0)
            for count in (1, 2):
                self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=count)
                self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=count)
            self.settle(1500)
            self.assertEqual(self.js(DIALOGS), 1)

    def test_m49_handle_press_release(self):
        for scheme in self.schemes(['M49']):
            with self.subTest(scheme=scheme), self.open(scheme):
                self.loaded()
                self.rest_on(self.abigail(), settle=0.5)
                box = self.geometry(self.abigail())
                x = box['geometry.x'] + box['geometry.width'] - 4
                y = box['geometry.y'] + box['geometry.height'] / 2
                self.mouse('mouseMoved', x, y, buttons=0)
                self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=1)
                self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=1)
                self.settle(1500)
                self.check_count('M49', DIALOGS, scheme, 'desktop', 'dialogs')

    def test_m50_m51_cut_pills(self):
        for scheme in self.schemes(['M50']):
            with self.subTest(scheme=scheme), self.open(scheme):
                self.loaded()
                self.check_count('M51', MOVABLE, scheme, 'desktop', 'pills that can be moved')
                cut = (f"[...{row_js('HRA Anita')}.querySelectorAll('.o_tl_pill')]"
                       f".find((el) => el.matches('{CUT}'))")
                self.real_click(cut)
                self.settle(1500)
                self.check_count('M50', DIALOGS, scheme, 'desktop', 'dialogs')


NOTICES_WITH_UNDO = (
    "[...document.querySelectorAll('.o_tl_notification')]"
    ".filter((el) => el.querySelector('.o_notification_buttons button')).length")
PILLS_READING_A = (
    "[...document.querySelectorAll('.o_tl_pill_title')]"
    ".filter((el) => el.textContent.trim() === 'A').length")
MOVED_BODY = "document.querySelector('.o_tl_pill_moved > .o_tl_pill')"


@tagged('post_install', '-at_install')
class TestMoveProbes(HrProbes):
    """Task 8: the pill being dragged and dropped (M44 to M46) and an open attendance moved or
    resized (M47, M48). Abigail's attendance and the open one of "HRA Moved" (open since 8:00
    Brussels time) are the whole world; every test starts from the class's records again."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.archive_others('HRA ')
        for name, attendances in (
            ('HRA Abigail', [('2026-11-11 06:00:00', '2026-11-11 09:30:00')]),
            ('HRA Moved', [('2026-11-11 07:00:00', None)]),
        ):
            staff = cls.env['hr.employee']
            staff.create({
                'name': name, 'tz': TZ, 'resource_calendar_id': cls.schedule.id,
                'contract_date_start': '2026-01-01', 'date_version': '2026-01-01',
            })
            employee = staff.search([('name', '=', name)])
            for check_in, check_out in attendances:
                cls.env['hr.attendance'].with_context(skip_time_rules=True).create({
                    'employee_id': employee.id, 'check_in': _datetime(check_in),
                    'check_out': _datetime(check_out)})
        cls.env.flush_all()

    def restore(self):
        """The records as the class made them: one scheme's drag leaves nothing to the next."""
        self.env.invalidate_all()
        attendances = self.env['hr.attendance']
        for name, check_in, check_out in (
            ('HRA Abigail', '2026-11-11 06:00:00', '2026-11-11 09:30:00'),
            ('HRA Moved', '2026-11-11 07:00:00', None),
        ):
            attendances.search([('employee_id.name', '=', name)]).with_context(
                skip_time_rules=True).write({
                    'check_in': _datetime(check_in), 'check_out': _datetime(check_out)})
        self.env.flush_all()

    def check_count(self, probe, count_js, scheme, viewport, label):
        want = int(measured(probe, viewport)[scheme]['count'])
        with self.subTest(probe=probe, scheme=scheme, viewport=viewport, element=label):
            self.assertEqual(self.js(count_js), want, f'{probe} {scheme}/{viewport} {label}')

    def check_grown(self, probe, element_js, scheme, label):
        """The box of an element grown by the 1 px gap on each side (the pill's outer box)."""
        box = self.geometry(element_js)
        grown = {
            'geometry.x': box['geometry.x'] - 1, 'geometry.y': box['geometry.y'] - 1,
            'geometry.width': box['geometry.width'] + 2,
            'geometry.height': box['geometry.height'] + 2,
        }
        for prop, want in measured(probe)[scheme].items():
            with self.subTest(probe=probe, scheme=scheme, prop=prop, element=label):
                why = compare_value(prop, want, grown[prop])
                self.assertIsNone(why, f'{probe} {scheme} {prop}: {why}')

    def press_and_drag(self, x, y, dx, steps=12):
        self.mouse('mouseMoved', x, y, buttons=0)
        self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=1)
        for step in range(1, steps + 1):
            self.mouse('mouseMoved', x + dx * step / steps, y, buttons=1)
        self.settle(400)

    def release(self, x, y):
        self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=1)
        self.settle(1500)

    def test_m44_to_m46_a_pill_dragged_and_dropped(self):
        pill = f"({pills_of('HRA Abigail')})[0]"
        for scheme in self.schemes(['M44']):
            self.restore()
            with self.subTest(scheme=scheme), self.open(scheme):
                self.loaded()
                x, y = self.centre(pill)
                self.press_and_drag(x, y, 111)
                self.check_grown('M44', MOVED_BODY, scheme, 'the pill being dragged')
                self.release(x + 111, y)
                self.check_grown('M45', pill, scheme, 'the pill after the drop')
                self.check_count('M46', NOTICES_WITH_UNDO, scheme, 'desktop', 'notifications')

    def test_m47_open_attendance_stays_open_after_a_move(self):
        """M47 is the original's defect (the moved open attendance gets a check-out and reads a
        duration, no pill reads "A"); decision D4: Complete's pill still reads "A"."""
        pill = f"({pills_of('HRA Moved')})[0]"
        with self.open('light'):
            self.loaded()
            self.assertEqual(self.js(PILLS_READING_A), 1)
            x, y = self.centre(pill)
            self.press_and_drag(x, y, 111)
            self.release(x + 111, y)
            self.assertEqual(self.js(PILLS_READING_A), 1)
            self.env.invalidate_all()
            self.assertFalse(self.env['hr.attendance'].search(
                [('employee_id.name', '=', 'HRA Moved')]).check_out)

    def test_m48_start_of_an_open_attendance(self):
        pill = f"({pills_of('HRA Moved')})[0]"
        for scheme in self.schemes(['M48']):
            self.restore()
            with self.subTest(scheme=scheme), self.open(scheme):
                self.loaded()
                self.rest_on(pill, settle=0.5)
                box = self.geometry(pill)
                x = box['geometry.x'] + 4
                y = box['geometry.y'] + box['geometry.height'] / 2
                self.press_and_drag(x, y, -55.5, steps=6)
                self.release(x - 55.5, y)
                self.check_count('M48', PILLS_READING_A, scheme, 'desktop', 'pills reading A')


WORKED_HOURS = "document.querySelector(\"button[name='action_open_last_month_attendances']\")"
BUTTON_BOX_TOGGLE = "document.querySelector('.o_form_view .o-form-buttonbox .o_button_more')"
SWITCH_BUTTONS = "document.querySelectorAll('.o_cp_switch_buttons .o_switch_view')"
SWITCH_MENU = "document.querySelector('.o_cp_switch_buttons > button')"
BAND = "document.querySelector('.o_hag_overview_band')"
CARD = "document.querySelector('.o_hag_overview_band .o_attendance_entry_card')"
CARD_WORDS = (
    "{textContent: [...document.querySelectorAll('.o_hag_overview_band "
    ".o_attendance_entry_card span')].map((el) => el.textContent.trim()).join(' ')}")
PERIOD_LINE ="document.querySelector('.o_tl_col_group')"
ROW_HEADERS_SHOWN = (
    "[...document.querySelectorAll('.o_tl_row:not(.o_tl_total_row) .o_tl_row_header')]"
    ".filter((el) => el.textContent.trim() || el.querySelector('img, .o_hrg_avatar')).length")
BARS = "document.querySelectorAll('.o_tl_progress:not(.o_hag_bar_space)').length"


@tagged('post_install', '-at_install')
class TestMonthlyProbes(HrProbes):
    """Task 9: the monthly view opened from the employee form of Anita (M37 to M43). Her two
    attendances of 10 and 11 November make the card "29h Work"; she is the only employee."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.archive_others('HRA ')
        cls.anita = cls.env['hr.employee'].create({
            'name': 'HRA Anita', 'tz': TZ, 'resource_calendar_id': cls.schedule.id,
            'contract_date_start': '2026-01-01', 'date_version': '2026-01-01'})
        for check_in, check_out in (('2026-11-10 03:00:00', '2026-11-11 03:00:00'),
                                    ('2026-11-11 03:00:10', '2026-11-11 08:00:00')):
            cls.env['hr.attendance'].with_context(skip_time_rules=True).create({
                'employee_id': cls.anita.id, 'check_in': _datetime(check_in),
                'check_out': _datetime(check_out)})
        cls.env.flush_all()

    def check(self, probe, element_js, scheme, viewport, label):
        expected = dict(measured(probe, viewport).get(scheme, {}))
        self.assertTrue(expected, f'no value of {probe} in {scheme}/{viewport}')
        self.probe(probe, element_js, scheme, viewport, expected, label)

    def check_count(self, probe, count_js, scheme, viewport, label):
        want = int(measured(probe, viewport)[scheme]['count'])
        with self.subTest(probe=probe, scheme=scheme, viewport=viewport, element=label):
            self.assertEqual(self.js(count_js), want, f'{probe} {scheme}/{viewport} {label}')

    def open_form(self, scheme, viewport):
        return self.page(
            'hr.open_view_employee_list_my', scheme, viewport, query=f'/{self.anita.id}',
            touch=False, clock=CLOCK, ready='.o_form_view .o_field_widget[name="name"]')

    def press_worked_hours(self, viewport):
        """The button, on the phone through the button-box toggle."""
        self.wait(f"!!{WORKED_HOURS} || !!{BUTTON_BOX_TOGGLE}", timeout=60)
        if viewport == 'phone':
            self.click_js(BUTTON_BOX_TOGGLE)
            self.wait(f"!!{WORKED_HOURS}")
        self.click_js(WORKED_HOURS)
        self.wait("!!document.querySelector('.o_list_view')", timeout=60)
        self.settle(900)

    def choose_gantt(self, viewport):
        if viewport == 'phone':
            self.click_js(SWITCH_MENU)
            self.wait("!![...document.querySelectorAll('.o-dropdown--menu .o-dropdown-item')]"
                      ".find((el) => el.textContent.trim() === 'Gantt')")
            self.settle(700)
            self.click_js("[...document.querySelectorAll('.o-dropdown--menu .o-dropdown-item')]"
                          ".find((el) => el.textContent.trim() === 'Gantt')")
        else:
            self.click_js(f"[...{SWITCH_BUTTONS}].find((el) => el.dataset.tooltip === 'Gantt')")
        self.wait("!!document.querySelector('.o_tl_renderer .o_tl_row')", timeout=60)
        self.wait("!!document.querySelector('.o_hag_overview_band .o_attendance_entry_card')",
                  timeout=30)
        self.settle(1200)

    def test_m37_m38_the_monthly_list(self):
        """S11: the list is the default view, and the switcher shows List and Gantt."""
        for scheme in self.schemes(['M37']):
            with self.subTest(scheme=scheme), action_in_november(), \
                    self.open_form(scheme, 'desktop'):
                self.press_worked_hours('desktop')
                self.check_count(
                    'M37', f"{SWITCH_BUTTONS.replace('.o_switch_view', '.o_switch_view.active')}"
                    ".length", scheme, 'desktop', 'the active view button')
                self.check_count('M38', f"{SWITCH_BUTTONS}.length", scheme, 'desktop',
                                 'the view buttons')

    def test_m39_to_m43_the_monthly_gantt(self):
        """S12: the band, its card, the period line, no row header and no bar."""
        for scheme in self.schemes(['M39', 'M40', 'M42']):
            for viewport in VIEWPORTS:
                if viewport == 'phone' and not measured('M39', 'phone').get(scheme):
                    continue
                with self.subTest(scheme=scheme, viewport=viewport), action_in_november(), \
                        self.open_form(scheme, viewport):
                    self.press_worked_hours(viewport)
                    self.choose_gantt(viewport)
                    self.check('M39', BAND, scheme, viewport, 'the overview band')
                    if measured('M40', viewport).get(scheme):
                        self.check('M40', CARD, scheme, viewport, 'the card')
                    self.check_text(CARD_WORDS, '29h Work', 'the card reads 29h Work')
                    self.check('M42', PERIOD_LINE, scheme, viewport, 'the period line')
                    self.check_count('M41', ROW_HEADERS_SHOWN, scheme, viewport, 'row headers')
                    self.check_count('M43', BARS, scheme, viewport, 'progress bars')


@tagged('post_install', '-at_install')
class TestActionsPreparedProbes(HrProbes):
    """The prepared employees of 002d2, found by the search "Gantt" (A67, A68)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.archive_others(PREFIX)

    # the values of this slice's table, not 002d2's
    schemes = TestActionsProbes.schemes
    check = TestActionsProbes.check

    def setUp(self):
        super().setUp()
        make_prepared(self.env, demo_schedule=self.schedule)
        self.env.flush_all()

    def hovered_cell(self, probe, date, scheme):
        """The cell of ``date`` of "Gantt Hourly" with the pointer on its row, whose background
        then differs from the view's: a painted part and a transparent one would not look the
        same (R23, last sentence)."""
        name = 'Gantt Hourly'
        box = self.geometry(in_row(name, '.o_tl_row_header'))
        self.mouse('mouseMoved', box['geometry.x'] + 20, box['geometry.y'] + 12, buttons=0)
        self.settle(700)
        image = self.js(f"getComputedStyle({cell_of_day(name, date)}).backgroundImage")
        with self.subTest(probe=probe, scheme=scheme, prop='no transparent part'):
            self.assertNotIn('transparent', image)
        self.check(probe, cell_of_day(name, date), scheme, 'desktop', f'the cell of {date}')

    def test_a67_available_quarters(self):
        for scheme in self.schemes(['M82']):
            with self.open(scheme):
                self.loaded()
                self.search('Gantt')
                self.choose_range('week')
                self.step(-1)
                self.hovered_cell('M82', '2026-11-02', scheme)

    def test_a68_available_quarters_in_todays_column(self):
        for scheme in self.schemes(['M83']):
            with self.open(scheme):
                self.loaded()
                self.search('Gantt')
                self.choose_range('week')
                self.hovered_cell('M83', '2026-11-11', scheme)


@tagged('post_install', '-at_install')
class TestActionsTitleProbes(HrProbes):
    """A72 (N4): Anita's row header, with the label of one of CI's own employees."""

    # the values of this slice's table, not 002d2's
    schemes = TestActionsProbes.schemes
    check = TestActionsProbes.check

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.archive_others('HRA ')
        TestActionsProbes.employee.__func__(
            cls, 'HRA Anita', ('2026-01-01', None), [
                ('2026-11-10 03:00:00', '2026-11-11 03:00:00'),
                ('2026-11-11 03:00:10', '2026-11-11 08:00:00')])
        cls.env.flush_all()

    # -- the boxes of the title line (M84 to M93); the tooltip of the name (M94, M95) is a tour --

    def title_probes(self, scheme, viewport, short=False):
        """The boxes of Anita's row header: the title line, the name area, the avatar-and-name
        box and the hours label, as measured values where the text does not decide them and as
        relations where it does (the label's text, hence the widths of M85, M86, M89, M90 and the
        x of the label, differ in CI's data: the demo's "5h / 8h (3h left)" is not worth the
        same width as "9h / 8h (+1h)")."""
        name = 'HRA Anita'
        title_js = in_row(name, '.o_tl_row_line')
        area_js = in_row(name, '.o_hrg_name_area')
        identity_js = in_row(name, '.o_hrg_identity')
        label_js = in_row(name, LABEL)
        first = ('M84', 'M85', 'M86', 'M87') if viewport == 'desktop' else (
            'M88', 'M89', 'M90', 'M91')
        # the row's place on the page (y) depends on the control bar of the page: it is read as
        # the title line's offset under its row, below
        skip_y = ('geometry.y',)
        if short:
            # the short label form: the title line and the name area of the narrow header
            self.check('M93', title_js, scheme, 'desktop', 'the title line, window 1399',
                       skip=skip_y)
            self.check('M92', area_js, scheme, 'desktop', 'the name area, window 1399',
                       skip=('geometry.width', *skip_y))
        else:
            self.check(first[0], title_js, scheme, viewport, 'the title line', skip=skip_y)
            self.check(first[1], area_js, scheme, viewport, 'the name area',
                       skip=('geometry.width', *skip_y))
            self.check(first[2], identity_js, scheme, viewport, 'the avatar-and-name box',
                       skip=('geometry.width', *skip_y))
            self.check(first[3], label_js, scheme, viewport, 'the label', skip=skip_y)
        row = self.geometry(row_js(name))
        title, area = self.geometry(title_js), self.geometry(area_js)
        identity, label = self.geometry(identity_js), self.geometry(label_js)
        with self.subTest(probe='N4', scheme=scheme, viewport=viewport, short=short):
            # the title line is 3.5 px under its row's top; the label is level with the box
            self.assertAlmostEqual(title['geometry.y'] - row['geometry.y'], 3.5, delta=0.5)
            self.assertAlmostEqual(label['geometry.y'], identity['geometry.y'], delta=0.5)
            # the name area ends where the label starts, as tall as the title line
            self.assertAlmostEqual(area['geometry.x'], title['geometry.x'], delta=0.5)
            self.assertAlmostEqual(
                area['geometry.x'] + area['geometry.width'], label['geometry.x'], delta=0.5)
            self.assertAlmostEqual(area['geometry.height'], title['geometry.height'], delta=0.5)
            # the avatar-and-name box is 1 px inside it on every side
            self.assertAlmostEqual(identity['geometry.x'], area['geometry.x'] + 1, delta=0.5)
            self.assertAlmostEqual(identity['geometry.y'], area['geometry.y'] + 1, delta=0.5)
            self.assertAlmostEqual(
                identity['geometry.x'] + identity['geometry.width'],
                area['geometry.x'] + area['geometry.width'] - 1, delta=0.5)
            self.assertAlmostEqual(
                identity['geometry.height'], area['geometry.height'] - 2, delta=0.5)
            # the label's text ends 8 px before the title line's right edge
            self.assertAlmostEqual(
                label['geometry.x'] + label['geometry.width'],
                title['geometry.x'] + title['geometry.width'] - 8, delta=0.5)
            self.assertAlmostEqual(
                label['geometry.height'], identity['geometry.height'], delta=0.5)
        for js in (title_js, area_js, identity_js):
            drawn = self.read(js, ['background-color', 'border-top-width', 'border-right-width',
                                   'border-bottom-width', 'border-left-width'])
            with self.subTest(probe='N4', scheme=scheme, drawn=js[-40:]):
                self.assertEqual(drawn['background-color'], 'rgba(0, 0, 0, 0)')
                self.assertEqual(
                    [drawn[f'border-{side}-width'] for side in ('top', 'right', 'bottom', 'left')],
                    ['0px'] * 4)

    def test_a72_the_boxes_of_the_title_line(self):
        for scheme in self.schemes(['M84', 'M85', 'M86', 'M87']):
            with self.open(scheme):
                self.loaded()
                self.title_probes(scheme, 'desktop')

    def test_a72_the_boxes_of_the_title_line_phone(self):
        for scheme in self.schemes(['M88', 'M89', 'M90', 'M91'], 'phone'):
            with self.open(scheme, 'phone'):
                self.loaded('phone')
                self.title_probes(scheme, 'phone')

    def test_a72_the_boxes_in_a_window_1399_wide(self):
        for scheme in self.schemes(['M92', 'M93']):
            with self.open(scheme):
                self.browser._websocket_request('Emulation.setDeviceMetricsOverride', params={
                    'width': 1399, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
                self.loaded()
                self.settle(1000)
                self.title_probes(scheme, 'desktop', short=True)
