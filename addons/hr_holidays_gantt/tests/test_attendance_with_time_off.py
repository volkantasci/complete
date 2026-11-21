# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import unittest

from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from . import time_off_fixtures as fx
from .test_unavailability import WEEK_PLUS, covered, day_at, local, touches


@tagged('post_install', '-at_install')
class TestAttendanceWithTimeOff(TransactionCase):
    """R25 points 1 and 3: the attendance views' hook, with Time Off installed.

    Skipped in a database without the attendance bridge.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        module = cls.env['ir.module.module'].sudo().search(
            [('name', '=', 'hr_attendance_gantt'), ('state', '=', 'installed')])
        if not module:
            raise unittest.SkipTest('hr_attendance_gantt is not installed')
        fx.make_role_users(cls.env)
        cls.made = fx.make_flexible(cls.env)
        cls.states = fx.make_states(cls.env)
        cls.world = fx.make_demo_like(cls.env)

    def unavailable(self, employee):
        found = self.env['hr.attendance'].with_context(tz=fx.TZ)._gantt_unavailability(
            'employee_id', [employee.id], *WEEK_PLUS, 'week')
        return found[employee.id]

    def test_a40_attendance_unavailable(self):
        mitchell = self.world['Mitchell Admin']
        found = self.unavailable(mitchell)
        # 16 to 18 November, approved: the days' working hours are unavailable
        for day in (16, 17, 18):
            self.assertTrue(covered(found, day_at(day, 9), day_at(day, 16)), day)
        self.assertFalse(touches(found, day_at(19, 9), day_at(19, 16)))
        # a request To Approve (16 November) and a refused one (19) grey nothing
        waiting = self.unavailable(self.states)
        self.assertFalse(touches(waiting, day_at(16, 9), day_at(16, 11)))
        self.assertFalse(touches(waiting, day_at(19, 9), day_at(19, 11)))
        self.assertTrue(covered(waiting, day_at(18, 0), day_at(19, 0)))

    def test_a35_attendance_flexible(self):
        found = [
            (local(item['start']), local(item['stop']))
            for item in self.unavailable(self.made['Toff Flexible'])]
        self.assertEqual(found, [
            (day_at(16, 0), day_at(16, 23, 59, 59, 999999)),
            (day_at(17, 0), day_at(17, 11, 59, 59, 999999)),
            (day_at(18, 9), day_at(18, 12, 59, 59, 999999)),
        ])
        # the fixed schedule's Tuesday morning is the Community's: its afternoon stays available
        fixed = self.unavailable(self.made['Toff Fixed'])
        self.assertFalse(touches(fixed, day_at(17, 14), day_at(17, 15)))

    def test_a36_attendance_expected(self):
        """R25 point 2: the attendance view's hours expected, with Time Off installed."""
        names = ('Toff Fixed', 'Toff Flexible')
        staff = self.env['hr.employee'].browse(
            [self.made[name].id for name in names]
            + [self.world[name].id for name in ('Mitchell Admin', 'Anita Oliver')])
        found = self.env['hr.attendance'].with_context(tz=fx.TZ)._gantt_progress_bar(
            'employee_id', staff.ids, *fx.WEEK)
        self.assertEqual(
            {employee.name: found[employee.id]['max_value'] for employee in staff},
            {'Toff Fixed': 24, 'Toff Flexible': 40, 'Mitchell Admin': 16, 'Anita Oliver': 32})
