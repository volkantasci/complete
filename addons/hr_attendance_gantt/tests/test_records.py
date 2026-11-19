# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from .hr_rows_fixtures import HrRowsCase, R13_domain, utc


@tagged('post_install', '-at_install')
class TestRecords(HrRowsCase, TransactionCase):
    """R13: which attendances the view shows."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.make_world()

    def test_a33_crossing_and_open_attendances(self):
        # Tuesday 10 November local: 9 Nov 23:00 to 10 Nov 23:00 UTC, now 11 Nov 10:00 UTC
        result = self.get_data('2026-11-09 23:00', '2026-11-10 23:00', '2026-11-11 10:00')
        shown = self.shown(result)
        self.assertEqual(shown['HRA Anita'], {'2026-11-10 03:00'})
        self.assertEqual(shown['HRA Jennie'], {'2026-11-10 19:00'})
        self.assertNotIn('Gantt Open', shown)  # it checked in after the period
        self.assertEqual(set(shown), {'HRA Anita', 'HRA Jennie'})

    def test_a33_open_attendance_shown_when_now_is_in_the_period(self):
        # Wednesday 11 November local, now 11 Nov 10:00 UTC: "Gantt Open" (since 07:00) shows
        result = self.get_data('2026-11-10 23:00', '2026-11-11 23:00', '2026-11-11 10:00')
        self.assertEqual(self.shown(result)['Gantt Open'], {'2026-11-11 07:00'})
        # now before its check-in: it did not begin before now
        result = self.get_data('2026-11-10 23:00', '2026-11-11 23:00', '2026-11-11 06:00')
        self.assertNotIn('Gantt Open', self.shown(result))

    def test_a33_future_period_no_open(self):
        start, stop, now = '2026-11-11 23:00', '2026-11-12 23:00', '2026-11-11 10:00'
        domain = R13_domain(utc(start), utc(stop), utc(now))
        self.assertNotIn(('check_out', '=', False), domain)
        result = self.get_data(start, stop, now)
        self.assertNotIn('Gantt Open', self.shown(result))
        # the same period, once now has reached it, asks for the open attendances
        self.assertIn(('check_out', '=', False), R13_domain(utc(start), utc(stop), utc(stop)))

    def test_a33_zero_length_at_period_start(self):
        exact = self.prepared['Gantt Exact']
        self.env['hr.attendance'].create({
            'employee_id': exact.id,
            'check_in': utc('2026-11-09 23:00'),
            'check_out': utc('2026-11-09 23:00'),
        })
        now = '2026-11-11 10:00'
        day = self.get_data('2026-11-09 23:00', '2026-11-10 23:00', now)
        self.assertEqual(self.shown(day)['Gantt Exact'], {'2026-11-09 23:00'})
        week = self.get_data('2026-11-07 23:00', '2026-11-14 23:00', now)
        self.assertEqual(
            self.shown(week)['Gantt Exact'], {'2026-11-09 07:00', '2026-11-09 23:00'})
