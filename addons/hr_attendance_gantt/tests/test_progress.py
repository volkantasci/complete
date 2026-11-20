# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import date

from freezegun import freeze_time
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
        employee = (
            self.prepared.get(name) or self.like.get(name)
            or self.env['hr.employee'].search([('name', '=', name)], limit=1))
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
        # Monday and Tuesday on the whole-day schedule (8 h a day), then from Wednesday on
        # a schedule of 6 h a day: the week holds 16 + 18 = 34 h, which only a version
        # change on Wednesday gives (40 h on either schedule alone would be 40 or 30).
        # Her first version is dated at her contract's start, long before the change.
        short = self.env['resource.calendar'].create({
            'name': 'HRA 6 hours/day', 'calendar_type': 'fixed',
            'attendance_ids': [(5, 0, 0)] + [
                (0, 0, {'dayofweek': str(dow), 'hour_from': hour_from, 'hour_to': hour_to})
                for dow in range(5) for hour_from, hour_to in ((8, 12), (13, 15))],
        })
        employee = self.like['HRA Abigail']
        self.assertEqual(employee._get_version(date(2026, 11, 10)).date_version, date(2026, 10, 1))
        employee.create_version({'date_version': '2026-11-11', 'resource_calendar_id': short.id})
        self.env.flush_all()
        self.assertEqual(self.expected('HRA Abigail', DAY_10), 8)  # Tuesday: the old schedule
        self.assertEqual(self.expected('HRA Abigail', DAY_11), 6)  # Wednesday: the new one
        self.assertEqual(self.expected('HRA Abigail', WEEK), 34)

    def test_r16_contract_starting_the_day_after_the_period(self):
        # no contract overlaps the days of the period: the current schedule counts, the
        # contract of the next day does not turn the hours into 0
        schedule = self.schedule
        employee = self.env['hr.employee'].create({
            'name': 'HRA Later', 'tz': 'Europe/Brussels', 'resource_calendar_id': schedule.id,
            'contract_date_start': '2026-12-01', 'date_version': '2026-01-01'})
        day = (utc('2026-11-29 23:00'), utc('2026-11-30 23:00'))  # Monday 30 November
        month = (utc('2026-10-31 23:00'), utc('2026-11-30 23:00'))
        model = self.Attendance.with_context(tz='Europe/Brussels')
        found = model._gantt_progress_bar('employee_id', [employee.id], *day)
        self.assertEqual(found[employee.id]['max_value'], 8)
        found = model._gantt_progress_bar('employee_id', [employee.id], *month)
        self.assertEqual(found[employee.id]['max_value'], 168)

    def test_a67_contract_starting_the_day_after_the_period(self):
        beth = self.like['HRA Beth']
        beth.contract_date_start = '2026-11-12'
        self.env.flush_all()
        entry = self.entry('HRA Beth')
        self.assertEqual((entry['value'], entry['max_value']), (0, 8))
        # her name stays red (R19)
        result = self.get_data(
            '2026-11-10 23:00', '2026-11-11 23:00', '2026-11-11 10:00',
            user_domain=[('employee_id', '=', beth.id)])
        self.assertEqual(result['hag_without_contract'], [beth.id])
        # the contract is counted from its own first day
        day_12 = (utc('2026-11-11 23:00'), utc('2026-11-12 23:00'))
        self.assertEqual(self.expected('HRA Beth', day_12), 8)

    def test_a72_expected_hours_in_the_users_time_zone(self):
        split = self.prepared['Gantt Hourly'].resource_calendar_id
        tokyo = self.env['hr.employee'].create({
            'name': 'HRA Tokyo', 'tz': 'Asia/Tokyo', 'resource_calendar_id': split.id,
            'contract_date_start': '2026-01-01', 'date_version': '2026-01-01'})
        model = self.Attendance.with_context(tz='Asia/Tokyo')

        def maximum(start, stop):
            return model._gantt_progress_bar(
                'employee_id', [tokyo.id], utc(start), utc(stop))[tokyo.id]['max_value']

        self.assertEqual(maximum('2026-11-08 15:00', '2026-11-09 15:00'), 8)  # Monday 9
        self.assertEqual(maximum('2026-11-12 15:00', '2026-11-13 15:00'), 4)  # Friday 13
        self.assertEqual(maximum('2026-11-07 15:00', '2026-11-14 15:00'), 36)  # 8 to 14

    def test_r16_a_contract_of_the_next_day_adds_no_hours_across_zones(self):
        # an employee of Tokyo, a user and a period of Brussels: the next contract's first
        # hours lie inside the Brussels day on the clock, but the day after the period
        employee = self.env['hr.employee'].create({
            'name': 'HRA Two Contracts', 'tz': 'Asia/Tokyo',
            'resource_calendar_id': self.schedule.id,
            'contract_date_start': '2026-01-01', 'contract_date_end': '2026-11-11',
            'date_version': '2026-01-01'})
        self.env.flush_all()
        before = self.expected('HRA Two Contracts')
        employee.create_version({
            'date_version': '2026-11-12', 'contract_date_start': '2026-11-12',
            'contract_date_end': False})
        self.env.flush_all()
        self.assertEqual(self.expected('HRA Two Contracts'), before)

    def test_r16_schedule_in_effect_on_the_first_day_decides(self):
        # a flexible schedule up to 9 November, no contract; from 10 November a contract on
        # whole days. On the week of 8 to 14 November the schedule at the period's start is
        # the flexible one (40 h by the weekly formula); the first version in contract
        # (whole days, Tuesday to Friday: 32 h) does not decide. On 11 November the schedule
        # at the start is the whole-day one (8 h).
        flex = self.prepared['Gantt Flexible'].resource_calendar_id
        employee = self.env['hr.employee'].create({
            'name': 'HRA Changed', 'tz': 'Europe/Brussels', 'resource_calendar_id': flex.id,
            'date_version': '2026-01-01'})
        employee.create_version({
            'date_version': '2026-11-10', 'resource_calendar_id': self.schedule.id,
            'contract_date_start': '2026-11-10'})
        self.env.flush_all()
        self.assertEqual(self.expected('HRA Changed', WEEK), 40)
        self.assertEqual(self.expected('HRA Changed'), 8)

    def test_r16_bounds_of_another_zone_than_the_users(self):
        # bounds at Brussels midnights, the user in New York: the day count comes from the
        # two instants, and the expected hours are those of the browser's day
        flex = self.prepared['Gantt Flexible'].resource_calendar_id
        flexible = self.env['hr.employee'].create({
            'name': 'HRA Zone Flex', 'tz': 'Europe/Brussels', 'resource_calendar_id': flex.id,
            'contract_date_start': '2026-01-01', 'date_version': '2026-01-01'})
        whole = self.env['hr.employee'].create({
            'name': 'HRA Zone Whole', 'tz': 'Europe/Brussels',
            'resource_calendar_id': self.schedule.id, 'contract_date_start': '2026-01-01',
            'date_version': '2026-01-01'})
        self.env.flush_all()
        model = self.Attendance.with_context(tz='America/New_York')
        found = model._gantt_progress_bar('employee_id', [flexible.id, whole.id], *DAY_11)
        self.assertEqual(found[flexible.id]['max_value'], 8)
        self.assertEqual(found[whole.id]['max_value'], 8)  # Wednesday 11 November
        found = model._gantt_progress_bar('employee_id', [whole.id], *DAY_10)
        self.assertEqual(found[whole.id]['max_value'], 8)  # Tuesday 10 November

    def test_r16_the_flag_reads_the_current_schedule(self):
        # "The current schedule" is the schedule of the employee today: the clock is frozen
        # after the change of 2026-11-11 so that the test does not depend on the real day.
        with freeze_time('2026-11-19 10:00:00'):
            self.check_flag_reads_the_current_schedule()

    def check_flag_reads_the_current_schedule(self):
        free = self.prepared['Gantt Free'].resource_calendar_id
        employee = self.env['hr.employee'].create({
            'name': 'HRA Became Free', 'tz': 'Europe/Brussels',
            'resource_calendar_id': self.schedule.id, 'contract_date_start': '2026-01-01',
            'date_version': '2026-01-01'})
        employee.create_version({'date_version': '2026-11-11', 'resource_calendar_id': free.id})
        self.env.flush_all()
        # 9 November: the schedule at the start has whole days (8 h); the current one is free
        found = self.entry('HRA Became Free', (utc('2026-11-08 23:00'), utc('2026-11-09 23:00')))
        self.assertEqual((found['max_value'], found['hag_fully_flexible']), (8, True))
        # 12 November: the schedule at the start is the free one (24 h, N2), as the current one
        found = self.entry('HRA Became Free', (utc('2026-11-11 23:00'), utc('2026-11-12 23:00')))
        self.assertEqual((found['max_value'], found['hag_fully_flexible']), (24, True))

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
        self.assertEqual(self.expected('Gantt Free'), 24)  # N2
        self.assertEqual(self.expected('Gantt Free', WEEK), 168)
        self.assertEqual(self.entry('HRA Anita')['hag_fully_flexible'], False)
        self.assertEqual(self.entry('HRA Anita')['hag_tracked'], False)

    def test_a45_free_and_tracked(self):
        self.prepared['Gantt Free'].write({'attendance_based': True})
        entry = self.entry('Gantt Free')
        self.assertEqual((entry['hag_fully_flexible'], entry['hag_tracked']), (True, True))
        self.assertEqual(entry['max_value'], 24)

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
