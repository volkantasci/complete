# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the split tool of slice 002e2 (Task 9): the tool's drawing and area, a split
and its Undo, the places where it never shows, a second split, Undo after a deletion, the days
of a split Approved request, a pill cut by the range's edge, the right-to-left language, a
split the server refuses and a reload after a split (A40 to A47, A59, A70, A76, A90, A93). The
harness is that of ``test_tours``; the tours are in ``static/tests/tours/time_off_split_tours.js``
and each test reads here what the tour left on the server. Every record is made here (CI has no
demo data) from the prepared states of ``acceptance.md``."""
import unittest
from datetime import date

from odoo.tests import tagged

from . import test_tours
from . import time_off_fixtures as fx
from .test_report_tours import DASHBOARD, ReportToursBase

DAY = {16: date(2026, 11, 16), 17: date(2026, 11, 17), 18: date(2026, 11, 18)}


@tagged('post_install', '-at_install')
class TestTimeOffSplitTours(ReportToursBase):

    def _leaves(self, name=fx.ACT_NAME):
        """The requests of the employee named ``name``, as the server holds them now."""
        self.env.flush_all()
        self.env.invalidate_all()
        return self.env['hr.leave'].with_context(active_test=False).sudo().search(
            [('employee_id.name', '=', name)], order='request_date_from')

    def _split_state(self, *, one_day=False):
        """*split*: "Toff Act" with STO Approved from Monday 16 to Wednesday 18 November (and,
        for A44, a request of one day To Approve on Friday 20)."""
        leave = fx.make_split_state(self.env, self.schedule)
        if one_day:
            fx.make_waiting(
                self.env, leave.employee_id, fx.find_type(self.env, 'STO'), date(2026, 11, 20))
        self._isolate(keep={fx.ACT_NAME})
        return leave

    def _own_leave_each(self, leaves):
        """Each part has its own resource leave over exactly its days (decision D8)."""
        for leave in leaves:
            own = self.env['resource.calendar.leaves'].sudo().search(
                [('holiday_id', '=', leave.id)])
            self.assertEqual(len(own), 1, f'one resource leave for {leave.request_date_from}')

    def _assert_split(self, leave):
        first, second = self._leaves()
        self.assertEqual(first, leave)
        self.assertEqual((first.request_date_from, first.request_date_to), (DAY[16], DAY[16]))
        self.assertEqual((second.request_date_from, second.request_date_to), (DAY[17], DAY[18]))
        for part in (first, second):
            self.assertEqual(part.state, 'validate')
            self.assertEqual(part.work_entry_type_id, leave.work_entry_type_id)
        self.assertEqual(second.name, first.name)
        self._own_leave_each(first | second)
        return first, second

    # -- A40 to A43: the tool, a split, Undo, the area ----------

    def test_a40_split_tool(self):
        self._split_state()
        self._tour_writes_nothing('hhg_a40_split_tool')

    def test_a41_split(self):
        leave = self._split_state()
        self._tour('hhg_a41_split')
        self._assert_split(leave)

    def test_a42_undo(self):
        leave = self._split_state()
        self._tour('hhg_a42_split_undo')
        leaves = self._leaves()
        self.assertEqual(leaves, leave, 'one request again')
        self.assertEqual((leave.request_date_from, leave.request_date_to), (DAY[16], DAY[18]))
        self.assertEqual(leave.state, 'validate')
        own = self.env['resource.calendar.leaves'].sudo().search([('holiday_id', '=', leave.id)])
        self.assertEqual(len(own), 1, 'one resource leave over all its days')

    def test_a43_area(self):
        self._split_state()
        self._tour_writes_nothing('hhg_a43_split_area')

    # -- A44: where the tool never shows ----------

    def test_a44_edges_and_one_day(self):
        self._split_state(one_day=True)
        self._tour_writes_nothing('hhg_a44_edges_and_one_day')

    def test_a44_role_emp(self):
        self._world('toff_emp', demo=False)
        fx.make_leave(
            self.env, self.role_employees['toff_emp'], fx.find_type(self.env, 'STO'),
            DAY[16], DAY[18])
        self._tour_writes_nothing(
            'hhg_a44_role_emp', login='toff_emp', path=test_tours.MANAGEMENT)

    def test_a44_role_approver(self):
        self._world('toff_approver', demo=False)
        self.peer.leave_manager_id = self.users['toff_approver']
        fx.make_leave(self.env, self.peer, fx.find_type(self.env, 'STO'), DAY[16], DAY[18])
        self.env.flush_all()
        self._tour_writes_nothing(
            'hhg_a44_role_approver', login='toff_approver', path=test_tours.MANAGEMENT)

    def test_a44_report_for_officer(self):
        self._world('toff_officer', demo=False)
        fx.make_leave(
            self.env, self.role_employees['toff_officer'], fx.find_type(self.env, 'STO'),
            DAY[16], DAY[18])
        self._tour_writes_nothing(
            'hhg_a44_report_for_officer', login='toff_officer', path=DASHBOARD)

    def test_a59_no_tool_on_the_phone(self):
        self._split_state()
        self._tour_writes_nothing('hhg_a44_phone', mobile=test_tours.PHONE, touch=False)

    # -- A45, A46, A47: two splits, Undo after a deletion, the days ----------

    def test_a45_split_twice(self):
        self._split_state()
        self._tour('hhg_a45_split_twice')
        leaves = self._leaves()
        self.assertEqual(len(leaves), 3)
        self.assertEqual(
            [(leave.request_date_from, leave.request_date_to) for leave in leaves],
            [(DAY[16], DAY[16]), (DAY[17], DAY[17]), (DAY[18], DAY[18])])
        self.assertEqual(set(leaves.mapped('state')), {'validate'})

    def test_a46_undo_after_a_delete(self):
        leave = self._split_state()
        self._tour('hhg_a46_undo_after_delete')
        leaves = self._leaves()
        self.assertFalse(leave.exists(), 'the first part is deleted')
        self.assertEqual(len(leaves), 1, 'the second part still exists')
        self.assertEqual((leaves.request_date_from, leaves.request_date_to), (DAY[17], DAY[18]))

    def test_a47_days_of_a_split_request(self):
        self._split_state()
        self._tour('hhg_a47_split_days')
        leaves = self._leaves()
        self.assertEqual(len(leaves), 1, 'the second part is deleted')
        self.assertEqual((leaves.request_date_from, leaves.request_date_to), (DAY[16], DAY[16]))

    def _attendance_installed(self):
        return bool(self.env['ir.module.module'].sudo().search(
            [('name', '=', 'hr_attendance_gantt'), ('state', '=', 'installed')]))

    def test_a47_attendance_view(self):
        """The attendance management view's label: "0h / 16h" after the split, "0h / 32h" once
        the second part is deleted (002e R25; skipped without ``hr_attendance_gantt``)."""
        if not self._attendance_installed():
            raise unittest.SkipTest('hr_attendance_gantt is not installed')
        leave = self._split_state()
        self.admin.write({
            'group_ids': [(4, self.env.ref('hr_attendance.group_hr_attendance_manager').id)]})
        self.env['hr.attendance'].sudo().search(
            [('employee_id', '=', leave.employee_id.id)]).unlink()
        answer = leave.with_user(self.admin).hhg_cut_request('2026-11-17')
        self.assertEqual(len(answer['new_ids']), 1)
        self.env.flush_all()
        attendance = '/odoo/action-hr_attendance.hr_attendance_action'
        self._tour('hhg_a47_attendance_16', path=attendance)
        self.env['hr.leave'].browse(answer['new_ids']).with_user(self.admin).unlink()
        self.env.flush_all()
        self._tour('hhg_a47_attendance_32', path=attendance)

    # -- A70: the range's edge ----------

    def test_a70_split_tool_at_the_edge(self):
        employee = fx._employee(self.env, fx.ACT_NAME, self.schedule)
        fx.make_waiting(
            self.env, employee, fx.find_type(self.env, 'STO'),
            date(2026, 11, 20), date(2026, 11, 24))
        self._isolate(keep={fx.ACT_NAME})
        self._tour_writes_nothing('hhg_a70_split_tool_at_the_edge')

    # -- A76: Arabic ----------

    def test_a76_right_to_left(self):
        lang = self.env['res.lang']._activate_lang('ar_001')
        self.assertTrue(lang, 'Arabic exists')
        was_active = True
        self.addCleanup(self._put_language_back, lang, was_active)
        self.admin.write({'lang': 'ar_001'})
        leave = self._split_state()
        self.env.flush_all()
        self._tour('hhg_a76_split_tool_rtl')
        self._assert_split(leave)

    def _put_language_back(self, lang, _was_active):
        self.admin.write({'lang': 'en_US'})
        self.env['res.users'].with_context(active_test=False).search(
            [('lang', '=', 'ar_001')]).write({'lang': 'en_US'})
        lang.write({'active': False})

    # -- A90, A93 ----------

    def test_a90_refused_split(self):
        self._split_state()
        self._tour('hhg_a90_refused_split')
        self.assertFalse(self._leaves(), 'the request is gone, nothing was created')

    def test_a93_split_then_reload(self):
        leave = self._split_state()
        self._tour('hhg_a93_split_reload')
        self._assert_split(leave)
