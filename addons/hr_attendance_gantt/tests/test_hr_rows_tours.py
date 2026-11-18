# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the ``ui`` scenarios of slice 002d2 in the attendance Gantt view of Attendances >
Management > Dashboard. The browser clock is Wednesday 11 November 2026, 10:00 UTC (11:00 in
Brussels) and runs on, the browser zone Europe/Brussels, the window 1600 x 900 and a fresh browser
unless a scenario names another. Every record and user is created here (CI has no demo data); the
demo-data scenarios are built on ``make_demo_like`` (employees named "HRA ...")."""
import json
import time
from datetime import datetime
from unittest.mock import patch

from odoo.addons.test_web_gantt.tests import timeline_real_pointer
from odoo.addons.test_web_gantt.tests.timeline_real_pointer import MouseBridge, RealPointerMixin
from odoo.tests import HttpCase, tagged

from .hr_rows_fixtures import (
    TZ,
    _datetime,
    make_demo_like,
    make_prepared,
    make_whole_day_schedule,
)

ACTION = '/odoo/action-hr_attendance.hr_attendance_action'
NOW = datetime(2026, 11, 11, 10, 0)
SCHEDULE = 'HRA 40 hours/week'


class CommandBridge(MouseBridge):
    """The mouse bridge, and a request with a ``method`` sends that DevTools command with each of
    its events as the parameters (a window resize without a reload, A12, A49)."""

    def run(self):
        try:
            while not self.stopped.wait(.05):
                pending = self.evaluate(timeline_real_pointer.PENDING_MOUSE)
                if not pending:
                    continue
                request = json.loads(pending)
                if request['id'] in self.sent:
                    continue
                self.sent.add(request['id'])
                method = request.get('method') or (
                    'Input.dispatchTouchEvent' if request.get('touch')
                    else 'Input.dispatchMouseEvent')
                for event in request['events']:
                    self.browser._websocket_request(method, params=event)
                    time.sleep(.03)
                self.evaluate(f"window.__tl_mouse_done = {int(request['id'])}")
        except Exception as error:  # noqa: BLE001 - recorded, and re-raised by the test
            self.error = error


@tagged('post_install', '-at_install')
class TestHrRowsTours(RealPointerMixin, HttpCase):

    def setUp(self):
        super().setUp()
        self.browser_size = '1600x900'
        self.touch_enabled = False
        self.admin = self.env.ref('base.user_admin')
        self.admin.write({
            'lang': 'en_US', 'tz': TZ,
            'group_ids': [(4, self.env.ref('hr_attendance.group_hr_attendance_manager').id)],
        })
        self._one_language()
        self.schedule = make_whole_day_schedule(self.env, SCHEDULE)

    def _one_language(self):
        """One active language: a second one changes no element of the views, but adds buttons
        to the dialogs."""
        others = self.env['res.lang'].search([('active', '=', True), ('code', '!=', 'en_US')])
        if others:
            self.env['res.users'].with_context(active_test=False).search(
                [('lang', 'in', others.mapped('code'))]).write({'lang': 'en_US'})
            self.env['res.partner'].with_context(active_test=False).search(
                [('lang', 'in', others.mapped('code'))]).write({'lang': 'en_US'})
            others.write({'active': False})

    # -- helpers --------------------------------------------------------------------------------

    def start_tour_with_pointer(self, *args, **kwargs):
        with patch.object(timeline_real_pointer, 'MouseBridge', CommandBridge):
            return super().start_tour_with_pointer(*args, **kwargs)

    def _tour(self, name, now=NOW, timezone=TZ, mobile=None, login='admin', path=ACTION):
        if mobile:
            self.touch_enabled = True
            self.browser_size = f'{mobile[0]}x{mobile[1]}'
        self.start_tour_with_pointer(
            path, name, now=now, timezone=timezone, mobile=mobile, login=login)

    def _employee(self, name, contract=('2026-01-01', None), attendances=(), **values):
        vals = {
            'name': name, 'tz': TZ, 'resource_calendar_id': self.schedule.id,
            'contract_date_start': contract[0] if contract else False,
            'contract_date_end': contract[1] if contract else False,
        }
        vals.update(values)
        employee = self.env['hr.employee'].create(vals)
        for check_in, check_out in attendances:
            self.env['hr.attendance'].with_context(skip_time_rules=True).create({
                'employee_id': employee.id, 'check_in': _datetime(check_in),
                'check_out': _datetime(check_out),
            })
        return employee

    def _demo(self, **kwargs):
        """The employees of the demo table, as ``make_demo_like`` names them, with the others of
        the table that the scenarios read (ruling T10-1)."""
        like = make_demo_like(self.env, self.schedule)
        like['HRA Marc'] = self._employee(
            'HRA Marc', contract=('2025-01-01', None),
            attendances=[(f'2026-10-{day:02d} 07:00:00', f'2026-10-{day:02d} 15:00:00')
                         for day in range(1, 11)])
        return like

    def _fillers(self, count):
        """Employees that stand for the demo's others (they work through November)."""
        return [self._employee(f'HRA Filler {index:02d}') for index in range(1, count + 1)]

    def _prepared(self, **kwargs):
        return make_prepared(self.env, demo_schedule=self.schedule, **kwargs)

    def _no_contract_others(self):
        for name in ('Doris', 'Eli', 'Ernest', 'Rachel'):
            self._employee(f'HRA {name}', contract=None)
        self._employee('HRA Tina', contract=('2018-01-01', '2025-06-30'))

    # -- the employee rows ----------------------------------------------------------------------

    def test_a7_avatars(self):
        self._prepared()
        self._tour('hag_a7_avatars')

    def test_a8_levels(self):
        like = self._demo()
        sales = self.env['hr.department'].create({'name': 'HRA Sales'})
        ops = self.env['hr.department'].create({'name': 'HRA Operations'})
        like['HRA Abigail'].department_id = sales
        like['HRA Anita'].department_id = sales
        like['HRA Jennie'].department_id = ops
        like['HRA Audrey'].department_id = ops
        # Audrey has no contract: an attendance on the day gives her a row, so that "no name is
        # red, not even hers" says something
        self.env['hr.attendance'].with_context(skip_time_rules=True).create({
            'employee_id': like['HRA Audrey'].id,
            'check_in': datetime(2026, 11, 11, 8, 0), 'check_out': datetime(2026, 11, 11, 9, 0),
        })
        self._tour('hag_a8_levels')

    def test_a9_department_rows(self):
        like = self._demo()
        team = self.env['hr.department'].create({'name': 'HRA Team'})
        like['HRA Abigail'].department_id = team
        self._tour('hag_a9_department_rows')

    def test_a10_card(self):
        like = self._demo()
        like['HRA Anita'].write({
            'job_title': 'Head of Gantt', 'work_email': 'hra.anita@example.com',
            'work_phone': '+32 2 123 45 67',
        })
        self._tour('hag_a10_card')

    def test_a11_scroll(self):
        self._demo()
        self._tour('hag_a11_scroll')

    def test_a12_width(self):
        self._demo()
        self._tour('hag_a12_width')

    def test_a13_tap(self):
        self._demo()
        self._tour('hag_a13_tap', mobile=(390, 844))

    def test_a14_tooltip(self):
        self._demo()
        self._tour('hag_a14_tooltip')

    # -- the ranges -----------------------------------------------------------------------------

    def test_a15_around_today(self):
        self._demo()
        self._tour('hag_a15_around_today')

    def test_a16_far_week(self):
        self._demo()
        self._tour('hag_a16_far_week')

    def test_a17_quarter_end(self):
        self._demo()
        self._tour('hag_a17_quarter_end')

    def test_a18_day_and_custom(self):
        self._demo()
        self._tour('hag_a18_day_and_custom')

    # -- shading and pill placement -------------------------------------------------------------

    def test_a19_diagonals(self):
        self._prepared()
        self._tour('hag_a19_diagonals')

    def test_a20_quarters(self):
        self._prepared()
        self._tour('hag_a20_quarters')

    def test_a21_lunch_month(self):
        self._prepared()
        self._tour('hag_a21_lunch_month')

    def test_a22_lunch_week(self):
        self._prepared()
        self._tour('hag_a22_lunch_week')

    def test_a23_no_rounding(self):
        self._prepared()
        self._tour('hag_a23_no_rounding')
        self._demo()
        self._tour('hag_a23_jennie_two_days')

    # -- paging and searches --------------------------------------------------------------------

    def test_a26_pager(self):
        self._demo()
        self._fillers(15)
        self._tour('hag_a26_pager')

    def test_a27_empty_rows(self):
        like = self._demo()
        team = self.env['hr.department'].create({'name': 'HRA Team'})
        for name in ('HRA Abigail', 'HRA Beth', 'HRA Marc'):
            like[name].department_id = team
        self._tour('hag_a27_empty_rows')

    def test_a28_drop_rows(self):
        self._prepared()
        self._tour('hag_a28_drop_rows')

    def test_a29_archived(self):
        self._demo()
        self._tour('hag_a29_archived')

    # -- the attendance display -----------------------------------------------------------------

    def test_a30_periods(self):
        self._demo()
        self._tour('hag_a30_periods')

    def test_a31_open_attendance(self):
        self._prepared()
        # the clocks start five seconds after the hour: the page loads within the first second
        # or two, and a load at exactly 11:00:00 would end the pill at 11:00 (A31's own note)
        self._tour('hag_a31_open_at_eleven', now=datetime(2026, 11, 11, 10, 0, 5))
        self._tour('hag_a31_open_at_thirteen', now=datetime(2026, 11, 11, 12, 0, 5))

    def test_a32_open_future(self):
        self._prepared()
        self._tour('hag_a32_open_future')

    def test_a37_browser_zone(self):
        self._prepared()
        self._tour('hag_a37_browser_zone', timezone='America/New_York',
                   now=datetime(2026, 11, 11, 10, 0))

    def test_a39_unfold(self):
        self._demo()
        self._tour('hag_a39_unfold')

    def test_a40_progress_tooltip(self):
        self._demo()
        self._tour('hag_a40_progress_tooltip')

    def test_a41_shift(self):
        self._demo()
        self._tour('hag_a41_shift')

    def test_a42_folds(self):
        self._demo()
        self._tour('hag_a42_folds_day')
        self._prepared()
        self._tour('hag_a42_folds_prepared')

    def test_a48_phone_labels(self):
        self._prepared()
        self._tour('hag_a48_phone_labels', mobile=(390, 844))
        self._demo()
        self._tour('hag_a48_phone_demo', mobile=(390, 844))

    def test_a49_resize(self):
        self._demo()
        self._tour('hag_a49_resize')

    def test_a50_flexible(self):
        self._prepared()
        self._tour('hag_a50_flexible')

    def test_a51_red_names(self):
        self._demo()
        self._no_contract_others()
        self._tour('hag_a51_red_names')

    def test_a53_helper(self):
        self._demo()
        self._tour('hag_a53_helper')

    def test_a54_far_week_rows(self):
        self._demo()
        self._fillers(14)
        self._tour('hag_a54_far_week_rows')

    # -- access ---------------------------------------------------------------------------------

    def test_a55_officer(self):
        like = self._demo()
        officer = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'HRA Officer', 'login': 'hra_officer', 'password': 'hra_officer',
            'email': 'hra_officer@example.com', 'tz': TZ, 'lang': 'en_US',
            'group_ids': [(6, 0, [
                self.env.ref('base.group_user').id,
                self.env.ref('hr_attendance.group_hr_attendance_officer').id,
            ])],
        })
        like['HRA Marc'].user_id = officer
        for name in ('HRA Abigail', 'HRA Anita', 'HRA Jennie', 'HRA Keith'):
            like[name].attendance_manager_id = officer
        self._tour('hag_a55_officer', login='hra_officer')

    def test_a56_own_only(self):
        prepared = self._prepared()
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'HRA Own', 'login': 'hra_own', 'password': 'hra_own',
            'email': 'hra_own@example.com', 'tz': TZ, 'lang': 'en_US',
            'group_ids': [(6, 0, [
                self.env.ref('base.group_user').id,
                self.env.ref('hr_attendance.group_hr_attendance_own_reader').id,
            ])],
        })
        prepared['Gantt Exact'].user_id = user
        self._tour('hag_a56_own_only', login='hra_own')

    # -- inputs ---------------------------------------------------------------------------------

    def test_a58_features_off(self):
        self._demo()
        self._tour('hag_a58_features_off')

    def test_a59_framework_inputs(self):
        self._demo()
        self._tour('hag_a59_framework_inputs')

    def test_a61_phone(self):
        self._demo()
        self._tour('hag_a61_phone', mobile=(390, 844))

    def test_a62_holiday(self):
        self._demo()
        self._prepared(holiday=True)
        self._tour('hag_a62_holiday')

    def test_a64_night(self):
        self._prepared(night=True)
        self._tour('hag_a64_night')
