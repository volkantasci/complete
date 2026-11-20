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

from .actions_fixtures import (
    PEER_NAME,
    action_in_november,
    make_gantt_moved,
    make_page_employees,
    make_role_users,
    make_team_officer,
)
from .hr_rows_fixtures import TZ
from .test_hr_rows_tours import HrToursBase

MY_ACTION = '/odoo/action-hr_attendance.hr_attendance_my_action'
PHONE = (390, 844)
EMPLOYEE_FORM = '/odoo/action-hr.open_view_employee_list_my/%d'
# the form the users without the Employees officer group are given: the public profile
PUBLIC_FORM = '/odoo/action-hr.hr_employee_public_action/%d'


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
        # the tour resizes a 24-hour attendance: the Community's time rules would split a longer
        # than scheduled attendance when its check-out is written, and Undo cannot join the
        # parts again; that pipeline is not what the scenario is about
        self.env['hr.time.rule'].search([]).write({'active': False})
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

    # -- moving and resizing (R17 to R19, R18) -------------------------------------------------

    def _abigail_restored(self):
        """Abigail's attendance is written back to 06:00 to 09:30 UTC after the scenario, and the
        attendances a scenario added to her are removed, also when it fails."""
        original = self._abigail_attendance().ids

        def restore():
            self.env.invalidate_all()
            attendances = self._abigail_attendance().with_context(skip_time_rules=True)
            attendances.browse(original).write({
                'check_in': datetime(2026, 11, 11, 6, 0),
                'check_out': datetime(2026, 11, 11, 9, 30)})
            (attendances - attendances.browse(original)).unlink()
        self.addCleanup(restore)

    def test_a49_move(self):
        self._demo()
        self._abigail_restored()
        self._tour('hr_actions_a49_move')

    def test_a50_undo(self):
        self._demo()
        self._abigail_restored()
        self._tour('hr_actions_a50_undo')

    def test_a51_resize_end(self):
        self._demo()
        self._abigail_restored()
        self._tour('hr_actions_a51_resize_end')

    def test_a52_refused_move(self):
        like = self._demo()
        self._abigail_restored()
        self.env['hr.attendance'].with_context(skip_time_rules=True).create({
            'employee_id': like['HRA Abigail'].id, 'check_in': datetime(2026, 11, 11, 11, 0),
            'check_out': datetime(2026, 11, 11, 12, 0)})
        self.env.flush_all()
        self._tour('hr_actions_a52_refused_move')

    def test_a53_ctrl_copy(self):
        self._demo()
        self._abigail_restored()
        self._tour('hr_actions_a53_ctrl_copy')

    def _gantt_moved(self):
        """The open attendance of "Gantt Moved" is put back to 07:00 UTC after the scenario."""
        make_gantt_moved(self.env, self.schedule)

        def restore():
            self.env.invalidate_all()
            self._moved_attendance().with_context(skip_time_rules=True).write({
                'check_in': datetime(2026, 11, 11, 7, 0), 'check_out': False})
        self.addCleanup(restore)

    def _moved_attendance(self):
        self.env.invalidate_all()
        return self.env['hr.attendance'].search([('employee_id.name', '=', 'Gantt Moved')])

    def test_a54_move_open(self):
        self._gantt_moved()
        self._tour('hr_actions_a54_move_open')
        self.assertEqual(self._moved_attendance().check_in, datetime(2026, 11, 11, 9, 0))
        self.assertFalse(self._moved_attendance().check_out)

    def test_a55_resize_start_open(self):
        self._gantt_moved()
        self._tour('hr_actions_a55_resize_start_open')

    def test_a56_undo_move_open(self):
        self._gantt_moved()
        self._tour('hr_actions_a56_undo_move_open')

    def test_a76_end_drag_open(self):
        self._gantt_moved()
        self._tour('hr_actions_a76_end_drag_open')
        self.assertEqual(self._moved_attendance().check_out, datetime(2026, 11, 11, 11, 0, 2))

    def test_a83_undo_end_drag_open(self):
        self._gantt_moved()
        self._tour('hr_actions_a83_undo_end_drag_open')

    def test_a63_self_validated(self):
        self._role_users()
        company = self.users['gantt_self'].company_id
        self.addCleanup(company.write, {'attendance_validation': company.attendance_validation})
        company.attendance_validation = 'manual_validation'
        # the administrator validated the attendance of the Self user
        self.env['hr.attendance'].search(
            [('employee_id.name', '=', 'Gantt Role Self')]).write({'state': 'validated'})
        self.env.flush_all()
        self._tour('hr_actions_a63_self_validated', path=MY_ACTION, login='gantt_self')

    # -- the monthly view of an employee (R4, R22) -------------------------------------------

    def _monthly(self, name, employee, public=False, **kwargs):
        """A tour from the form of ``employee`` (the public profile for ``public``); the action
        it opens is the one of November 2026 (its domain reads the server's own clock)."""
        form = PUBLIC_FORM if public else EMPLOYEE_FORM
        with action_in_november():
            self._tour(name, path=form % employee.id, **kwargs)

    def _by_name(self, name):
        return self.env['hr.employee'].search([('name', '=', name)])

    def test_a6_monthly_list(self):
        like = self._demo()
        with self.subTest(device='desktop'):
            self._monthly('hr_actions_a6_monthly_list', like['HRA Anita'])
        with self.subTest(device='phone'):
            self._monthly('hr_actions_a6_monthly_list_phone', like['HRA Anita'], mobile=PHONE)

    def test_a8_overview_follows_period(self):
        like = self._demo()
        with self.subTest(device='desktop'):
            self._monthly('hr_actions_a8_overview_follows_period', like['HRA Anita'])
        with self.subTest(device='phone'):
            self._monthly(
                'hr_actions_a8_overview_follows_period_phone', like['HRA Anita'], mobile=PHONE)

    def test_a66_monthly_phone(self):
        like = self._demo()
        self._monthly('hr_actions_a66_monthly_phone', like['HRA Anita'], mobile=PHONE)

    def test_a9_overview_employee(self):
        like = self._demo()
        self._monthly('hr_actions_a9_overview_employee', like['HRA Abigail'])

    def test_a9_overview_open_attendance(self):
        prepared = self._prepared()
        self.assertIn('Gantt Open', [employee.name for employee in prepared.values()])
        self._monthly('hr_actions_a9_overview_open', self._by_name('Gantt Open'))

    def test_a77_create_form_employee(self):
        like = self._demo()
        self._monthly('hr_actions_a77_create_form_employee', like['HRA Anita'])

    def test_a80_week_around_today(self):
        like = self._demo()
        with self.subTest(device='desktop'):
            self._monthly('hr_actions_a80_week_around_today', like['HRA Anita'])
        with self.subTest(device='phone'):
            self._monthly('hr_actions_a80_week_around_today', like['HRA Anita'], mobile=PHONE)

    def test_a81_lunch_rounding(self):
        self._prepared()
        self._monthly('hr_actions_a81_lunch_rounding', self._by_name('Gantt Lunch'))

    def _toni(self):
        """Toni Jimenez's shape: a schedule of 20 hours a week (4 hours a day), a contract from 1
        September 2026."""
        calendar = self.env['resource.calendar'].create({
            'name': 'HRA 20 hours/week', 'full_time_required_hours': 20,
            'attendance_ids': [(5, 0, 0)] + [
                (0, 0, {'dayofweek': str(day), 'hour_from': 8, 'hour_to': 12})
                for day in range(5)],
        })
        self.assertEqual(calendar.hours_per_day, 4)
        return self._employee(
            'HRA Toni', contract=('2026-09-01', None), resource_calendar_id=calendar.id)

    def test_a85_admin(self):
        like = self._demo()
        toni = self._toni()
        self._admin_employee()
        with self.subTest(employee='Toni'):
            self._monthly('hr_actions_a85_monthly_toni', toni)
        with self.subTest(employee='Beth'):
            self._monthly('hr_actions_a85_monthly_beth', like['HRA Beth'])
        with self.subTest(list='New'):
            self._monthly('hr_actions_a85_list_new', toni)

    def test_a85_roles(self):
        self._role_users()
        peer = self._by_name('Gantt Role Peer')
        with self.subTest(login='gantt_team'):
            self._monthly('hr_actions_a85_monthly_team', peer, public=True, login='gantt_team')
        with self.subTest(login='gantt_self'):
            self._monthly(
                'hr_actions_a85_monthly_self', self._by_name('Gantt Role Self'), public=True,
                login='gantt_self')
        with self.subTest(login='gantt_self', form='another'):
            self._monthly('hr_actions_a85_self_other_form', peer, public=True, login='gantt_self')
        with self.subTest(login='gantt_none'):
            self._monthly(
                'hr_actions_a85_monthly_none', self._by_name('Gantt Role None'), public=True,
                login='gantt_none')
        self.env.invalidate_all()
        self.assertEqual(
            self.env['hr.attendance'].search_count([('employee_id.name', '=', 'Gantt Role None')]),
            1, 'nothing was created')

    # -- the matrix of roles (R21; A57 to A63) ---------------------------------------------------
    # The cell-by-cell list of the matrix, with the test of each cell, is in test_roles.py; the
    # server's refusals are asserted there. Here: what each user sees.

    def _attendance_times(self, name):
        self.env.invalidate_all()
        return self.env['hr.attendance'].search(
            [('employee_id.name', '=', name)]).read(['check_in', 'check_out'])

    def _ends_contracts(self):
        """Every contract of the role users' employees ended before 11 November: their attendance
        has the warning."""
        for employee in self.env['hr.employee'].search(
                [('name', 'in', ['Gantt Role None', 'Gantt Role Self', 'Gantt Role Team',
                                 'Gantt Role All', 'Gantt Role Allhr', PEER_NAME])]):
            employee.write({'contract_date_end': '2026-10-31'})
        self.env.flush_all()

    def test_a57_role_none(self):
        self._role_users()
        self._tour('hr_actions_a57_role_none', login='gantt_none')
        self.assertEqual(
            [(row['check_in'], row['check_out'])
             for row in self._attendance_times('Gantt Role None')],
            [(datetime(2026, 11, 11, 7, 0), datetime(2026, 11, 11, 9, 0))])

    def test_a58_role_self(self):
        self._role_users()
        self._tour('hr_actions_a58_role_self', login='gantt_self')
        self.assertEqual(
            [(row['check_in'], row['check_out'])
             for row in self._attendance_times('Gantt Role Self')],
            [(datetime(2026, 11, 11, 9, 0), datetime(2026, 11, 11, 11, 0))])

    def test_a59_role_team(self):
        self._role_users()
        self._tour('hr_actions_a59_role_team', login='gantt_team')
        self.assertEqual(
            [(row['check_in'], row['check_out']) for row in self._attendance_times(PEER_NAME)],
            [(datetime(2026, 11, 11, 9, 0), datetime(2026, 11, 11, 11, 0))])
        self.assertEqual(
            [(row['check_in'], row['check_out'])
             for row in self._attendance_times('Gantt Role Team')],
            [(datetime(2026, 11, 11, 7, 0), datetime(2026, 11, 11, 9, 0))])

    def _full_page(self):
        """Twenty employees before the role users' in the order of names: the first page of the
        management view has 20 rows and four pills (M70, M72)."""
        self._role_users()
        make_page_employees(self.env, schedule=self.schedule)

    def test_a60_role_all(self):
        self._full_page()
        self._tour('hr_actions_a60_role_all', login='gantt_all')

    def test_a61_role_allhr(self):
        self._full_page()
        self._tour('hr_actions_a61_role_allhr', login='gantt_allhr')

    def test_r21_role_admin(self):
        self._full_page()
        self._tour('hr_actions_r21_role_admin')

    def test_r21_my_attendances_by_address(self):
        """R21 rows "Attendances in the home menu", "Top bar menus" (M57, M63, M69, M75, M81) and
        "My Attendances by its address": the calendar, the menus and the own row, per role."""
        self._role_users()
        self._admin_employee()
        for login, name in (
            ('gantt_none', 'none'), ('gantt_self', 'self'), ('gantt_team', 'team'),
            ('gantt_all', 'all'), ('gantt_allhr', 'allhr'), ('admin', 'admin'),
        ):
            with self.subTest(login=login):
                self._tour(f'hr_actions_r21_mine_{name}', path=MY_ACTION, login=login)

    def test_r21_warning_and_link(self):
        """R21 rows "the warning" (every role) and "the link" (the Employees officer group)."""
        self._role_users()
        self._ends_contracts()
        for login, tour in (
            ('gantt_none', 'hr_actions_r21_warning_no_link'),
            ('gantt_self', 'hr_actions_r21_warning_no_link'),
            ('gantt_team', 'hr_actions_r21_warning_no_link'),
            ('gantt_all', 'hr_actions_r21_warning_no_link'),
            ('gantt_allhr', 'hr_actions_r21_warning_link'),
            ('admin', 'hr_actions_r21_warning_link'),
        ):
            with self.subTest(login=login):
                self._tour(tour, login=login)

    def test_a62_team_officer(self):
        """A62 in CI: a created team officer of four employees stands in for Marc Demo."""
        make_team_officer(self.env, schedule=self.schedule)
        self._tour('hr_actions_a62_team_officer', login='gantt_officer')

    def test_a62_demo_marc(self):
        """A62 on the demo data: Marc Demo (login demo); skipped when the database has none."""
        if not self.env['res.users'].search([('login', '=', 'demo')]):
            self.skipTest('the database has no demo data (the user demo)')
        # the demo attendances lie around the day of the installation; the tour clicks Abigail
        # Peterson's pill on 11 November 2026 (the Brussels day, 10 Nov 23:00 to 11 Nov 23:00 UTC)
        if not self.env['hr.attendance'].with_context(active_test=False).search_count([
            ('employee_id.name', '=', 'Abigail Peterson'),
            ('check_in', '>=', datetime(2026, 11, 10, 23, 0)),
            ('check_in', '<', datetime(2026, 11, 11, 23, 0)),
        ]):
            self.skipTest(
                "Abigail Peterson's demo attendance is not on 11 November 2026: the database was "
                'not created at that instant (tools/odoo_at_instant.py), the tour needs its pill')
        # the demo's employees are the scenario's: they come back from the other company
        self.env['hr.employee'].with_context(active_test=False).search(
            [('company_id.name', '=', 'HRA Elsewhere')]).write(
            {'company_id': self.env.ref('base.main_company').id})
        self.env.flush_all()
        self._tour('hr_actions_a62_demo_marc', login='demo')
