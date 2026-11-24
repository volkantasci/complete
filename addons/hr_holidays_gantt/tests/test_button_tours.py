# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the footer's buttons of the leave popover of slice 002e2 (Task 6): Edit, Save,
Approve, Refuse, Discard and Delete. The harness is that of ``test_tours`` and
``test_report_tours`` (browser clock, zone, real pointer, isolation of the employees, the role
users); each tour is in ``static/tests/tours/time_off_button_tours.js`` and sees what the user
sees, and each test reads here what the tour left on the server. Every record is made here (CI
has no demo data) from the prepared states of ``acceptance.md``."""
from datetime import date, datetime, time, timedelta

from odoo import fields
from odoo.tests import tagged

from . import test_tours
from . import time_off_fixtures as fx
from .test_report_tours import ReportToursBase


@tagged('post_install', '-at_install')
class TestTimeOffButtonTours(ReportToursBase):

    def _act(self, login='admin', **kwargs):
        """*act* for the administrator, or for a role user's Overview (``login``)."""
        if login == 'admin':
            made = fx.make_act_state(self.env, self.schedule)
            self._isolate(keep={fx.ACT_NAME})
            return made
        self._world(login, demo=False, **kwargs)
        made = fx.make_act_state(self.env, self.schedule)
        self.env.flush_all()
        return made

    def _state(self, leave):
        """The request's state as the server holds it now (False when it no longer exists)."""
        self.env.flush_all()
        self.env.invalidate_all()
        found = self.env['hr.leave'].with_context(active_test=False).sudo().browse(leave.id)
        return found.state if found.exists() else False

    # -- the buttons by state (A13, A16, A17) -----------------------------------------------------

    def test_a13_pending_change(self):
        made = self._act()
        self._tour_writes_nothing('hhg_a13_pending_change')
        self.assertFalse(made['confirm'].name, 'Discard left the description empty')

    def test_a17_second_approval_and_approved(self):
        self._act()
        self._tour_writes_nothing('hhg_a17_second_approval_and_approved')

    # -- Edit, Approve, Refuse (A34 to A38) -------------------------------------------------------

    def test_a34_edit(self):
        made = self._act()
        self._tour('hhg_a34_edit')
        self.assertEqual(self._state(made['validate']), 'confirm')

    def test_a35_approve_twice_admin(self):
        made = self._act()
        self._tour('hhg_a35_approve_twice_admin')
        self.assertEqual(self._state(made['validate1']), 'validate')

    def test_a37_refuse_overview(self):
        made = self._act()
        self._tour('hhg_a37_refuse_overview')
        self.assertEqual(self._state(made['confirm']), 'refuse')
        self.assertEqual(self._state(made['validate']), 'validate')

    def test_a99_popover_stays(self):
        """The Overview without a search: 14 demo employees (by name), "Toff Act" and five
        employees after him, 20 rows (the first page), so that the grid scrolls by more than
        150 px and his row lies in its lower part, in view."""
        fx.make_demo_world(self.env, self.schedule)
        made = fx.make_act_state(self.env, self.schedule)
        after = [fx._employee(self.env, f'Toff Zed {n}', self.schedule).name for n in range(1, 6)]
        self._isolate(keep=set(sorted(fx.DEMO_EMPLOYEES)[:14]) | {fx.ACT_NAME, *after})
        self._tour('hhg_a99_popover_stays')
        self.assertEqual(self._state(made['confirm']), 'refuse')
        self.assertEqual(self._state(made['validate']), 'validate')

    def test_a38_approve_saves_first(self):
        made = self._act()
        self._tour('hhg_a38_approve_saves_first')
        self.env.invalidate_all()
        self.assertEqual(made['confirm'].state, 'validate')
        self.assertEqual(made['confirm'].name, 'Dentist')

    def test_a36_approver_approves(self):
        self._world('toff_approver')
        made = fx.make_types_state(self.env)
        self._tour('hhg_a36_approver_approves', login='toff_approver', path=test_tours.MANAGEMENT)
        self.assertEqual(self._state(made['cto']), 'validate')
        self.assertEqual(self._state(made['un']), 'validate1')
        self.assertEqual(self._state(made['sto']), 'confirm')

    def test_a84_final_approval_officer(self):
        made = self._act('toff_officer')
        self._tour('hhg_a84_final_approval_officer', login='toff_officer')
        self.assertEqual(self._state(made['validate1']), 'validate')

    def test_a77_edit_refused(self):
        self._world(None, demo=False)
        made = fx.make_matrix_state(self.env, 'toff_emp')
        self._only(None)
        self._tour('hhg_a77_edit_refused', path=test_tours.MANAGEMENT)
        self.assertEqual(self._state(made['peer']['refuse']), 'confirm')

    def test_a78_cancelled(self):
        self._world(None, demo=False)
        made = fx.make_matrix_state(self.env, 'toff_emp')
        self._only(None)
        self.assertEqual(made['own']['cancel'].state, 'cancel')
        before = self._leaves_state()
        self._tour('hhg_a78_cancelled', path=test_tours.MANAGEMENT)
        self.assertEqual(self._leaves_state(), before, 'the tour wrote a request')

    # -- Delete (A52, A53, A82) -------------------------------------------------------------------

    def test_a52_delete_admin(self):
        made = self._act()
        self._tour('hhg_a52_delete_admin')
        self.assertFalse(self._state(made['validate']))
        self.assertEqual(self._state(made['confirm']), 'confirm')

    def test_a82_delete_frees_days(self):
        fx.make_split_state(self.env, self.schedule)
        self._isolate(keep={fx.ACT_NAME})
        leave = self.env['hr.leave'].search([('employee_id.name', '=', fx.ACT_NAME)])
        self.assertEqual(leave.state, 'validate')
        self._tour('hhg_a82_delete_frees_days')
        self.assertFalse(self._state(leave))

    def test_a53_delete_approved_officer(self):
        made = self._act('toff_officer')
        self._tour('hhg_a53_delete_approved_officer', login='toff_officer')
        self.assertEqual(self._state(made['validate']), 'validate')

    # -- the roles (A14, A15, A31 to A33, A54) ----------------------------------------------------

    def _emp(self):
        self._world(demo=False)
        made = fx.make_emp_state(self.env)
        self._only('toff_emp')
        return made

    def test_a14_employee_own_request(self):
        made = self._emp()
        before = self._leaves_state()
        self._tour('hhg_a14_employee_own_request', login='toff_emp', path=test_tours.MANAGEMENT)
        self.assertEqual(self._leaves_state(), before, 'the tour wrote a request')
        self.assertEqual(made['emp_confirm'].state, 'confirm')

    def test_a15_save(self):
        made = self._emp()
        self._tour('hhg_a15_save', login='toff_emp', path=test_tours.MANAGEMENT)
        self.env.invalidate_all()
        self.assertEqual(made['emp_confirm'].name, 'Dentist')
        self.assertEqual(made['emp_confirm'].state, 'confirm')

    def test_a31_report_popover(self):
        """A31 prepares its own Approved request of Wednesday 18 (as S7 and M49 to M55 read it),
        not the *emp* state."""
        self._world(demo=False)
        emp = self.role_employees['toff_emp']
        leave = fx.make_leave(self.env, emp, fx.find_type(self.env, 'STO'), date(2026, 11, 18))
        self.env.flush_all()
        self._only('toff_emp')
        self.assertEqual(leave.state, 'validate')
        self._tour_writes_nothing('hhg_a31_report_popover', login='toff_emp')

    def test_a32_report_delete_other(self):
        made = self._emp()
        self._tour('hhg_a32_report_delete_other', login='toff_emp')
        self.assertEqual(self._state(made['peer_confirm']), 'confirm')

    def test_a33_report_delete_own(self):
        """An Employee deletes their own request To Approve that starts after the server's day
        (the Community's check reads the server's clock): the browser starts on the server's
        day and the tour finds the pill by the view's own Next."""
        self._world(demo=False)
        emp = self.role_employees['toff_emp']
        day = fields.Datetime.now().date() + timedelta(days=1)
        while day.weekday() >= 5:
            day += timedelta(days=1)
        leave = fx.make_waiting(self.env, emp, fx.find_type(self.env, 'STO'), day)
        self._only('toff_emp')
        self._tour(
            'hhg_a33_report_delete_own', login='toff_emp', now=self._server_day_instant())
        self.assertFalse(self._state(leave))

    def _server_day_instant(self):
        """The server's day at 10:00 UTC, as the browser's clock for the tours that depend on it."""
        return datetime.combine(fields.Datetime.now().date(), time(10, 0))

    def test_a54_delete_past(self):
        """The request lies on the working day before the server's day; the browser starts on
        the server's day and the tour finds the request by the view's own Previous."""
        self._world(demo=False)
        made = fx.make_past_state(self.env)
        self._only('toff_emp')
        self._tour(
            'hhg_a54_delete_past', login='toff_emp', path=test_tours.MANAGEMENT,
            now=self._server_day_instant())
        self.assertEqual(self._state(made['emp_past']), 'confirm')
