# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Backend scenarios of the check-out default of the creation dialog (002d3 R15; A43, A44) and
that no record opened from the view carries it. The forms are the Community creation form the
Gantt dialog uses, driven with the context the dialog passes (``scale``, ``default_check_in``,
``default_employee_id``), so the initial change call of a new record is the one under test."""
from datetime import datetime, timedelta

from odoo import fields
from odoo.tests import Form, tagged
from odoo.tests.common import TransactionCase

from .actions_fixtures import make_role_users
from .hr_rows_fixtures import make_whole_day_schedule

CREATE_FORM = 'hr_attendance.hr_attendance_create_view_form'
NINE = datetime(2026, 11, 11, 9, 0)


@tagged('post_install', '-at_install')
class TestCheckoutDefault(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.Attendance = cls.env['hr.attendance']
        cls.schedule = make_whole_day_schedule(cls.env, 'HRK 40 hours/week')
        cls.employee = cls._employee('HRK Eight', cls.schedule)

    @classmethod
    def _employee(cls, name, schedule, date_version='2026-01-01'):
        staff = cls.env['hr.employee']
        return staff.create({
            'name': name, 'tz': 'Europe/Brussels', 'resource_calendar_id': schedule.id,
            'contract_date_start': date_version, 'date_version': date_version})

    @classmethod
    def _calendar(cls, name, **values):
        return cls.env['resource.calendar'].create({'name': name, **values})

    def form(self, scale, employee, check_in=NINE, user=None):
        """The creation form as the dialog opens it: the context of the Gantt's creation."""
        context = {'default_check_in': check_in and check_in.strftime('%Y-%m-%d %H:%M:%S')}
        if employee:
            context['default_employee_id'] = employee.id
        if scale:
            context['scale'] = scale
        model = self.Attendance.with_user(user) if user else self.Attendance
        return Form(model.with_context(**context), view=CREATE_FORM)

    def test_a43_checkout_default(self):
        # the demo schedule: 8 hours a day, on the week, month and year scales
        for scale in ('week', 'month', 'year'):
            with self.subTest(scale=scale):
                form = self.form(scale, self.employee)
                self.assertEqual(form.check_in, NINE)
                self.assertEqual(form.check_out, NINE + timedelta(hours=8))
        # no check-out default on the day scale, with no scale, or with a scale of no list
        for scale in ('day', None, 'quarter'):
            with self.subTest(scale=scale):
                self.assertFalse(self.form(scale, self.employee).check_out)
        # "20 hours/week", five days: 4 hours a day
        twenty = self._calendar('HRK 20 hours/week', full_time_required_hours=40, attendance_ids=[
            (0, 0, {'dayofweek': str(day), 'hour_from': 8, 'hour_to': 12}) for day in range(5)])
        self.assertEqual(twenty.hours_per_day, 4)
        toni = self._employee('HRK Toni', twenty)
        self.assertEqual(self.form('week', toni).check_out, NINE + timedelta(hours=4))
        # 7.6 hours a day gives 7 h 36 min, exactly
        odd = self._employee('HRK Odd', self._calendar(
            'HRK 7.6', hours_per_week=38, hours_per_day=7.6, calendar_type='undefined'))
        self.assertEqual(odd.resource_calendar_id.hours_per_day, 7.6)
        self.assertEqual(self.form('month', odd).check_out, NINE + timedelta(hours=7, minutes=36))
        # a fully flexible schedule, 0 hours a day (E7): check-out equals check-in
        flexible = self._employee('HRK Flexible', self._calendar(
            'HRK flexible', hours_per_week=0, hours_per_day=0, calendar_type='undefined'))
        self.assertEqual(self.form('week', flexible).check_out, NINE)
        # no employee in the dialog (E6): check-out equals check-in
        form = self.form('week', None)
        form.employee_id = self.Attendance.env['hr.employee']
        form.check_in = NINE
        self.assertEqual(form.check_out, NINE)

    def test_a43_follows_check_in_and_keeps_when_emptied(self):
        form = self.form('week', self.employee)
        later = datetime(2026, 11, 12, 9, 0)
        form.check_in = later
        self.assertEqual(form.check_out, later + timedelta(hours=8))
        # emptied: the check-out keeps its value
        form.check_in = False
        self.assertEqual(form.check_out, later + timedelta(hours=8))
        # on the day scale the check-out stays where the cell put it
        day = self.form('day', self.employee)
        day.check_out = NINE + timedelta(hours=1)
        day.check_in = NINE - timedelta(hours=1)
        self.assertEqual(day.check_out, NINE + timedelta(hours=1))
        # a change of employee alone leaves it (E6)
        form = self.form('week', None)
        form.check_in = NINE
        form.employee_id = self.employee
        self.assertEqual(form.check_out, NINE)

    def test_a43_without_the_right_to_read_versions(self):
        users = make_role_users(self.env, schedule=self.schedule)
        team = users['gantt_team']
        peer = self.env['hr.employee'].search([('name', '=', 'Gantt Role Peer')])
        self.assertFalse(
            self.env['hr.version'].with_user(team).has_access('read'),
            'the Team user cannot read versions: the premise of the scenario')
        form = self.form('week', peer, user=team)
        self.assertEqual(form.check_out, NINE + timedelta(hours=8))

    def test_a44_version_date_utc(self):
        """A version that starts on 11 November (8 hours a day before, 6 from then on): a check-in
        at 11 November 0:00 in Brussels (10 November 23:00 UTC) reads the version of 10 November,
        one at 0:00 in New York (05:00 UTC) the version of 11 November."""
        six = self._calendar('HRK 6', hours_per_week=30, hours_per_day=6, calendar_type='undefined')
        employee = self._employee('HRK Changes', self.schedule)
        employee.create_version({'date_version': '2026-11-11', 'resource_calendar_id': six.id})
        brussels = datetime(2026, 11, 10, 23, 0)
        new_york = datetime(2026, 11, 11, 5, 0)
        self.assertEqual(
            self.form('week', employee, brussels).check_out, brussels + timedelta(hours=8))
        self.assertEqual(
            self.form('week', employee, new_york).check_out, new_york + timedelta(hours=6))

    def test_r15_not_on_existing_record_opened(self):
        """A record opened from the view (R9), or any form opened elsewhere, carries no ``scale``:
        changing its check-in leaves its check-out; with the key, the default would apply."""
        record = self.Attendance.with_context(skip_time_rules=True).create({
            'employee_id': self.employee.id, 'check_in': NINE,
            'check_out': NINE + timedelta(hours=2)})
        form = Form(record, view=CREATE_FORM)
        form.check_in = NINE - timedelta(hours=1)
        self.assertEqual(
            fields.Datetime.to_datetime(form.check_out), NINE + timedelta(hours=2))
        # a new record without the key: the Community's defaults only
        plain = Form(self.Attendance.with_context(default_employee_id=self.employee.id),
                     view=CREATE_FORM)
        plain.check_in = NINE
        self.assertFalse(plain.check_out)
