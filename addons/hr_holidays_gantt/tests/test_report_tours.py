# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the ``ui`` scenarios of slice 002e in the time-off report view and of the roles.

The harness (browser clock, zone, real pointer, isolation of the employees) is that of
``test_tours``. The world of a role tour is the one acceptance.md describes: the 22 employees of
the Community demo (made when the database has no demo data), the user's own employee and
"Toff Peer" (24 employees, the pager's "1-20 / 24" of A63); the other role users stay but their
employees are archived, so that only the tour's user has one. The tours are in
``static/tests/tours/time_off_report_tours.js``; the Overview of an Officer is 13a's.
"""
from datetime import date

from odoo.exceptions import AccessError
from odoo.tests import tagged

from . import test_tours
from . import time_off_fixtures as fx

DASHBOARD = '/odoo/action-hr_holidays.action_hr_holidays_dashboard'
HOME = '/odoo'
RESPONSIBLE = 'hr_holidays.group_hr_holidays_responsible'
EMPLOYEE_GROUP = 'hr_holidays.group_hr_holidays_employee'
OFFICER_GROUP = 'hr_holidays.group_hr_holidays_user'
ADMIN_GROUP = 'hr_holidays.group_hr_holidays_manager'


class ReportToursBase(test_tours.TimeOffToursBase):
    """Builders of the worlds of the report and role tours. It holds no test."""

    def _world(
        self, login='toff_emp', *, demo=True, only=True, peer=True, states=False, bulk=False,
        flexible=False, peer_leave=False,
    ):
        """The records of a tour.

        ``demo`` makes the 22 demo employees (six with their leaves); the role users are always
        made (they replace every "Toff ..." record). ``only`` archives the employees of the role
        users other than ``login`` (all stay with ``login=None``); ``peer=False`` archives
        "Toff Peer" too. ``states``, ``bulk`` and ``flexible`` add those prepared states and
        ``peer_leave`` a request of Toff Peer on 16 November.
        """
        self.demo = fx.make_demo_world(self.env, self.schedule) if demo else {}
        self.users = fx.make_role_users(self.env, self.schedule)
        self.role_employees = {name: user.employee_id for name, user in self.users.items()}
        self.peer = self.env['hr.employee'].search([('name', '=', fx.PEER_NAME)])
        self._isolate(keep=set(fx.DEMO_EMPLOYEES) if demo else set())
        self.assert_role_groups()
        self.states = fx.make_states(self.env, self.schedule) if states else None
        self.bulk = fx.make_bulk(self.env, self.schedule) if bulk else None
        self.flexible = fx.make_flexible(self.env, self.schedule) if flexible else None
        if peer_leave:
            fx.make_leave(self.env, self.peer, fx.find_type(self.env, 'STO'), date(2026, 11, 16))
        if only:
            self._only(login, peer=peer)
        self.env.flush_all()

    def _only(self, login, peer=True):
        """Only the employee of ``login`` of the role users' employees is active."""
        for name, employee in self.role_employees.items():
            employee.active = login is None or name == login
        self.peer.active = peer
        self.env.flush_all()

    def _counted(self, login):
        """The active employees ``login`` may read, as the views count them (R13 point 5)."""
        return self.env['hr.employee.public'].with_user(self.users[login]).search_count([])

    def assert_role_groups(self):
        """The groups of each role user, after the setup (A60)."""
        users = self.users
        self.assertTrue(users['toff_approver'].has_group(RESPONSIBLE))
        self.assertFalse(users['toff_manager'].has_group(RESPONSIBLE))
        self.assertFalse(users['toff_none'].has_group(EMPLOYEE_GROUP))
        self.assertTrue(users['toff_emp'].has_group(EMPLOYEE_GROUP))
        self.assertFalse(users['toff_emp'].has_group(OFFICER_GROUP))
        self.assertTrue(users['toff_officer'].has_group(OFFICER_GROUP))
        self.assertFalse(users['toff_officer'].has_group(ADMIN_GROUP))
        self.assertTrue(users['toff_admin'].has_group(ADMIN_GROUP))
        for login in ('toff_none', 'toff_emp', 'toff_manager'):
            self.assertFalse(users[login].has_group(RESPONSIBLE), login)
        for login, user in users.items():
            self.assertEqual(
                user.has_group('base.group_allow_export'), login in fx.EXPORTERS, login)


@tagged('post_install', '-at_install')
class TestTimeOffReportTours(ReportToursBase):

    # -- the dashboard action and its view -------------------------------------------------------

    def test_a04_dashboard_action(self):
        self._world()
        self._tour('hhg_a04_dashboard_action', login='toff_emp')

    def test_a13_pill_texts_employee(self):
        self._world()
        self._tour('hhg_a13_employee_pills', login='toff_emp')

    def test_a13_pill_texts_administrator(self):
        self._world(login=None)
        self._tour('hhg_a13_administrator_pills', path=DASHBOARD)

    def test_a14_states(self):
        self._world(states=True)
        self._tour('hhg_a14_states', login='toff_emp')

    def test_a15_ranges(self):
        self._world(flexible=True)
        self._tour('hhg_a15_ranges', login='toff_emp')

    # -- the card ---------------------------------------------------------------------------------

    def test_a20_card_for_an_employee(self):
        self._world()
        self._tour('hhg_a20_card_for_an_employee', login='toff_emp')

    def test_a82_card_in_the_report(self):
        self._world(login=None)
        self._tour('hhg_a82_card_in_the_report', path=DASHBOARD)

    # -- the search defaults (R9) -----------------------------------------------------------------

    def test_a26_many_employees(self):
        self._world(bulk=True, peer=False)
        self.assertEqual(self._counted('toff_emp'), 53)
        self._tour('hhg_a26_many_employees', login='toff_emp')

    def test_a27_many_employees_with_a_team(self):
        self._world(bulk=True, peer=False)
        self.bulk[:2].write({'parent_id': self.role_employees['toff_emp'].id})
        self.env.flush_all()
        self.assertEqual(self._counted('toff_emp'), 53)
        self._tour('hhg_a27_many_employees_with_a_team', login='toff_emp')

    def test_a28_few_employees(self):
        self._world()
        self.assertEqual(self._counted('toff_emp'), 24)
        self._tour('hhg_a28_few_employees', login='toff_emp')

    def test_a53_report_no_new_button(self):
        self._world()
        self._tour('hhg_a53_report_no_new_button', login='toff_emp')

    # -- the phone --------------------------------------------------------------------------------

    def test_a45_tap_on_an_avatar_on_the_phone(self):
        self._demo_like()
        self._tour('hhg_a45_tap_on_an_avatar', mobile=test_tours.PHONE)

    def test_a46_no_gear_on_the_phone(self):
        self._demo_like()
        self._tour('hhg_a46_no_gear_on_the_phone', mobile=test_tours.PHONE)

    # -- inputs in the report view (A64 to A69) ----------------------------

    def _report_inputs(self, name):
        self._world()
        self._tour_writes_nothing(name, login='toff_emp')

    def test_a64_report_click_on_a_pill(self):
        self._report_inputs('hhg_a64_report_click_on_a_pill')

    def test_a65_report_double_click_on_a_pill(self):
        self._report_inputs('hhg_a65_report_double_click_on_a_pill')

    def test_a66_report_pointer_over_a_pill(self):
        self._report_inputs('hhg_a66_report_pointer_over_a_pill')

    def test_a67_report_drag_on_a_pill(self):
        self._report_inputs('hhg_a67_report_drag_on_a_pill')

    def test_a68_report_click_on_an_empty_cell(self):
        self._report_inputs('hhg_a68_report_click_on_an_empty_cell')

    def test_a69_report_drag_across_empty_cells(self):
        self._report_inputs('hhg_a69_report_drag_across_empty_cells')

    # -- sample data, department (A83, A85) --------------------------------------------------

    def test_a83_sample_data(self):
        """A database with no request at all: every request goes (the test's transaction rolls
        back), the report shows the sample data; with one request the real rows show."""
        self._world(demo=False, peer=False)
        admin = fx.find_admin(self.env)
        self.env['hr.leave'].with_context(active_test=False).with_user(admin).search([]).unlink()
        self.env.flush_all()
        report = self.env['hr.leave.report.calendar'].with_user(self.users['toff_emp'])
        self.assertEqual(report.search_count([]), 0)
        self._tour('hhg_a83_sample_data', login='toff_emp')
        fx.make_leave(
            self.env, self.role_employees['toff_emp'], fx.find_type(self.env, 'STO'),
            date(2026, 11, 16))
        self.env.flush_all()
        self._tour('hhg_a83_one_request', login='toff_emp')

    def test_a85_department_search(self):
        self._world()
        Department = self.env['hr.department']
        mine = Department.create({'name': 'Toff Dept A'})
        other = Department.create({'name': 'Toff Dept B'})
        placed = {
            mine: [self.demo['Anita Oliver'], self.demo['Ronnie Hart'],
                   self.role_employees['toff_emp'], self.peer],
            other: [self.demo[name] for name in
                    ('Mitchell Admin', 'Marc Demo', 'Paul Williams', 'Sharlene Rhodes')],
        }
        for department, employees in placed.items():
            for employee in employees:
                employee.department_id = department
                # a request keeps the department of its employee at the time it was made
                self.env['hr.leave'].with_context(active_test=False).search(
                    [('employee_id', '=', employee.id)]).write({'department_id': department.id})
        self.env.flush_all()
        self._tour('hhg_a85_department_search', login='toff_emp')


@tagged('post_install', '-at_install')
class TestTimeOffRoleTours(ReportToursBase):
    """The roles of R20: one user per role, made by ``make_role_users`` (internal user plus the
    role's own Time Off group, set explicitly), the groups checked after the setup (A60)."""

    def test_a56_no_role(self):
        self._world('toff_none')
        with self.assertRaises(AccessError):
            self.env['hr.leave.report.calendar'].with_user(
                self.users['toff_none']).check_access('read')
        self._tour('hhg_a56_no_role', login='toff_none', path=HOME)

    def test_a57_employee(self):
        self._world('toff_emp', states=True)
        self.assertEqual(self._counted('toff_emp'), 25)
        self._tour('hhg_a57_employee', login='toff_emp', path=HOME)

    def test_a58_approver(self):
        self._world('toff_approver', peer_leave=True)
        self._tour('hhg_a58_approver', login='toff_approver', path=HOME)

    def test_a59_manager_without_approval(self):
        self._world('toff_manager')
        self.assertFalse(self.users['toff_manager'].has_group(RESPONSIBLE))
        self._tour('hhg_a59_manager', login='toff_manager', path=HOME)

    def test_a61_officer(self):
        self._world('toff_officer')
        self._tour('hhg_a61_officer', login='toff_officer', path=HOME)

    def test_a62_admin(self):
        self._world('toff_admin')
        self._tour('hhg_a62_admin', login='toff_admin', path=HOME)

    def test_a90_export_needs_the_export_group(self):
        export = self.env.ref('base.group_allow_export')
        self._world(None)
        for login in ('toff_officer', 'toff_admin'):
            self._only(login)
            user = self.users[login]
            user.write({'group_ids': [(3, export.id)]})
            self.assertFalse(user.has_group('base.group_allow_export'), login)
            self._tour('hhg_a90_without_group', login=login, path=HOME)
            user.write({'group_ids': [(4, export.id)]})
            self.assertTrue(user.has_group('base.group_allow_export'), login)
            self._tour('hhg_a90_with_group', login=login, path=HOME)

    def test_a89_schedule_button_by_role(self):
        self._world(None, demo=False)
        fx.make_peer_band_records(self.env)
        for login in ('toff_emp', 'toff_approver', 'toff_officer', 'toff_admin'):
            self._tour('hhg_a89_schedule_button_by_role', login=login, path=test_tours.OVERVIEW)

    def test_a63_matrix_of_rows(self):
        self._world(None)
        for login in ('toff_emp', 'toff_approver', 'toff_manager', 'toff_officer', 'toff_admin'):
            self._only(login)
            self.assertEqual(self._counted(login), 24, login)
            self._tour('hhg_a63_matrix', login=login)

    def test_a84_approver_in_management(self):
        """Toff Role Approver approves Anita Oliver instead of Toff Peer (rolled back after)."""
        self._world('toff_approver', only=False)
        approver = self.users['toff_approver']
        self.demo['Anita Oliver'].leave_manager_id = approver
        self.peer.leave_manager_id = fx.find_admin(self.env)
        self.env.flush_all()
        self.assertTrue(approver.has_group(RESPONSIBLE))
        self._tour('hhg_a84_approver_management', login='toff_approver', path=test_tours.MANAGEMENT)
