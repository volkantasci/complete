# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the gestures of slice 002e2 (Task 8): pointer shapes and handles, moves,
resizes and copies, the lock of the pills at Second Approval and Approved (decision D7), the
report view that moves nothing, the time zones of a move and the phone's hold (A23 to A30, A39,
A59, A66, A68, A70 to A73, A75, A79, A86). The harness is that of ``test_tours`` and
``test_report_tours``; the tours are in ``static/tests/tours/time_off_gesture_tours.js`` and see
what the user sees, and each test reads here what the tour left on the server. Every record is
made here (CI has no demo data) from the prepared states of ``acceptance.md``."""
from datetime import date

from odoo.tests import tagged

from . import test_tours
from . import time_off_fixtures as fx
from .test_report_tours import ReportToursBase


@tagged('post_install', '-at_install')
class TestTimeOffGestureTours(ReportToursBase):

    def _leaves(self, name=fx.ACT_NAME):
        """The requests of the employee named ``name``, as the server holds them now."""
        self.env.flush_all()
        self.env.invalidate_all()
        return self.env['hr.leave'].with_context(active_test=False).sudo().search(
            [('employee_id.name', '=', name)], order='request_date_from')

    def _only_leave(self, name=fx.ACT_NAME):
        leaves = self._leaves(name)
        self.assertEqual(len(leaves), 1, f'one request of {name}')
        return leaves

    def _move(self):
        made = fx.make_move_state(self.env, self.schedule)
        self._isolate(keep={fx.ACT_NAME})
        return made

    def _act(self, login='admin'):
        if login == 'admin':
            made = fx.make_act_state(self.env, self.schedule)
            self._isolate(keep={fx.ACT_NAME})
            return made
        self._world(login, demo=False)
        return fx.make_act_state(self.env, self.schedule)

    def _assert_moved_to_tuesday(self, leave):
        self.env.invalidate_all()
        self.assertEqual(leave.request_date_from, date(2026, 11, 17))
        self.assertEqual(leave.request_date_to, date(2026, 11, 17))
        self.assertEqual(leave.state, 'confirm')
        self.assertEqual(leave.number_of_days, 1)

    # -- pointer shapes and handles (A23) ---------------------------------------------------------

    def test_a23_pointers_and_handles(self):
        self._act()
        self._tour_writes_nothing('hhg_a23_pointers_and_handles')

    # -- a move, Undo, the time zones (A24, A39) --------------------------------------------------

    def test_a24_move(self):
        made = self._move()
        self._tour('hhg_a24_move')
        self._assert_moved_to_tuesday(made['confirm'])
        self.assertEqual(made['validate'].request_date_from, date(2026, 11, 18))

    def test_a24_move_and_undo(self):
        made = self._move()
        self._tour('hhg_a24_move_undo')
        self.env.invalidate_all()
        self.assertEqual(made['confirm'].request_date_from, date(2026, 11, 16))
        self.assertEqual(made['confirm'].request_date_to, date(2026, 11, 16))
        self.assertEqual(made['confirm'].state, 'confirm')

    def test_a39_move_in_kolkata(self):
        made = self._move()
        self._tour('hhg_a24_move', timezone='Asia/Kolkata')
        self._assert_moved_to_tuesday(made['confirm'])

    def test_a39_move_in_new_york(self):
        made = self._move()
        self._tour('hhg_a24_move', timezone='America/New_York')
        self._assert_moved_to_tuesday(made['confirm'])

    # -- locked pills (A25, A28) ------------------------------------------------------------------

    def test_a25_approved_is_locked(self):
        made = self._move()
        self._tour_writes_nothing('hhg_a25_approved_is_locked')
        self.assertEqual(made['validate'].state, 'validate')
        self.assertEqual(made['validate'].request_date_from, date(2026, 11, 18))

    def test_a28_approved_has_no_handles(self):
        made = self._move()
        self._tour_writes_nothing('hhg_a28_approved_has_no_handles')
        self.assertEqual(made['validate'].request_date_to, date(2026, 11, 18))

    # -- resizes (A27) ----------------------------------------------------------------------------

    def test_a27_resize(self):
        made = self._move()
        self._tour('hhg_a27_resize')
        leave = made['confirm']
        self.env.invalidate_all()
        self.assertEqual(leave.request_date_from, date(2026, 11, 16))
        self.assertEqual(leave.request_date_to, date(2026, 11, 17))
        self.assertEqual(leave.state, 'confirm')
        self.assertEqual(leave.number_of_days, 2)

    def test_a27_resize_and_undo(self):
        made = self._move()
        self._tour('hhg_a27_resize_undo')
        leave = made['confirm']
        self.env.invalidate_all()
        self.assertEqual(leave.request_date_from, date(2026, 11, 16))
        self.assertEqual(leave.request_date_to, date(2026, 11, 16))
        self.assertEqual(leave.number_of_days, 1)

    # -- copies (A29, A30) ------------------------------------------------------------------------

    def test_a29_copy_refused(self):
        self._move()
        before = self._leaves_state()
        self._tour('hhg_a29_copy_refused')
        self.assertEqual(self._leaves_state(), before, 'the tour wrote a request')
        self.assertEqual(len(self._leaves()), 2)

    def test_a30_copy_of_a_refused_request(self):
        self._world(None, demo=False)
        made = fx.make_matrix_state(self.env, 'toff_emp')
        self._only(None)
        refused = made['peer']['refuse']
        self.assertEqual(refused.state, 'refuse')
        self._tour('hhg_a30_copy_refused_request', path=test_tours.MANAGEMENT)
        leaves = self._leaves(fx.PEER_NAME)
        copy = leaves.filtered(lambda leave: leave.request_date_from == date(2026, 11, 20))
        self.assertEqual(len(copy), 1, 'a new request on Friday 20')
        self.assertEqual(copy.state, 'validate')
        self.assertNotIn(copy, refused)
        self.env.invalidate_all()
        self.assertEqual(refused.state, 'refuse')
        self.assertEqual(refused.request_date_from, date(2026, 11, 19))

    # -- empty cells (A68) and the cut pill (A70) -------------------------------------------------

    def test_a68_empty_cells(self):
        self._act()
        self._tour_writes_nothing('hhg_a68_empty_cells')

    def test_a70_cut_pill(self):
        employee = fx._employee(self.env, fx.ACT_NAME, self.schedule)
        leave = fx.make_waiting(
            self.env, employee, fx.find_type(self.env, 'STO'),
            date(2026, 11, 20), date(2026, 11, 24))
        self._isolate(keep={fx.ACT_NAME})
        self.assertEqual(leave.number_of_days, 3)
        self._tour_writes_nothing('hhg_a70_cut_pill')

    # -- half-day and hour requests (A71, A72) ----------------------------------------------------

    def test_a71_move_half_day(self):
        # A71 prepares the half-day request alone (the hours request of Thursday 19 would lie
        # where the moved request ends)
        half, _hours = fx.make_units_state(self.env, self.schedule, with_hours=False)
        self._isolate(keep={fx.ACT_NAME})
        self._tour('hhg_a71_move_half_day')
        self.env.invalidate_all()
        self.assertEqual(half.request_date_from, date(2026, 11, 17))
        self.assertEqual(half.request_date_from_period, 'pm')
        self.assertEqual(half.request_date_to, date(2026, 11, 19))
        self.assertEqual(half.request_date_to_period, 'am')
        self.assertEqual(half.number_of_days, 2)
        self.assertEqual(half.state, 'confirm')

    def test_a72_move_hours(self):
        _half, hours = fx.make_units_state(self.env, self.schedule)
        self._isolate(keep={fx.ACT_NAME})
        self._tour('hhg_a72_move_hours')
        self.env.invalidate_all()
        self.assertEqual(hours.request_date_from, date(2026, 11, 20))
        self.assertEqual(hours.request_date_to, date(2026, 11, 20))
        self.assertEqual((hours.request_hour_from, hours.request_hour_to), (9, 13))
        self.assertEqual(hours.number_of_hours, 4)
        self.assertEqual(hours.state, 'confirm')

    # -- a move onto another request (A73) and to another row (A75) -------------------------------

    def test_a73_move_onto_another(self):
        made = fx.make_alloc_state(self.env, self.schedule)
        self._isolate(keep={fx.ACT_NAME})
        before = self._leaves_state()
        self._tour('hhg_a73_move_onto_another')
        self.assertEqual(self._leaves_state(), before, 'the tour wrote a request')
        self.assertEqual(made['cto'].request_date_from, date(2026, 11, 16))

    def test_a75_other_row(self):
        made = self._move()
        other = fx._employee(self.env, 'Toff Other', self.schedule)
        self._isolate(keep={fx.ACT_NAME})
        self._tour('hhg_a75_other_row')
        self.env.invalidate_all()
        self.assertEqual(made['confirm'].employee_id, other)
        self.assertEqual(made['confirm'].state, 'confirm')
        self.assertEqual(made['confirm'].request_date_from, date(2026, 11, 16))

    # -- the report view (A66, A79) ---------------------------------------------------------------

    def test_a79_report_no_move(self):
        self._world(demo=False)
        made = fx.make_emp_state(self.env)
        self._only('toff_emp')
        before = self._leaves_state()
        self._tour('hhg_a79_report_no_move', login='toff_emp')
        self.assertEqual(self._leaves_state(), before, 'the tour wrote a request')
        self.assertEqual(made['emp_confirm'].request_date_from, date(2026, 11, 18))

    # -- locked for every user (A86) --------------------------------------------------------------

    def test_a86_locked_admin(self):
        self._act()
        self._tour_writes_nothing('hhg_a86_locked')

    def test_a86_locked_officer(self):
        self._act('toff_officer')
        self._tour_writes_nothing('hhg_a86_locked', login='toff_officer')

    # -- the phone (A59) --------------------------------------------------------------------------

    def test_a59_phone_hold_and_move(self):
        made = self._move()
        self._tour('hhg_a59_phone_hold_and_move', mobile=test_tours.PHONE)
        self._assert_moved_to_tuesday(made['confirm'])

    def test_a59_phone_tap(self):
        self._move()
        self._tour_writes_nothing('hhg_a59_phone_tap', mobile=test_tours.PHONE)
