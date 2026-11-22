# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import json
import unittest
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from odoo.tests import tagged
from odoo.tests.common import TransactionCase
from odoo.tools import json_default

from . import time_off_fixtures as fx
from .test_unavailability import WEEK_PLUS, covered, day_at, local, touches


def local_text(text):
    """A datetime of the data call (UTC text) as the text of the user's zone."""
    moment = datetime.strptime(text, '%Y-%m-%d %H:%M:%S').replace(tzinfo=UTC)
    return moment.astimezone(ZoneInfo(fx.TZ)).strftime('%Y-%m-%d %H:%M:%S')


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

    def _data_call(self, employees):
        """The attendance view's data call for the week of 15 to 21 November, as the browser
        reads it (datetimes as text, to the second)."""
        result = self.env['hr.attendance'].with_context(
            tz=fx.TZ, user_domain=[('employee_id', 'in', employees.ids)],
        ).get_gantt_data(
            [('employee_id', 'in', employees.ids)], ['employee_id'], {'id': {}},
            unavailability_fields=['employee_id'], start_date=WEEK_PLUS[0],
            stop_date=WEEK_PLUS[1], scale='week')
        result = json.loads(json.dumps(result, default=json_default))
        return {
            int(employee_id): [
                (local_text(item['start']), local_text(item['stop'])) for item in items]
            for employee_id, items in result['unavailabilities']['employee_id'].items()}

    def test_a91_whole_day_leave_to_the_second(self):
        """R15 (the instants), E11: a flexible schedule's whole-day leave runs 0:00:00 to
        23:59:59 of the day; a fixed schedule's, to the next midnight."""
        flexible, fixed = self.made['Toff Flexible'], self.made['Toff Fixed']
        found = self._data_call(flexible | fixed)
        self.assertEqual(
            found[flexible.id][0], ('2026-11-16 00:00:00', '2026-11-16 23:59:59'))
        # the fixed schedule's Monday is covered to the next midnight (the interval runs on
        # into the neighbouring days, which the leaves and the weekend cover in one piece)
        monday = [
            pair for pair in found[fixed.id]
            if pair[0] <= '2026-11-16 00:00:00' < pair[1]]
        self.assertEqual(len(monday), 1, found[fixed.id])
        self.assertGreaterEqual(monday[0][1], '2026-11-17 00:00:00')

    def test_a91_company_leave_to_the_second(self):
        """A company-wide leave of Thursday 19 with the Community's default end (23:59:59)
        covers the day for both schedules, to the second."""
        self.env['resource.calendar.leaves'].create({
            'name': 'Toff company day',
            'date_from': fx.utc('2026-11-18 23:00'),
            'date_to': fx.utc('2026-11-19 22:59').replace(second=59),
        })
        flexible, fixed = self.made['Toff Flexible'], self.made['Toff Fixed']
        found = self._data_call(flexible | fixed)
        for employee in (flexible, fixed):
            thursday = [pair for pair in found[employee.id] if pair[0].startswith('2026-11-19')]
            self.assertTrue(thursday, employee.name)
            self.assertEqual(thursday[0][0], '2026-11-19 00:00:00', employee.name)
            self.assertIn(thursday[-1][1], ('2026-11-19 23:59:59', '2026-11-20 00:00:00'))
