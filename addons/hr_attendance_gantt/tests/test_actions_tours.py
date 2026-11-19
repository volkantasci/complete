# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the ``ui`` scenarios of slice 002d3 (the actions, filters, warning, clicks and
drags of the attendance Gantt views). The clock, the zone, the window and the real mouse are the
ones of 002d2's tours (``HrToursBase``); every record and user is created here (CI has no demo
data), the demo's employees are moved out of the views by ``HrToursBase.setUp``. The tours are in
``static/tests/tours/actions_tours.js``."""
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from odoo.tests import tagged

from .actions_fixtures import make_role_users
from .hr_rows_fixtures import TZ
from .test_hr_rows_tours import HrToursBase

MY_ACTION = '/odoo/action-hr_attendance.hr_attendance_my_action'
PHONE = (390, 844)


@tagged('post_install', '-at_install')
class TestActionsTours(HrToursBase):

    def setUp(self):
        super().setUp()
        self.users = {}

    def _admin_employee(self):
        """The administrator's own employee, "Mitchell Admin" (a database without demo data has
        none of that name; the demo's was moved away with the others)."""
        return self._employee('Mitchell Admin', user_id=self.admin.id)

    def _role_users(self):
        self.users = make_role_users(self.env, schedule=self.schedule)
        return self.users

    # -- the actions ----------------------------------------------------------------------------

    def test_a2_management_search(self):
        for name in ('HRA Search A', 'HRA Search B'):
            self._employee(name, attendances=[('2026-11-11 07:00:00', '2026-11-11 09:00:00')])
        self._tour('hr_actions_a2_management_search')

    def test_a3_my_calendar(self):
        self._admin_employee()
        self._tour('hr_actions_a3_my_calendar', path=MY_ACTION)

    def test_a3_my_calendar_phone(self):
        self._admin_employee()
        self._tour('hr_actions_a3_my_calendar_phone', path=MY_ACTION, mobile=PHONE)

    def test_a4_my_gantt(self):
        self._admin_employee()
        self._tour('hr_actions_a4_my_gantt', path=MY_ACTION)

    def test_a4_my_gantt_phone(self):
        self._admin_employee()
        self._tour('hr_actions_a4_my_gantt_phone', path=MY_ACTION, mobile=PHONE)

    def test_a5_self(self):
        self._role_users()
        self._tour('hr_actions_a5_self', path=MY_ACTION, login='gantt_self')

    def test_a5_self_without_employee(self):
        self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'Gantt Lonely', 'login': 'gantt_lonely', 'password': 'gantt_lonely',
            'tz': 'Europe/Brussels', 'lang': 'en_US',
            'group_ids': [(6, 0, [
                self.env.ref('base.group_user').id,
                self.env.ref('hr_attendance.group_hr_attendance_own').id])],
        })
        self._tour('hr_actions_a5_without_employee', path=MY_ACTION, login='gantt_lonely')

    def test_a79_self_rules(self):
        self._role_users()
        self._tour('hr_actions_a79_self_rules', path=MY_ACTION, login='gantt_self')

    # -- the search menu and the contract filters -------------------------------------------------

    def _two_employees(self):
        for name in ('HRC A', 'HRC B'):
            self._employee(name, attendances=[('2026-11-11 07:00:00', '2026-11-11 09:00:00')])

    def test_a10_no_date_grouping(self):
        self._two_employees()
        self._tour('hr_actions_a10_no_date_grouping')

    def test_a11_custom_group_dropped(self):
        self._two_employees()
        self._tour('hr_actions_a11_custom_group_dropped')

    def test_a12_filters_by_role(self):
        self._role_users()
        for login in ('gantt_team', 'gantt_all', 'gantt_allhr'):
            with self.subTest(login=login):
                self._tour('hr_actions_a12_filters_by_role_shown', login=login)
        with self.subTest(login='admin'):
            self._tour('hr_actions_a12_filters_by_role_shown')
        # both read the management Gantt by its address: the absence is what they see
        for login in ('gantt_none', 'gantt_self'):
            with self.subTest(login=login):
                self._tour('hr_actions_a12_filters_by_role_hidden', login=login)

    def _days(self, zone=TZ):
        """The server's today in ``zone``: the contracts of A13 to A15 are made from it, so the
        counts do not depend on the day the test runs."""
        today = datetime.now(UTC).astimezone(ZoneInfo(zone)).date()
        return lambda days: (today + timedelta(days=days)).isoformat()

    def _contracts(self, day):
        """Two employees with a contract today, three without one."""
        self._employee('HRC Ongoing', contract=(day(-100), None))
        self._employee('HRC Never', contract=None)
        self._employee('HRC Former', contract=(day(-400), day(-30)))
        self._employee('HRC Future', contract=(day(10), None))

    def test_a13_no_active_contract(self):
        day = self._days()
        self._contracts(day)
        self._employee('HRC Ends today', contract=(day(-100), day(0)))
        self._tour('hr_actions_a13_no_active_contract')

    def test_a14_ongoing_contract(self):
        day = self._days()
        self._contracts(day)
        self._employee('HRC Ends today', contract=(day(-100), day(0)))
        self._tour('hr_actions_a14_ongoing_contract')

    def test_a15_today_in_the_users_zone(self):
        zone = 'Pacific/Kiritimati'
        day = self._days(zone)
        self._contracts(day)
        # its contract ended on the day before today in the zone of the user
        self._employee('HRC Edge', contract=(day(-100), day(-1)))
        previous = self.admin.tz
        self.addCleanup(self.admin.write, {'tz': previous})
        self.admin.tz = zone
        self.env.flush_all()
        self._tour('hr_actions_a15_today_in_the_users_zone')

    # -- the contract warning and its link (R7, R8) ----------------------------------------------

    def _warning_world(self):
        """Abigail (a contract from 1 October 2026 to 11 January 2027, an attendance on 11
        November) and Beth (no contract, nothing on that day): the two employees of A18 to A25."""
        abigail = self._employee(
            'HRA Abigail', contract=('2026-10-01', '2027-01-11'),
            attendances=[('2026-11-11 06:00:00', '2026-11-11 09:30:00')])
        beth = self._employee('HRA Beth', contract=None)
        return abigail, beth

    def _break_of(self, employee):
        return self.env['hr.attendance'].search([('employee_id', '=', employee.id)]).mapped(
            'break_duration')

    def test_a19_no_warning(self):
        self._warning_world()
        self._tour('hr_actions_a19_no_warning')

    def test_a21_follows_form(self):
        self._warning_world()
        self._tour('hr_actions_a21_follows_form')

    def test_a22_full_page_form(self):
        _abigail, beth = self._warning_world()
        # alone in the list: the other attendance moves out of the list's way
        self.env['hr.attendance'].search(
            [('employee_id', '!=', beth.id)]).with_context(skip_time_rules=True).unlink()
        self.env['hr.attendance'].with_context(skip_time_rules=True).create({
            'employee_id': beth.id, 'check_in': datetime(2026, 11, 10, 8, 0),
            'check_out': datetime(2026, 11, 10, 12, 0)})
        self.env.flush_all()
        self._tour('hr_actions_a22_full_page_form')
        self.env.invalidate_all()
        self.assertEqual(self._break_of(beth), [0.75], 'the Community saves the changed form')

    def test_a23_link_by_group(self):
        self._warning_world()
        self._role_users()
        with self.subTest(login='gantt_all'):
            self._tour('hr_actions_a23_link_without_group', login='gantt_all')
        with self.subTest(login='gantt_allhr'):
            self._tour('hr_actions_a23_link_with_group', login='gantt_allhr')

    def test_a24_link_opens_employee(self):
        _abigail, beth = self._warning_world()
        self._tour('hr_actions_a24_link_opens_employee')
        self.env.invalidate_all()
        self.assertFalse(self._break_of(beth), 'nothing was saved: Beth has no attendance')

    def test_a25_link_drops_changes(self):
        _abigail, beth = self._warning_world()
        self.env['hr.attendance'].with_context(skip_time_rules=True).create({
            'employee_id': beth.id, 'check_in': datetime(2026, 11, 10, 8, 0),
            'check_out': datetime(2026, 11, 10, 12, 0)})
        self.env.flush_all()
        self._tour('hr_actions_a25_link_drops_changes')
        self.env.invalidate_all()
        self.assertEqual(self._break_of(beth), [0], 'the changes of the dialog are dropped')

    # -- clicks, taps and the record dialog (R9 to R12, R20) ---------------------------------------

    def _abigail_attendance(self):
        self.env.invalidate_all()
        return self.env['hr.attendance'].search([('employee_id.name', '=', 'HRA Abigail')])

    def test_a26_record_dialog(self):
        self._demo()
        self._tour('hr_actions_a26_record_dialog')

    def test_a27_save_discard(self):
        self._demo()
        self._tour('hr_actions_a27_save_discard')
        # Save & Close wrote 0:30; Discard, Escape and the cross left it as it was
        self.assertEqual(self._abigail_attendance().break_duration, 0.5)

    def test_a28_delete_at_once(self):
        self._prepared()
        self._tour('hr_actions_a28_delete_at_once')
        self.env.invalidate_all()
        self.assertFalse(self.env['hr.attendance'].search(
            [('employee_id.name', '=', 'Gantt Exact')]), 'deleted without a confirmation')

    def test_a29_double_click_one_dialog(self):
        self._demo()
        self._tour('hr_actions_a29_double_click_one_dialog')

    def test_a30_tap_desktop_touch(self):
        self._demo()
        self.touch_enabled = True
        self._tour('hr_actions_a30_tap_desktop_touch')

    def test_a31_tap_phone(self):
        self._demo()
        self._tour('hr_actions_a31_tap_phone', mobile=PHONE)

    def test_a32_handle_press_release(self):
        self._demo()
        before = self._abigail_attendance().read(['check_in', 'check_out'])
        self._tour('hr_actions_a32_handle_press_release')
        self.assertEqual(self._abigail_attendance().read(['check_in', 'check_out']), before)

    def test_a33_cut_pills(self):
        self._demo()
        self._tour('hr_actions_a33_cut_pills')

    def test_a74_where_user_lands(self):
        self._demo()
        self._tour('hr_actions_a74_where_user_lands')
        self.assertEqual(self._abigail_attendance().break_duration, 1)

    def test_a75_escape(self):
        self._demo()
        self._tour('hr_actions_a75_escape')

    def test_a82_double_click_then_next(self):
        self._demo()
        self._tour('hr_actions_a82_double_click_then_next')

    def test_a86_two_quick_taps(self):
        self._demo()
        with self.subTest(device='desktop touch'):
            self.touch_enabled = True
            self._tour('hr_actions_a86_two_quick_taps')
        with self.subTest(device='phone'):
            self._tour('hr_actions_a86_two_quick_taps', mobile=PHONE)

    # -- creating (R13 to R16, R20) ----------------------------------------------------------------

    def _cells(self):
        """An employee with a contract and no attendance, whose cells are all empty."""
        return self._employee('HRA Cells')

    def test_a34_cell_day(self):
        abigail, _beth = self._warning_world()
        self._tour('hr_actions_a34_cell_day')
        self.env.invalidate_all()
        created = self.env['hr.attendance'].search([
            ('employee_id', '=', abigail.id), ('check_in', '=', datetime(2026, 11, 11, 14, 0))])
        self.assertEqual(created.check_out, datetime(2026, 11, 11, 15, 0))
        created.with_context(skip_time_rules=True).unlink()  # removed after

    def test_a35_week(self):
        self._cells()
        self._tour('hr_actions_a35_week')

    def test_a36_month(self):
        self._cells()
        self._tour('hr_actions_a36_month')

    def test_a37_year(self):
        self._warning_world()
        # a row under contract all year keeps the months before October from folding (002a R29)
        self._cells()
        self._tour('hr_actions_a37_year')

    def test_a38_quarter(self):
        self._cells()
        self._tour('hr_actions_a38_quarter')

    def test_a39_double_click_cell(self):
        self._warning_world()
        self._tour('hr_actions_a39_double_click_cell')

    def test_a40_drag_day(self):
        self._warning_world()
        self._tour('hr_actions_a40_drag_day')

    def test_a41_drag_week(self):
        self._cells()
        self._tour('hr_actions_a41_drag_week')

    def test_a42_follows_checkin(self):
        self._warning_world()
        self._cells()
        self._tour('hr_actions_a42_follows_checkin')

    def test_a45_new_day(self):
        self._admin_employee()
        self._tour('hr_actions_a45_new_day')

    def test_a46_new_week(self):
        self._admin_employee()
        self._tour('hr_actions_a46_new_week')

    def test_a78_new_month_quarter_year(self):
        self._admin_employee()
        self._tour('hr_actions_a78_new_month_quarter_year')

    def test_a47_no_create_none(self):
        self._role_users()
        self._tour('hr_actions_a47_no_create_none', login='gantt_none')
        self.env.invalidate_all()
        self.assertEqual(
            self.env['hr.attendance'].search_count([('employee_id.name', '=', 'Gantt Role None')]),
            1, 'nothing was created')

    def test_a48_never_plan(self):
        self._cells()
        self._tour('hr_actions_a48_never_plan')
