# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Backend scenarios of the writes of moving and resizing (002d3 R17 to R19, E1 to E3): what the
Community accepts for a moved open attendance (A84, decision D4), the refused copy (R19, A53), the
refused overlap (A52) and the validated attendance a Self user cannot write (A63). Every refused
write keeps the attendance's values."""
from datetime import datetime, timedelta

from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from .actions_fixtures import PEER_NAME, make_role_users

SIX = datetime(2026, 11, 11, 6, 0)
TEN = datetime(2026, 11, 11, 10, 0)


@tagged('post_install', '-at_install')
class TestOpenMoves(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.Attendance = cls.env['hr.attendance']
        cls.users = make_role_users(cls.env)
        cls.admin = cls.env.ref('base.user_admin')
        cls.admin.write({'group_ids': [
            (4, cls.env.ref('hr_attendance.group_hr_attendance_manager').id)]})
        cls.team = cls.users['gantt_team']
        cls.peer = cls.env['hr.employee'].search([('name', '=', PEER_NAME)])
        # the employee the open attendances belong to: the team user is her attendance manager
        cls.mover = cls._employee('Gantt Mover', manager=cls.team)
        # an employee who is checked in, still open since 05:00
        cls.busy = cls._employee('Gantt Busy')
        cls._attendance(cls.busy, datetime(2026, 11, 11, 5, 0), False)

    @classmethod
    def _employee(cls, name, manager=None):
        values = {'name': name, 'tz': 'Europe/Brussels'}
        if manager:
            values['attendance_manager_id'] = manager.id
        return cls.env['hr.employee'].create(values)

    @classmethod
    def _attendance(cls, employee, check_in, check_out):
        created = cls.Attendance.with_context(skip_time_rules=True).create({
            'employee_id': employee.id, 'check_in': check_in, 'check_out': check_out})
        # without the context of the creation: the writes under test run the Community's rules
        return cls.Attendance.browse(created.id)

    def _open(self):
        """A fresh open attendance of the mover (checked in at 06:00 UTC)."""
        self.Attendance.search([('employee_id', '=', self.mover.id)]).with_context(
            skip_time_rules=True).unlink()
        return self._attendance(self.mover, SIX, False)

    def _remove(self, attendance):
        attendance.with_context(skip_time_rules=True).sudo().unlink()

    def _kept(self, attendance, user, values, error):
        """The write is refused with ``error`` and the attendance keeps its values."""
        before = attendance.read(['employee_id', 'check_in', 'check_out'])
        with self.assertRaises(error), self.cr.savepoint():
            attendance.with_user(user).write(values)
        attendance.invalidate_recordset()
        self.assertEqual(attendance.read(['employee_id', 'check_in', 'check_out']), before)

    def test_a84_community_accepts(self):
        # a check-in later than the server's current time: accepted, and the attendance stays open
        future = fields.Datetime.now() + timedelta(days=1)
        attendance = self._open()
        attendance.with_user(self.admin).write({'check_in': future})
        self.assertEqual(attendance.check_in, future)
        self.assertFalse(attendance.check_out)

        # to an employee who already has an open attendance: refused
        attendance = self._open()
        self._kept(attendance, self.admin, {'employee_id': self.busy.id, 'check_in': TEN},
                   ValidationError)

        # to an employee with an attendance that began before the new check-in and ends after
        # it (the peer's 07:00 to 09:00): refused; at 10:00, after it, accepted
        attendance = self._open()
        eight = datetime(2026, 11, 11, 8, 0)
        self._kept(attendance, self.admin, {'employee_id': self.peer.id, 'check_in': eight},
                   ValidationError)
        attendance.with_user(self.admin).write({'employee_id': self.peer.id, 'check_in': TEN})
        self.assertEqual(attendance.employee_id, self.peer)
        self.assertFalse(attendance.check_out)
        self._remove(attendance)

        # an Administrator, the user who is that employee and the attendance manager of that
        # employee may move it to the employee; any other user gets an access error
        own = self.users['gantt_all'].employee_id
        for user, target in (
            (self.admin, self.peer),
            (self.users['gantt_all'], own),
            (self.team, self.peer),
        ):
            with self.subTest(user=user.login, target=target.name):
                attendance = self._open()
                attendance.with_user(user).write({'employee_id': target.id, 'check_in': TEN})
                self.assertEqual(attendance.employee_id, target)
                self.assertFalse(attendance.check_out)
                self._remove(attendance)  # the next one finds its target checked out
        for user, target in (
            (self.users['gantt_all'], self.peer),  # the peer's manager is the team user
            (self.team, own),  # the team user manages neither the employee nor is it
        ):
            with self.subTest(user=user.login, refused=target.name):
                self._kept(self._open(), user, {'employee_id': target.id, 'check_in': TEN},
                           AccessError)

        # a check-out earlier than the check-in: refused
        closed = self._attendance(self.mover, datetime(2026, 11, 12, 6, 0),
                                  datetime(2026, 11, 12, 8, 0))
        self._kept(closed, self.admin, {'check_out': datetime(2026, 11, 12, 5, 0)},
                   ValidationError)

    def test_e1_overlap_refused(self):
        """A52: a move onto another attendance of the same employee is refused, keeping values."""
        first = self._attendance(self.mover, datetime(2026, 11, 12, 6, 0),
                                 datetime(2026, 11, 12, 9, 30))
        self._attendance(self.mover, datetime(2026, 11, 12, 11, 0), datetime(2026, 11, 12, 12, 0))
        self._kept(first, self.admin, {
            'check_in': datetime(2026, 11, 12, 8, 0), 'check_out': datetime(2026, 11, 12, 11, 30)},
            ValidationError)

    def test_r19_copy_refused(self):
        """A53: the Community refuses to copy an attendance, and nothing is created."""
        attendance = self._open()
        count = self.Attendance.search_count([])
        for user in (self.admin, self.team, self.users['gantt_all']):
            with self.subTest(user=user.login):
                with self.assertRaises(UserError), self.cr.savepoint():
                    attendance.with_user(user).copy()
        self.assertEqual(self.Attendance.search_count([]), count)

    def test_a63_validated_self_refused(self):
        """E3: with the company's validation on, a Self user cannot write a validated attendance."""
        self_user = self.users['gantt_self']
        attendance = self.Attendance.search([('employee_id', '=', self_user.employee_id.id)])
        self.assertEqual(attendance.state, 'validated')
        # validation off: the own attendance is written
        attendance.with_user(self_user).write({'break_duration': 0.25})
        company = self_user.company_id
        company.attendance_validation = 'manual_validation'
        attendance.sudo().write({'state': 'validated'})
        self._kept(attendance, self_user, {
            'check_in': datetime(2026, 11, 11, 8, 0), 'check_out': datetime(2026, 11, 11, 10, 0)},
            AccessError)
