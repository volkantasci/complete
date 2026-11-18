# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.exceptions import UserError
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from .hr_rows_fixtures import HrRowsCase, make_prepared, utc

DAY_10 = (utc('2026-11-09 23:00'), utc('2026-11-10 23:00'))
DAY_11 = (utc('2026-11-10 23:00'), utc('2026-11-11 23:00'))  # Wednesday 11 November, Brussels
WEEK = (utc('2026-11-07 23:00'), utc('2026-11-14 23:00'))  # Sunday 8 to Saturday 14
MONTH = (utc('2026-10-31 23:00'), utc('2026-11-30 23:00'))


@tagged('post_install', '-at_install')
class TestProgress(HrRowsCase, TransactionCase):
    """R16 hours worked (D2) and expected, R18 flags (A43 to A45, A62, A63, A65, E10)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.make_world()

    def entry(self, name, period=DAY_11, tz='Europe/Brussels'):
        employee = self.prepared.get(name) or self.like[name]
        model = self.Attendance.with_context(tz=tz)
        found = model._gantt_progress_bar('employee_id', [employee.id], *period)
        return found[employee.id]

    def worked(self, name, period=DAY_11):
        return self.entry(name, period)['value']

    def expected(self, name, period=DAY_11):
        return self.entry(name, period)['max_value']

    def test_a43_anita_day_11(self):
        self.assertAlmostEqual(self.worked('HRA Anita'), 8.997, delta=0.001)

    def test_a43_week_unchanged(self):
        self.assertAlmostEqual(self.worked('HRA Anita', WEEK), 29, delta=0.003)

    def test_a43_open_counts_zero(self):
        self.assertEqual(self.worked('Gantt Open'), 0)

    def test_a63_anita_day_10(self):
        self.assertAlmostEqual(self.worked('HRA Anita', DAY_10), 20, delta=0.001)

    def test_a63_jennie_day_10(self):
        self.assertAlmostEqual(self.worked('HRA Jennie', DAY_10), 4, delta=0.001)

    def test_a63_jennie_day_11(self):
        self.assertAlmostEqual(self.worked('HRA Jennie'), 8, delta=0.001)

    def test_a63_week(self):
        self.assertAlmostEqual(self.worked('HRA Jennie', WEEK), 12, delta=0.001)
        self.assertAlmostEqual(self.worked('HRA Anita', WEEK), 29, delta=0.003)

    def test_a65_break_shared(self):
        night = self.prepared['Gantt Night']
        self.env['hr.attendance'].search([('employee_id', '=', night.id)]).unlink()
        attendance = self.env['hr.attendance'].with_context(skip_time_rules=True).create({
            'employee_id': night.id,
            'check_in': utc('2026-11-10 19:00'),
            'check_out': utc('2026-11-11 07:00'),
            'break_duration': 1,
        })
        self.assertAlmostEqual(attendance.worked_hours, 11)
        self.assertAlmostEqual(self.worked('Gantt Night', DAY_10), 11 / 3, places=4)  # 3 h 40 m
        self.assertAlmostEqual(self.worked('Gantt Night', DAY_11), 22 / 3, places=4)  # 7 h 20 m
        self.assertAlmostEqual(self.worked('Gantt Night', WEEK), 11, places=4)

    def test_a44_expected(self):
        self.assertEqual(self.expected('HRA Abigail'), 8)
        self.assertEqual(self.expected('HRA Abigail', WEEK), 40)
        self.assertEqual(self.expected('HRA Abigail', MONTH), 168)
        self.assertEqual(self.expected('Gantt Hourly'), 8)
        self.assertEqual(self.expected('Gantt Hourly', WEEK), 36)
        self.assertEqual(self.expected('Gantt Hourly', MONTH), 152)
        self.assertEqual(self.expected('Gantt Flexible'), 8)
        self.assertEqual(self.expected('Gantt Flexible', WEEK), 40)
        self.assertEqual(self.expected('Gantt Flexible', MONTH), 176)
        self.assertEqual(self.expected('HRA Keith', WEEK), 24)
        self.assertEqual(self.expected('HRA Audrey'), 8)
        self.assertEqual(self.expected('HRA Beth'), 8)

    def test_a44_two_versions_in_one_week(self):
        # Monday and Tuesday on the whole-day schedule (16 h), then from Wednesday on the
        # hourly one (8 h Wednesday and Thursday, 4 h Friday): 36 h, not 40 h
        hourly = self.prepared['Gantt Hourly'].resource_calendar_id
        employee = self.like['HRA Abigail']
        employee.create_version({
            'date_version': '2026-11-11', 'resource_calendar_id': hourly.id})
        self.env.flush_all()
        self.assertEqual(self.expected('HRA Abigail', WEEK), 36)

    def test_a62_holiday_lowers_to_32(self):
        made = make_prepared(self.env, holiday=True, demo_schedule=self.schedule)
        self.assertIn('Gantt Holiday', made)
        self.assertEqual(self.expected('HRA Abigail', WEEK), 32)
        self.assertEqual(self.expected('HRA Abigail'), 8)

    def test_a45_flags(self):
        for name in self.prepared:
            if name == 'Gantt Holiday':
                continue
            entry = self.entry(name)
            self.assertEqual(entry['hag_fully_flexible'], name == 'Gantt Free', name)
            self.assertEqual(entry['hag_tracked'], name == 'Gantt Tracked', name)
        self.assertEqual(self.expected('Gantt Free'), 0)
        self.assertEqual(self.expected('Gantt Free', MONTH), 0)
        self.assertEqual(self.entry('HRA Anita')['hag_fully_flexible'], False)
        self.assertEqual(self.entry('HRA Anita')['hag_tracked'], False)

    def test_a45_free_and_tracked(self):
        self.prepared['Gantt Free'].write({'attendance_based': True})
        entry = self.entry('Gantt Free')
        self.assertEqual((entry['hag_fully_flexible'], entry['hag_tracked']), (True, True))
        self.assertEqual(entry['max_value'], 0)

    def test_r16_keys_are_002a_keys(self):
        self.assertTrue({'value', 'max_value'} <= set(self.entry('HRA Anita')))

    def test_e10_other_field_refused(self):
        with self.assertRaises(UserError):
            self.Attendance._gantt_progress_bar('create_uid', [self.env.uid], *DAY_11)

    def test_r16_through_get_gantt_data(self):
        result = self.get_data(
            '2026-11-10 23:00', '2026-11-11 23:00', '2026-11-11 10:00',
            progress_bar_fields=['employee_id'])
        anita = self.like['HRA Anita'].id
        self.assertAlmostEqual(result['progress_bars']['employee_id'][anita]['value'], 8.997,
                               delta=0.001)
