# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the matrix of roles of slice 002e2 (Task 10; A60 to A66): who sees which buttons
in the leave popover of each state, which gestures and whether the split tool, and which deletions
the Community accepts. The harness is that of ``test_tours``; the tours are in
``static/tests/tours/time_off_role_tours.js`` and each test reads here what the tour left on the
server. Every user and record is made here (CI has no demo data): the role users by
``make_role_users`` (groups set explicitly and checked right after the setup, by the fixture and
by ``assert_role_groups``) and the *matrix* and *types* states of ``acceptance.md``.

The Community refuses to delete a request in the past for everyone but an Officer, and its
check reads the server's day: the deletions that must be accepted for an Employee, a Manager or an
Approver use requests of the working days after the server's day, one fresh request each, and the
browser starts on the server's day (as 002e2's A33)."""
from datetime import date, datetime, time, timedelta

from odoo import fields
from odoo.tests import tagged

from . import test_tours
from . import time_off_fixtures as fx
from .test_report_tours import HOME, ReportToursBase

MULTI_FIRST = date(2026, 11, 23)
MULTI_LAST = date(2026, 11, 25)


@tagged('post_install', '-at_install')
class TestTimeOffRoleMatrixTours(ReportToursBase):

    # -- helpers ----------------------------------------------------------------------------------

    def _state(self, leave):
        """The request's state as the server holds it now (False when it no longer exists)."""
        self.env.flush_all()
        self.env.invalidate_all()
        found = self.env['hr.leave'].with_context(active_test=False).sudo().browse(leave.id)
        return found.state if found.exists() else False

    def _matrix(self, login, multi=True):
        """The role users, *matrix* for ``login``'s employee and Toff Peer, and (``multi``) an
        Approved request of three days (Monday 23 to Wednesday 25 November) for each of them: the
        pill the split tool is looked for on."""
        self._world(login, demo=False)
        made = fx.make_matrix_state(self.env, login)
        if multi:
            sto = fx.find_type(self.env, 'STO')
            for employee in (self.role_employees[login], self.peer):
                fx.make_leave(self.env, employee, sto, MULTI_FIRST, MULTI_LAST)
        self.env.flush_all()
        return made

    def _server_day_instant(self):
        """The server's day at 10:00 UTC, as the browser's clock for the deletion tours."""
        return datetime.combine(fields.Datetime.now().date(), time(10, 0))

    def _working_days_after_today(self, count):
        days = []
        day = fields.Datetime.now().date()
        while len(days) < count:
            day += timedelta(days=1)
            if day.weekday() < 5:
                days.append(day)
        return days

    def _fresh_own(self, login):
        """Three requests of ``login``'s own employee on the working days after the server's day:
        To Approve, Second Approval and Cancelled (by the user)."""
        employee = self.role_employees[login]
        first, second, third = self._working_days_after_today(3)
        sto = fx.find_type(self.env, 'STO')
        confirm = fx.make_waiting(self.env, employee, sto, first)
        validate1 = fx.make_second_approval(self.env, employee, second)
        cancel = fx.make_leave(self.env, employee, sto, third)
        cancel.with_user(self.users[login])._force_cancel('Toff cancelled', 'mail.mt_note')
        self.env.flush_all()
        return confirm, validate1, cancel

    def _deletes(self, login, tour):
        self._world(login, demo=False)
        made = self._fresh_own(login)
        self.assertEqual([self._state(leave) for leave in made], ['confirm', 'validate1', 'cancel'])
        self._tour(
            tour, login=login, path=test_tours.MANAGEMENT, now=self._server_day_instant())
        self.assertFalse(self._state(made[0]), 'To Approve: accepted')
        self.assertFalse(self._state(made[1]), 'Second Approval: accepted')
        # the Community's rule gives no right to delete a Cancelled request to these roles
        self.assertEqual(self._state(made[2]), 'cancel', 'Cancelled: refused')

    # -- A60: no role -----------------------------------------------------------------------------

    def test_a60_no_role(self):
        self._world('toff_none', demo=False)
        self.assertFalse(self.users['toff_none'].has_group('hr_holidays.group_hr_holidays_employee'))
        self._tour('hhg_a60_no_role', login='toff_none', path=HOME)

    # -- A61, A62: Employee and Manager without approval -------------------------------------------

    def _employee_popovers(self, login, tour):
        made = self._matrix(login)
        self._tour_writes_nothing(tour, login=login, path=test_tours.MANAGEMENT)
        for requests in made.values():
            for key, leave in requests.items():
                self.assertEqual(self._state(leave), key, 'Delete was refused')

    def test_a61_employee_popovers(self):
        """Own five requests only; To Approve editable, the others read-only, Delete alone; Delete
        refused (the Community's error) on the Approved and the Refused one; no split tool."""
        self._employee_popovers('toff_emp', 'hhg_a61_emp_popovers')

    def test_a61_employee_deletes(self):
        """Delete is accepted on a request To Approve and one at Second Approval, refused on a
        Cancelled one (the Community has no rule to delete it)."""
        self._deletes('toff_emp', 'hhg_a61_emp_deletes')

    def test_a62_manager_popovers(self):
        self._employee_popovers('toff_manager', 'hhg_a62_manager_popovers')

    def test_a62_manager_deletes(self):
        self._deletes('toff_manager', 'hhg_a62_manager_deletes')

    # -- A63: Approver -----------------------------------------------------------------------------

    def test_a63_approver_types(self):
        """*types*: Toff Peer's CTO and UN requests To Approve show Approve and Refuse, the STO one
        (approved by the Officer) Delete alone; Delete of an employee's request gives the access
        error; no split tool."""
        self._world('toff_approver', demo=False)
        made = fx.make_types_state(self.env)
        fx.make_leave(
            self.env, self.peer, fx.find_type(self.env, 'STO'), MULTI_FIRST, MULTI_LAST)
        self.env.flush_all()
        self._tour_writes_nothing(
            'hhg_a63_approver_types', login='toff_approver', path=test_tours.MANAGEMENT)
        self.assertEqual(self._state(made['cto']), 'confirm')
        self.assertEqual(self._state(made['un']), 'confirm')
        self.assertEqual(self._state(made['sto']), 'confirm')

    def test_a63_approver_matrix(self):
        """*matrix*: Second Approval, Approved and Refused read-only with Delete alone, for their
        own and Toff Peer's requests; deletions refused; no split tool."""
        made = self._matrix('toff_approver')
        self._tour_writes_nothing(
            'hhg_a63_approver_matrix', login='toff_approver', path=test_tours.MANAGEMENT)
        self.assertEqual(self._state(made['peer']['validate']), 'validate')

    def test_a63_approver_deletes(self):
        self._deletes('toff_approver', 'hhg_a63_approver_deletes')

    # -- A64, A65: Officer and Admin ---------------------------------------------------------------

    def test_a64_officer_overview(self):
        """Overview: To Approve editable with Approve, Refuse, Delete; Second Approval and
        Approved read-only with Edit, Delete; the split tool shows; Delete accepted on To Approve
        (their own), refused on Second Approval and Approved."""
        made = self._matrix('toff_officer')
        self._tour('hhg_a64_officer_overview', login='toff_officer')
        own, peer = made['own'], made['peer']
        self.assertFalse(self._state(own['confirm']), 'To Approve: accepted')
        self.assertEqual(self._state(own['validate1']), 'validate1')
        self.assertEqual(self._state(own['validate']), 'validate')
        self.assertEqual([self._state(leave) for leave in peer.values()],
                         ['confirm', 'validate1', 'validate', 'refuse'])

    def test_a64_officer_management(self):
        """Management > Time Off's Gantt: Refused read-only with Edit, Delete (Delete refused);
        Cancelled read-only with Delete alone (Delete accepted)."""
        made = self._matrix('toff_officer', multi=False)
        self._tour('hhg_a64_officer_management', login='toff_officer', path=test_tours.MANAGEMENT)
        own = made['own']
        self.assertEqual(self._state(own['refuse']), 'refuse')
        self.assertFalse(self._state(own['cancel']), 'Cancelled: accepted')
        self.assertEqual(self._state(own['confirm']), 'confirm')

    def test_a65_admin_overview(self):
        """The popovers are the Officer's; Delete is accepted in every state."""
        made = self._matrix('toff_admin')
        self._tour('hhg_a65_admin_overview', login='toff_admin')
        own = made['own']
        for key in ('confirm', 'validate1', 'validate'):
            self.assertFalse(self._state(own[key]), f'{key}: accepted')
        self.assertEqual(self._state(own['refuse']), 'refuse')

    def test_a65_admin_management(self):
        made = self._matrix('toff_admin', multi=False)
        self._tour('hhg_a65_admin_management', login='toff_admin', path=test_tours.MANAGEMENT)
        own = made['own']
        for key in ('refuse', 'cancel'):
            self.assertFalse(self._state(own[key]), f'{key}: accepted')
        self.assertEqual(self._state(own['confirm']), 'confirm')

    # -- A66: the report view for each role --------------------------------------------------------

    def _report(self, login, tour):
        made = self._matrix(login, multi=False)
        self._tour_writes_nothing(tour, login=login)
        self.assertEqual(self._state(made['own']['confirm']), 'confirm')

    def test_a66_report_employee(self):
        self._report('toff_emp', 'hhg_a66_report_emp')

    def test_a66_report_approver(self):
        self._report('toff_approver', 'hhg_a66_report_approver')

    def test_a66_report_manager(self):
        self._report('toff_manager', 'hhg_a66_report_manager')
