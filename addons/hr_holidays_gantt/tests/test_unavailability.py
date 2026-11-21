# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from . import time_off_fixtures as fx

BRUSSELS = ZoneInfo(fx.TZ)
# Sunday 15 to Saturday 21 November, with the Sunday after: the period of A32 and A76 (Brussels)
WEEK_PLUS = (fx.utc('2026-11-14 23:00'), fx.utc('2026-11-22 23:00'))


def local(moment, zone=BRUSSELS):
    """A naive UTC datetime as a naive datetime of ``zone``."""
    return moment.replace(tzinfo=UTC).astimezone(zone).replace(tzinfo=None)


def day_at(day, hour, minute=0, second=0, micro=0):
    return datetime(2026, 11, day, hour, minute, second, micro)


def covered(found, begin, end):
    """Whether the intervals (naive UTC) hold the whole span ``begin``-``end`` (Brussels)."""
    cursor = begin
    for interval in sorted(found, key=lambda item: item['start']):
        start, stop = local(interval['start']), local(interval['stop'])
        if start <= cursor < stop:
            cursor = stop
    return cursor >= end


def touches(found, begin, end):
    """Whether any interval (naive UTC) overlaps the span ``begin``-``end`` (Brussels)."""
    return any(
        local(item['start']) < end and local(item['stop']) > begin for item in found)


@tagged('post_install', '-at_install')
class TestUnavailability(TransactionCase):
    """R14, R15: unavailable periods of the time-off views, flexible schedules' leave intervals."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.users = fx.make_role_users(cls.env)
        cls.admin = fx.find_admin(cls.env)
        cls.made = fx.make_flexible(cls.env)
        cls.states = fx.make_states(cls.env)
        cls.tokyo = fx.make_tokyo(cls.env)

    def unavailable(self, employee, period=WEEK_PLUS, tz=fx.TZ, model='hr.leave', user=None):
        """The unavailable intervals of one employee, as the hook of ``model`` returns them."""
        env = self.env(user=user) if user else self.env
        found = env[model].with_context(tz=tz)._gantt_unavailability(
            'employee_id', [employee.id], *period, 'week')
        return found[employee.id]

    def local_pairs(self, found):
        return [(local(item['start']), local(item['stop'])) for item in found]

    def test_a32_flexible_intervals(self):
        flexible = self.made['Toff Flexible']
        found = self.local_pairs(self.unavailable(flexible))
        self.assertEqual(found, [
            (day_at(16, 0), day_at(16, 23, 59, 59, 999999)),
            (day_at(17, 0), day_at(17, 11, 59, 59, 999999)),
            (day_at(18, 9), day_at(18, 12, 59, 59, 999999)),
        ])
        # a fourth request on Thursday 19: eight hours (the schedule's day), four from 13:00
        # (an afternoon), four ending at noon (a morning)
        for name, hours, expected in (
            ('Whole', (9, 17), (day_at(19, 0), day_at(19, 23, 59, 59, 999999))),
            ('Later', (13, 17), (day_at(19, 12), day_at(19, 23, 59, 59, 999999))),
            ('Early', (8, 12), (day_at(19, 0), day_at(19, 11, 59, 59, 999999))),
        ):
            employee = fx._employee(self.env, f'Toff Flexible {name}', self.made['Toff Flex'])
            fx.make_leave(
                self.env, employee, self.made[fx.HOURS_TYPE], date(2026, 11, 19),
                duration='specific', hours=hours)
            self.assertEqual(self.local_pairs(self.unavailable(employee)), [expected], name)

    def test_a32_fixed_schedule_unchanged(self):
        # a fixed schedule keeps the Community's work intervals less the leave (M50)
        fixed = self.made['Toff Fixed']
        found = self.unavailable(fixed)
        self.assertTrue(covered(found, day_at(16, 8), day_at(16, 16)))
        self.assertFalse(touches(found, day_at(19, 9), day_at(19, 11)))

    def test_a76_states_unavailable(self):
        found = self.unavailable(self.states)
        # only the Approved day is a leave day: working hours of the others stay available
        self.assertTrue(covered(found, day_at(18, 0), day_at(19, 0)))
        for day in (16, 17, 19):
            self.assertFalse(touches(found, day_at(day, 9), day_at(day, 11)), day)
            self.assertFalse(touches(found, day_at(day, 14), day_at(day, 15)), day)

    def test_a41_intervals_three_zones(self):
        expected = {
            'Europe/Brussels': ('2026-11-02 07:00', '2026-11-30 16:00'),
            'America/New_York': ('2026-11-02 13:00', '2026-11-30 22:00'),
            'Asia/Kolkata': ('2026-11-02 02:30', '2026-11-30 11:30'),
        }
        for zone_name, (first_end, last_start) in expected.items():
            zone = ZoneInfo(zone_name)
            bounds = tuple(
                datetime(2026, month, 1).replace(tzinfo=zone).astimezone(UTC).replace(tzinfo=None)
                for month in (11, 12))
            found = self.unavailable(self.tokyo, period=bounds, tz=zone_name)
            self.assertEqual(found[0]['start'], bounds[0], zone_name)
            self.assertEqual(found[0]['stop'], fx.utc(first_end), zone_name)
            self.assertEqual(found[-1]['start'], fx.utc(last_start), zone_name)
            self.assertEqual(found[-1]['stop'], bounds[1], zone_name)

    def test_without_browser_zone_the_user_zone_stands_in(self):
        user = self.users['toff_officer']
        user.tz = 'America/New_York'
        employee = self.tokyo
        model = self.env['hr.leave'].with_user(user)
        found = model._gantt_unavailability(
            'employee_id', [employee.id], fx.utc('2026-10-31 23:00'),
            fx.utc('2026-11-30 23:00'), 'month')[employee.id]
        self.assertEqual(found[0]['stop'], fx.utc('2026-11-02 13:00'))

    def test_other_fields_keep_the_base_answer(self):
        found = self.env['hr.leave']._gantt_unavailability(
            'work_entry_type_id', [], *WEEK_PLUS, 'week')
        self.assertEqual(found, {})

    def test_report_model_gives_the_same_intervals(self):
        flexible = self.made['Toff Flexible']
        self.assertEqual(
            self.unavailable(flexible, model='hr.leave.report.calendar'),
            self.unavailable(flexible))

    def test_value_without_contract_rights(self):
        user = self.users['toff_emp']
        self.assertFalse(user.has_group('hr.group_hr_user'))
        flexible = self.made['Toff Flexible']
        self.assertEqual(
            self.unavailable(flexible, user=user), self.unavailable(flexible))
        self.assertEqual(
            self.unavailable(self.tokyo, user=user, tz='Asia/Kolkata'),
            self.unavailable(self.tokyo, tz='Asia/Kolkata'))
