# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import date, timedelta

from freezegun import freeze_time
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from . import time_off_fixtures as fx

CLOCK = '2026-11-11 10:00:00'


@tagged('post_install', '-at_install')
class TestTimeOffCommunityWrites(TransactionCase):
    """What the Community answers to the popover's and the gestures' writes (R10, R12, R14)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.users = fx.make_role_users(cls.env)
        cls.admin = fx.find_admin(cls.env)

    def shift(self, leave, days=1, user=None):
        """The view's write: start and end as date and hour, moved by ``days`` days."""
        leave = leave.with_user(user or self.admin).with_context(tz=fx.TZ)
        delta = timedelta(days=days)
        with self.env.cr.savepoint():
            leave.write({
                'request_date_hour_from': leave.request_date_hour_from + delta,
                'request_date_hour_to': leave.request_date_hour_to + delta,
            })
        self.env.flush_all()

    def span(self, leave):
        leave.invalidate_recordset()
        return leave.request_date_from, leave.request_date_to

    def test_a26_move_write(self):
        state = fx.make_alloc_state(self.env)
        cto, sto = state['cto'], state['sto']
        self.assertEqual((cto.number_of_days, cto.number_of_hours), (2, 16))
        self.shift(cto)
        cto.invalidate_recordset()
        self.assertEqual(self.span(cto), (date(2026, 11, 17), date(2026, 11, 18)))
        self.assertEqual((cto.number_of_days, cto.number_of_hours), (2, 16))
        self.assertEqual(cto.state, 'confirm')
        with self.assertRaises(ValidationError):
            self.shift(sto)
        self.assertEqual(self.span(sto), (date(2026, 11, 19), date(2026, 11, 19)))
        self.assertEqual(sto.state, 'validate')

    def test_a74_deletions(self):
        """The Community's matrix of deletions (R10, R19), the server's day being 11 Nov 2026."""
        with freeze_time(CLOCK):
            self.check_deletions()

    def make_deletions(self):
        fx.drop_leaves(self.env)
        # the four states of toff_emp's own employee from Monday 16 (and a Cancelled request of
        # Friday 20, cancelled by the role user) and of Toff Peer from Monday 23: every request
        # after the server's day
        made = fx.make_matrix_state(
            self.env, 'toff_emp', date(2026, 11, 16), peer_first=date(2026, 11, 23))
        own, peer = made['own'], made['peer']
        past = fx.make_past_state(self.env)['emp_past']
        self.assertEqual(past.request_date_from, date(2026, 11, 10))
        return own, peer, past

    def delete(self, leave, user):
        with self.env.cr.savepoint():
            leave.with_user(user).unlink()

    def check_deletions(self):
        emp = self.users['toff_emp']
        # toff_emp
        own, peer, past = self.make_deletions()
        for key in ('confirm', 'validate1'):
            self.delete(own[key], emp)
            self.assertFalse(own[key].exists(), key)
        # their own Cancelled, Approved and Refused requests give the access error, as every
        # request of another employee (the Community's own rule, not the administrators' error)
        for leave in (own['cancel'], own['validate'], own['refuse'], *peer.values()):
            with self.assertRaises(AccessError, msg=leave.state):
                self.delete(leave, emp)
        with self.assertRaisesRegex(UserError, 'in the past'):
            self.delete(past, emp)
        # toff_approver: every request of Toff Peer
        own, peer, past = self.make_deletions()
        for leave in peer.values():
            with self.assertRaises(AccessError, msg=leave.state):
                self.delete(leave, self.users['toff_approver'])
        # toff_officer: To Approve and Cancelled, their own too
        own, peer, past = self.make_deletions()
        officer = self.users['toff_officer']
        for group in (own, peer):
            self.delete(group['confirm'], officer)
            for key in ('validate1', 'validate', 'refuse'):
                with self.assertRaisesRegex(UserError, 'only be deleted by Administrators'):
                    self.delete(group[key], officer)
        self.delete(own['cancel'], officer)
        self.assertFalse(own['cancel'].exists())
        self.delete(past, officer)
        # the administrator: every state
        own, peer, past = self.make_deletions()
        for leave in (*own.values(), *peer.values(), past):
            self.delete(leave, self.admin)
            self.assertFalse(leave.exists())

    def test_a80_community_answers(self):
        state = fx.make_move_state(self.env)
        waiting, approved = state['confirm'], state['validate']
        employee = state['employee']
        # a move of the request To Approve by one day
        self.shift(waiting)
        self.assertEqual(self.span(waiting), (date(2026, 11, 17), date(2026, 11, 17)))
        self.assertEqual(waiting.state, 'confirm')
        # the Approved request's write is refused, nothing changes
        with self.assertRaises(ValidationError):
            self.shift(approved)
        self.assertEqual(self.span(approved), (date(2026, 11, 18), date(2026, 11, 18)))
        # onto the Approved request's day: the overlap error
        with self.assertRaisesRegex(ValidationError, 'overlaps with this period'):
            self.shift(waiting)
        self.assertEqual(self.span(waiting), (date(2026, 11, 17), date(2026, 11, 17)))
        # a copy of a request To Approve is refused
        with self.assertRaises(UserError):
            with self.env.cr.savepoint():
                waiting.with_user(self.admin).copy()
        # a copy of a Refused request, on Monday 23 November
        refused = fx.make_refused(
            self.env, employee, fx.find_type(self.env, 'STO'), date(2026, 11, 20))
        copy = refused.with_user(self.admin).copy({
            'request_date_from': date(2026, 11, 23), 'request_date_to': date(2026, 11, 23)})
        self.assertEqual(copy.state, 'validate')
        self.assertEqual(copy.request_date_from, date(2026, 11, 23))
        self.assertEqual(refused.state, 'refuse')
        self.assertEqual(self.span(refused), (date(2026, 11, 20), date(2026, 11, 20)))
