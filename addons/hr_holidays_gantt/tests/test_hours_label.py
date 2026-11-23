# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import UTC, date, datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

from freezegun import freeze_time
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from . import time_off_fixtures as fx

# the browser's clock of the scenarios: Wednesday 11 November 2026, 11:00 in Brussels
CLOCK = '2026-11-11 10:00:00'


def month_in(zone):
    """The bounds of November 2026 as the browser of ``zone`` sends them (naive UTC text)."""
    place = ZoneInfo(zone)
    return tuple(
        datetime(2026, month, 1, tzinfo=place).astimezone(UTC).strftime('%Y-%m-%d %H:%M:%S')
        for month in (11, 12))


@tagged('post_install', '-at_install')
class TestHoursLabel(fx.TimeOffGanttMixin, TransactionCase):
    """R16: the value of the hours label, in the data call of the leave view."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.users = fx.make_role_users(cls.env)
        cls.admin = fx.find_admin(cls.env)
        cls.made = fx.make_flexible(cls.env)
        cls.states = fx.make_states(cls.env)
        cls.tokyo = fx.make_tokyo(cls.env)
        cls.world = fx.make_demo_like(cls.env)
        cls.peer = cls.env['hr.employee'].search([('name', '=', fx.PEER_NAME)])

    def labels(self, employees, period=fx.MONTH, scale='month', user=None, tz=fx.TZ):
        """The values of ``employees`` as the leave view's hook gives them, by name."""
        env = self.env(user=user or self.admin)
        with freeze_time(CLOCK):
            found = env['hr.leave'].with_context(tz=tz)._gantt_progress_bar(
                'employee_id', employees.ids, *period)
        return {
            employee.name: found[employee.id]['value']
            for employee in employees if employee.id in found}

    def test_a33_label_values(self):
        pair = self.made['Toff Flexible'] | self.made['Toff Fixed']
        self.assertEqual(
            self.labels(pair, fx.WEEK, 'week'), {'Toff Flexible': 16, 'Toff Fixed': 24})
        # the same through the data call of the view, with a request To Approve added
        waiting = fx.make_leave(
            self.env, self.made['Toff Fixed'], fx.find_type(self.env, 'STO'), date(2026, 11, 19))
        waiting.with_user(self.admin).action_back_to_approval()
        self.assertEqual(waiting.state, 'confirm')
        with freeze_time(CLOCK):
            result = self.call_gantt(
                user=self.admin, period=fx.WEEK, scale='week',
                user_domain=[('employee_id.name', 'in', pair.mapped('name'))],
                progress_bar_fields=['employee_id'])
        bars = result['progress_bars']['employee_id']
        self.assertEqual(
            {employee.name: bars[employee.id] for employee in pair},
            {'Toff Flexible': {'value': 16}, 'Toff Fixed': {'value': 24}})

    def test_a41_label_three_zones(self):
        for zone in ('Europe/Brussels', 'America/New_York', 'Asia/Kolkata'):
            with self.subTest(zone=zone):
                self.assertEqual(
                    self.labels(self.tokyo, month_in(zone), tz=zone), {'Toff Tokyo': 168}, zone)

    def test_a42_internal_only(self):
        portal = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'Toff Portal', 'login': 'toff_portal', 'tz': fx.TZ,
            'group_ids': [(6, 0, self.env.ref('base.group_portal').ids)],
        })
        pair = self.made['Toff Flexible'] | self.made['Toff Fixed']
        with freeze_time(CLOCK):
            self.assertEqual(
                self.env['hr.leave'].with_user(portal)._gantt_progress_bar(
                    'employee_id', pair.ids, *fx.WEEK), {})
        officer = self.labels(pair, fx.WEEK, 'week', user=self.users['toff_officer'])
        self.assertEqual(officer, {'Toff Flexible': 16, 'Toff Fixed': 24})
        # another field than the employee gets the base answer
        self.assertEqual(
            self.env['hr.leave']._gantt_progress_bar('department_id', [], *fx.WEEK), {})

    def test_a86_tz_fallback_and_current_schedule(self):
        self.admin.tz = fx.TZ
        some = self.world['Anita Oliver'] | self.world['Mitchell Admin'] | self.peer
        with freeze_time(CLOCK):
            bare = self.env(user=self.admin)['hr.leave']._gantt_progress_bar(
                'employee_id', some.ids, *fx.MONTH)
        self.assertEqual(
            {employee.name: bare[employee.id]['value'] for employee in some}, self.labels(some))
        flexible = self.made['Toff Flexible']
        flexible.create_version({
            'date_version': '2026-11-20', 'resource_calendar_id': fx.find_schedule(self.env).id})
        # the day is the browser's: the server's clock stands on a later day (the version of the
        # 20th is the schedule in effect there), and the context says the browser's day is the 11th
        def week_label(**context):
            with freeze_time('2026-11-22 10:00:00'):
                found = self.env(user=self.admin)['hr.leave'].with_context(
                    tz=fx.TZ, **context)._gantt_progress_bar('employee_id', flexible.ids, *fx.WEEK)
            return found[flexible.id]['value']

        self.assertEqual(week_label(hhg_today='2026-11-11'), 16)
        # without the key the day is the server's, read in the context's zone
        self.assertNotEqual(week_label(), 16)

    def test_employee_without_a_version_reads_his_resource_schedule(self):
        """The flexible-today guard of an employee that has no version falls back to the resource's
        schedule, and gives a label instead of an error."""
        anita = self.world['Anita Oliver']
        expected = self.labels(anita)
        employee_model = type(self.env['hr.employee'])
        with patch.object(employee_model, '_get_version',
                          lambda self, *args, **kwargs: self.env['hr.version']):
            self.assertEqual(self.labels(anita), expected)

    def test_hours_of_the_demo_like_employees(self):
        employees = self.world['Anita Oliver'] | self.peer
        self.assertEqual(self.labels(employees), {'Anita Oliver': 80, fx.PEER_NAME: 168})
        self.assertEqual(self.labels(self.peer, fx.QUARTER, 'quarter'), {fx.PEER_NAME: 528})
        self.assertEqual(
            self.labels(self.world['Mitchell Admin'], fx.WEEK, 'week'), {'Mitchell Admin': 16})

    def test_hours_without_a_contract_count_the_schedule(self):
        """R16: the days out of contract, or an employee with no contract, count as well."""
        schedule = fx.find_schedule(self.env)
        ended = fx._employee(
            self.env, 'Toff Ended', schedule, contract_date_end=date(2026, 11, 11))
        bare = fx._employee(self.env, 'Toff Bare', schedule, contract_date_start=False)
        self.assertEqual(
            self.labels(ended | bare), {'Toff Ended': 168, 'Toff Bare': 168})
