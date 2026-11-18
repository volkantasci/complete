# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from .hr_rows_fixtures import HrRowsCase, make_prepared, utc

DAY = (utc('2026-11-10 23:00'), utc('2026-11-11 23:00'))  # Wednesday 11 November, Brussels
WEEK = (utc('2026-11-07 23:00'), utc('2026-11-14 23:00'))  # Sunday 8 to Saturday 14


@tagged('post_install', '-at_install')
class TestUnavailability(HrRowsCase, TransactionCase):
    """R15 unavailable periods of the employee rows (A34, A35, A36, A62 server part)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.make_world()

    def unavailable(self, name, period=DAY, tz='Europe/Brussels', employees=None):
        """The unavailable intervals of one employee, as (start, stop) texts 'DD HH:MM'."""
        employee = (employees or {}).get(name) or self.prepared.get(name) or self.like[name]
        model = self.Attendance.with_context(tz=tz)
        found = model._gantt_unavailability('employee_id', [employee.id], *period, 'day')
        return [
            (i['start'].strftime('%d %H:%M'), i['stop'].strftime('%d %H:%M'))
            for i in found[employee.id]
        ]

    def test_a34_no_contract_whole_period(self):
        self.assertEqual(self.unavailable('HRA Beth'), [('10 23:00', '11 23:00')])
        self.assertEqual(self.unavailable('HRA Beth', WEEK), [('07 23:00', '14 23:00')])

    def test_a34_whole_day_schedule_working_day_none(self):
        self.assertEqual(self.unavailable('HRA Abigail'), [])

    def test_a34_hourly_schedule(self):
        self.assertEqual(
            self.unavailable('Gantt Hourly'),
            [('10 23:00', '11 07:00'), ('11 11:00', '11 12:00'), ('11 16:00', '11 23:00')],
        )

    def test_a34_flexible_none(self):
        self.assertEqual(self.unavailable('Gantt Flexible'), [])
        self.assertEqual(self.unavailable('Gantt Free'), [])
        self.assertEqual(self.unavailable('Gantt Flexible', WEEK), [])

    def test_a34_contract_end_week(self):
        found = self.unavailable('HRA Keith', WEEK)
        self.assertEqual(found, [('07 23:00', '08 23:00'), ('11 23:00', '14 23:00')])

    def test_a35_user_tz_new_york(self):
        self.assertEqual(
            self.unavailable('Gantt Hourly', tz='America/New_York'),
            [('10 23:00', '11 13:00'), ('11 17:00', '11 18:00'), ('11 22:00', '11 23:00')],
        )

    def test_a35_user_tz_istanbul(self):
        self.assertEqual(
            self.unavailable('Gantt Hourly', tz='Europe/Istanbul'),
            [('10 23:00', '11 05:00'), ('11 09:00', '11 10:00'), ('11 14:00', '11 23:00')],
        )

    def test_a35_period_in_a_browser_west_of_utc(self):
        # the browser's day of New York: 11 November 05:00 UTC to 12 November 05:00 UTC
        period = (utc('2026-11-11 05:00'), utc('2026-11-12 05:00'))
        self.assertEqual(
            self.unavailable('Gantt Hourly', period),
            [('11 05:00', '11 07:00'), ('11 11:00', '11 12:00'), ('11 16:00', '12 05:00')],
        )

    def test_a36_employee_tz_kolkata_unchanged(self):
        employee = self.prepared['Gantt Hourly']
        before = self.unavailable('Gantt Hourly')
        employee.write({'tz': 'Asia/Kolkata'})
        self.env.flush_all()
        self.assertEqual(employee.tz, 'Asia/Kolkata')
        self.assertEqual(self.unavailable('Gantt Hourly'), before)

    def test_a62_public_holiday(self):
        made = make_prepared(self.env, holiday=True, demo_schedule=self.schedule)
        self.assertIn('Gantt Holiday', made)
        holiday = self.env['resource.calendar.leaves'].search([('name', '=', 'Gantt Holiday')])
        self.assertFalse(holiday.resource_id)
        self.assertEqual(
            self.unavailable('HRA Abigail', WEEK),
            [('07 23:00', '08 23:00'), ('11 23:00', '12 23:00'), ('13 23:00', '14 23:00')],
        )

    def test_a62_holiday_greys_flexible_too(self):
        made = make_prepared(self.env, holiday=True, demo_schedule=self.schedule)
        # a flexible schedule with a leave of its own: unavailable on the holiday only
        flex = self.env['resource.calendar'].search([('name', '=', 'Gantt Flex')])
        self.env['resource.calendar.leaves'].create({
            'name': 'Gantt Holiday', 'calendar_id': flex.id,
            'date_from': utc('2026-11-11 23:00'), 'date_to': utc('2026-11-12 23:00'),
        })
        made['Gantt Flexible'].write({'resource_calendar_id': flex.id})
        self.env.flush_all()
        self.assertEqual(
            self.unavailable('Gantt Flexible', WEEK, employees=made),
            [('11 23:00', '12 23:00')],
        )

    def test_r15_holiday_on_the_hourly_schedule_greys_the_day(self):
        made = make_prepared(self.env, holiday=True, demo_schedule=self.schedule)
        hourly = made['Gantt Hourly'].resource_calendar_id
        self.env['resource.calendar.leaves'].create({
            'name': 'Gantt Holiday', 'calendar_id': hourly.id,
            'date_from': utc('2026-11-11 23:00'), 'date_to': utc('2026-11-12 23:00'),
        })
        thursday = (utc('2026-11-11 23:00'), utc('2026-11-12 23:00'))
        self.assertEqual(
            self.unavailable('Gantt Hourly', thursday, employees=made),
            [('11 23:00', '12 23:00')],
        )
        # the day before is unchanged
        self.assertEqual(len(self.unavailable('Gantt Hourly', employees=made)), 3)

    def test_r15_other_field_base(self):
        found = self.Attendance._gantt_unavailability(
            'create_uid', [self.env.uid], *DAY, 'day')
        self.assertEqual(found, {})
