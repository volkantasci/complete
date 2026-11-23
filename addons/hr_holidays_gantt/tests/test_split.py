# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import date

from freezegun import freeze_time
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from . import time_off_fixtures as fx

CLOCK = '2026-11-11 10:00:00'
DEC = (date(2026, 12, 14), date(2026, 12, 16))


@tagged('post_install', '-at_install')
class TestTimeOffSplit(fx.TimeOffGanttMixin, TransactionCase):
    """R17, D8, D10: the server methods that split a request in two and undo it."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.users = fx.make_role_users(cls.env)
        cls.admin = fx.find_admin(cls.env)
        cls.officer = cls.users['toff_officer']
        cls.sick = fx.find_type(cls.env, 'STO')

    # helpers

    def employee(self, name=fx.ACT_NAME):
        return self.env['hr.employee'].search([('name', '=', name)], limit=1)

    def cut(self, leave, day, user=None):
        return leave.with_user(user or self.admin).hhg_cut_request(day)

    def rejoin(self, leave, answer, user=None, **extra):
        return leave.with_user(user or self.admin).hhg_rejoin_request(
            answer['new_ids'], answer['end_day'], answer['end_period'], answer['end_hour'],
            **extra)

    def resource_leaves(self, leave):
        self.env.flush_all()
        return self.env['resource.calendar.leaves'].sudo().search(
            [('holiday_id', '=', leave.id)])

    def assert_leave_span(self, leave, first, last):
        """``leave`` has exactly one resource leave from ``first`` 8:00 to ``last`` 16:00
        Brussels (07:00 and 15:00 UTC in November and December)."""
        found = self.resource_leaves(leave)
        self.assertEqual(len(found), 1)
        self.assertEqual(found.date_from, fx.utc(f'{first} 07:00'))
        self.assertEqual(found.date_to, fx.utc(f'{last} 15:00'))

    def span(self, leave):
        leave.invalidate_recordset()
        return leave.request_date_from, leave.request_date_to

    def waiting(self, leave):
        """Set an Approved request back To Approve (by hand: the day may have passed)."""
        return fx.set_waiting(self.env, leave)

    def split_state(self):
        leave = fx.make_split_state(self.env)
        self.assertEqual(leave.state, 'validate')
        return leave

    def cut_split(self, leave=None):
        leave = leave or self.split_state()
        answer = self.cut(leave, '2026-11-17')
        return leave, self.env['hr.leave'].browse(answer['new_ids']), answer

    # scenarios

    def test_a01_bridge_parts(self):
        """The two methods answer for an Officer (the popover's form is Task 4's)."""
        leave = self.split_state()
        answer = self.cut(leave, '2026-11-17', user=self.officer)
        self.assertEqual(len(answer['new_ids']), 1)
        self.assertTrue(self.rejoin(leave, answer, user=self.officer))

    def test_a02_split_approved(self):
        leave = self.split_state()
        end_hour = leave.request_hour_to
        leave, new, answer = self.cut_split(leave)
        self.assertEqual(len(answer['new_ids']), 1)
        self.assertEqual(answer['end_day'], '2026-11-18')
        self.assertEqual(answer['end_period'], 'pm')
        self.assertEqual(answer['end_hour'], end_hour)
        self.assertEqual(self.span(leave), (date(2026, 11, 16), date(2026, 11, 16)))
        self.assertEqual(leave.request_date_to_period, 'pm')
        self.assertEqual(leave.number_of_days, 1)
        self.assertEqual(self.span(new), (date(2026, 11, 17), date(2026, 11, 18)))
        self.assertEqual(new.number_of_days, 2)
        self.assertEqual((leave.state, new.state), ('validate', 'validate'))
        self.assertEqual(new.employee_id, leave.employee_id)
        self.assertEqual(new.work_entry_type_id, leave.work_entry_type_id)

    def test_a03_day_outside_changes_nothing(self):
        leave = self.split_state()
        for day in ('2026-11-16', '2026-11-14', '2026-11-19', '2026-11-25'):
            with self.subTest(day=day):
                answer = self.cut(leave, day)
                self.assertEqual(answer['new_ids'], [])
                self.assertEqual(answer['end_day'], '2026-11-18')
                self.assertEqual(self.span(leave), (date(2026, 11, 16), date(2026, 11, 18)))
                self.assert_leave_span(leave, '2026-11-16', '2026-11-18')
        self.assertEqual(
            self.env['hr.leave'].search_count([('employee_id', '=', leave.employee_id.id)]), 1)

    def test_a04_missing_or_malformed_day(self):
        leave = self.split_state()
        for day in (None, False, '', '18/11/2026', '2026-13-45', 20261118):
            with self.subTest(day=day), self.assertRaises((UserError, ValidationError)):
                self.cut(leave, day)
        other = fx.make_leave(
            self.env, self.employee('Toff Peer'), self.sick, date(2026, 11, 16), date(2026, 11, 18))
        with self.assertRaises(ValueError):
            (leave | other).with_user(self.admin).hhg_cut_request('2026-11-17')
        self.assertEqual(self.span(leave), (date(2026, 11, 16), date(2026, 11, 18)))
        self.assertEqual(self.span(other), (date(2026, 11, 16), date(2026, 11, 18)))
        self.assertEqual(
            self.env['hr.leave'].search_count([('employee_id', '=', leave.employee_id.id)]), 1)

    def test_a05_undo(self):
        leave, new, answer = self.cut_split()
        self.assertTrue(self.rejoin(leave, answer))
        self.assertFalse(new.exists())
        self.assertEqual(self.span(leave), (date(2026, 11, 16), date(2026, 11, 18)))
        self.assertEqual(leave.state, 'validate')
        # the new part deleted before the undo
        leave, new, answer = self.cut_split(leave)
        new.with_user(self.admin).unlink()
        self.assertTrue(self.rejoin(leave, answer))
        self.assertEqual(self.span(leave), (date(2026, 11, 16), date(2026, 11, 18)))
        self.assertEqual(leave.request_date_to_period, 'pm')

    def test_a05_undo_refuses_foreign_ids(self):
        leave, new, answer = self.cut_split()
        other = fx.make_leave(
            self.env, self.employee('Toff Peer'), self.sick, date(2026, 11, 17), date(2026, 11, 18))
        later = fx.make_leave(
            self.env, leave.employee_id, self.sick, date(2026, 11, 24), date(2026, 11, 24))
        for ids in ([other.id], [later.id], [leave.id], [new.id, later.id]):
            with self.subTest(ids=ids), self.assertRaises(UserError):
                leave.with_user(self.officer).hhg_rejoin_request(
                    ids, answer['end_day'], answer['end_period'], answer['end_hour'])
            for record in (other, later, leave, new):
                self.assertTrue(record.exists())
            self.assertEqual(self.span(leave), (date(2026, 11, 16), date(2026, 11, 16)))
            self.assertEqual(self.span(new), (date(2026, 11, 17), date(2026, 11, 18)))

    def test_a07_approved_hour_request_leaves(self):
        employee = self.env['hr.employee'].create({
            'name': 'Toff Act Hours', 'tz': fx.TZ, 'contract_date_start': fx.CONTRACT_START,
            'date_version': fx.CONTRACT_START,
            'resource_calendar_id': fx.find_schedule(self.env).id})
        leave = fx.make_leave(
            self.env, employee, fx.make_hours_type(self.env), date(2026, 11, 16),
            date(2026, 11, 18), duration='specific', hours=(9, 13))
        self.assertEqual(leave.state, 'validate')
        new = self.env['hr.leave'].browse(self.cut(leave, '2026-11-18')['new_ids'])
        first = self.resource_leaves(leave)
        second = self.resource_leaves(new)
        self.assertEqual((len(first), len(second)), (1, 1))
        self.assertEqual(first.date_from, fx.utc('2026-11-16 08:00'))
        self.assertEqual(first.date_to, fx.utc('2026-11-17 15:00'))
        self.assertEqual(second.date_from, fx.utc('2026-11-18 07:00'))
        self.assertEqual(second.date_to, fx.utc('2026-11-18 12:00'))

    def test_a06_undo_after_request_deleted(self):
        leave, new, answer = self.cut_split()
        leave.with_user(self.admin).unlink()
        self.assertFalse(self.rejoin(leave, answer))
        self.assertTrue(new.exists(), 'nothing is written when the request is gone')

    def test_a07_hour_request(self):
        employee = self.env['hr.employee'].create({
            'name': 'Toff Act Hours', 'tz': fx.TZ, 'contract_date_start': fx.CONTRACT_START,
            'date_version': fx.CONTRACT_START,
            'resource_calendar_id': fx.find_schedule(self.env).id})
        leave = fx.make_leave(
            self.env, employee, fx.make_hours_type(self.env), date(2026, 11, 16),
            date(2026, 11, 18), duration='specific', hours=(9, 13), approve=False)
        self.waiting(leave)
        hours = leave.number_of_hours
        answer = self.cut(leave, '2026-11-18')
        new = self.env['hr.leave'].browse(answer['new_ids'])
        self.assertEqual(len(new), 1)
        self.assertEqual(answer['end_day'], '2026-11-18')
        self.assertEqual(answer['end_hour'], 13.0)
        self.assertEqual((leave.request_date_to, leave.request_hour_to), (date(2026, 11, 17), 16.0))
        self.assertEqual((new.request_date_from, new.request_hour_from), (date(2026, 11, 18), 8.0))
        self.assertEqual((new.request_date_to, new.request_hour_to), (date(2026, 11, 18), 13.0))
        self.assertEqual((leave.state, new.state), ('confirm', 'confirm'))
        self.assertAlmostEqual(leave.number_of_hours + new.number_of_hours, hours)
        self.assertTrue(self.rejoin(leave, answer))
        self.assertEqual((leave.request_date_to, leave.request_hour_to), (date(2026, 11, 18), 13.0))

    def test_a08_half_day(self):
        half, _hours = fx.make_units_state(self.env)
        self.assertEqual(half.number_of_days, 2)
        answer = self.cut(half, '2026-11-17')
        new = self.env['hr.leave'].browse(answer['new_ids'])
        self.assertEqual(len(new), 1)
        self.assertEqual(self.span(half), (date(2026, 11, 16), date(2026, 11, 16)))
        self.assertEqual(half.request_date_from_period, 'pm')
        self.assertEqual(half.number_of_days, 0.5)
        self.assertEqual(self.span(new), (date(2026, 11, 17), date(2026, 11, 18)))
        self.assertEqual((new.request_date_from_period, new.request_date_to_period), ('am', 'am'))
        self.assertEqual(new.number_of_days, 1.5)
        self.assertEqual((half.state, new.state), ('confirm', 'confirm'))

    def test_a09_split_keeps_state(self):
        peer = self.employee(fx.PEER_NAME)
        waiting = fx.make_leave(
            self.env, peer, self.sick, date(2026, 11, 16), date(2026, 11, 17))
        self.waiting(waiting)
        refused = fx.make_leave(
            self.env, peer, self.sick, date(2026, 11, 19), date(2026, 11, 20))
        refused.with_user(self.admin).action_refuse()
        self.assertEqual((waiting.state, refused.state), ('confirm', 'refuse'))
        for leave, day, state in (
                (waiting, '2026-11-17', 'confirm'), (refused, '2026-11-20', 'refuse')):
            with self.subTest(state=state):
                new = self.env['hr.leave'].browse(
                    self.cut(leave, day, user=self.officer)['new_ids'])
                self.assertEqual(len(new), 1)
                self.assertEqual((leave.state, new.state), (state, state))

    def test_a87_leaves_of_split_approved(self):
        leave = self.split_state()
        self.assert_leave_span(leave, '2026-11-16', '2026-11-18')
        leave, new, _answer = self.cut_split(leave)
        self.assert_leave_span(leave, '2026-11-16', '2026-11-16')
        self.assert_leave_span(new, '2026-11-17', '2026-11-18')

    def test_a88_delete_one_part(self):
        leave, new, _answer = self.cut_split()
        new.with_user(self.admin).unlink()
        self.assertFalse(self.resource_leaves(new))
        self.assert_leave_span(leave, '2026-11-16', '2026-11-16')
        with freeze_time(CLOCK):
            result = self.call_gantt(
                user=self.admin, period=fx.WEEK, scale='week',
                user_domain=[('employee_id.name', '=', fx.ACT_NAME)],
                progress_bar_fields=['employee_id'])
        self.assertEqual(
            result['progress_bars']['employee_id'][leave.employee_id.id], {'value': 32})

    def test_a89_undo_one_leave_again(self):
        leave, new, answer = self.cut_split()
        self.assertTrue(self.rejoin(leave, answer))
        self.assertFalse(new.exists())
        self.assertFalse(self.resource_leaves(new))
        self.assertEqual(leave.state, 'validate')
        self.assert_leave_span(leave, '2026-11-16', '2026-11-18')
        # a request at Second Approval has no leave before the final approval
        unpaid = fx.make_leave(
            self.env, self.employee('Toff Peer'), fx.find_type(self.env, 'UN'),
            date(2026, 11, 16), date(2026, 11, 18))
        unpaid.with_user(self.admin).action_back_to_approval()
        fx.approve_leave(self.env, unpaid, once=True)
        self.assertEqual(unpaid.state, 'validate1')
        answer = self.cut(unpaid, '2026-11-17')
        part = self.env['hr.leave'].browse(answer['new_ids'])
        self.assertEqual(len(part), 1)
        self.assertEqual((unpaid.state, part.state), ('validate1', 'validate1'))
        self.assertFalse(self.resource_leaves(unpaid))
        self.assertFalse(self.resource_leaves(part))

    def dec_requests(self, user_logins):
        """Requests of 14 to 16 December: To Approve for every owner, Approved for a second
        employee of the same approver (a person has one request per day)."""
        made = []
        second = self.env['hr.employee'].create({
            'name': 'Toff Peer Two', 'tz': fx.TZ, 'contract_date_start': fx.CONTRACT_START,
            'date_version': fx.CONTRACT_START,
            'parent_id': self.employee(fx.PEER_NAME).parent_id.id,
            'resource_calendar_id': fx.find_schedule(self.env).id,
            'leave_manager_id': self.users['toff_approver'].id})
        names = [self.users[login].employee_id.name for login in user_logins]
        names += [fx.PEER_NAME]
        for name in names:
            made.append(self.waiting(fx.make_leave(
                self.env, self.employee(name), self.sick, *DEC)))
        made.append(fx.make_leave(self.env, second, self.sick, *DEC))
        self.assertEqual(made[-1].state, 'validate')
        return made

    def assert_refused(self, user, requests):
        for leave in requests:
            before = (leave.state, *self.span(leave))
            for call in (
                lambda leave=leave: leave.with_user(user).hhg_cut_request('2026-12-15'),
                lambda leave=leave: leave.with_user(user).hhg_rejoin_request(
                    [], '2026-12-16', 'pm', 16.0),
            ):
                with self.subTest(user=user.login, leave=leave.id), self.assertRaises(AccessError):
                    call()
            self.assertEqual((leave.state, *self.span(leave)), before)
            self.assertEqual(self.span(leave), DEC)
        self.assertEqual(
            self.env['hr.leave'].sudo().search_count([('request_date_from', '=', DEC[0])]),
            len(requests))

    def test_a91_employee_manager_refused(self):
        requests = self.dec_requests(['toff_emp', 'toff_manager'])
        for login in ('toff_emp', 'toff_manager'):
            self.assert_refused(self.users[login], requests)

    def test_a92_approver_refused(self):
        requests = self.dec_requests(['toff_approver'])
        self.assert_refused(self.users['toff_approver'], requests)
