# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests import tagged
from odoo.tests.common import TransactionCase, new_test_user

from .hr_rows_fixtures import make_whole_day_schedule, utc

DAY_11 = (utc('2026-11-10 23:00'), utc('2026-11-11 23:00'))


@tagged('post_install', '-at_install')
class TestAccess(TransactionCase):
    """R22 access of the progress values (A46, the server part of A55 and A56)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        schedule = make_whole_day_schedule(cls.env, 'HRA Access 40 hours/week')
        cls.own_user = new_test_user(
            cls.env, login='hra_own_reader', groups='base.group_user', tz='Europe/Brussels')
        Employee = cls.env['hr.employee']
        cls.own = cls.own_user.employee_id or Employee.create(
            {'name': 'HRA Own', 'user_id': cls.own_user.id})
        # the versions are dated at the contract's start, never on the day the test runs
        cls.own.write({
            'resource_calendar_id': schedule.id, 'contract_date_start': '2026-01-01',
            'date_version': '2026-01-01'})
        cls.other = Employee.create({
            'name': 'HRA Other', 'tz': 'Europe/Brussels', 'resource_calendar_id': schedule.id,
            'contract_date_start': '2026-01-01', 'date_version': '2026-01-01'})
        Attendance = cls.env['hr.attendance'].with_context(skip_time_rules=True)
        for employee, hours in ((cls.own, 2), (cls.other, 4)):
            Attendance.create({
                'employee_id': employee.id, 'check_in': utc('2026-11-11 08:00'),
                'check_out': utc(f'2026-11-11 {8 + hours:02d}:00'),
            })
        cls.portal = new_test_user(cls.env, login='hra_portal', groups='base.group_portal')

    def progress(self, user, employees):
        model = self.env['hr.attendance'].with_user(user).with_context(tz='Europe/Brussels')
        return model._gantt_progress_bar('employee_id', employees.ids, *DAY_11)

    def test_a46_portal_gets_no_values(self):
        self.assertEqual(self.progress(self.portal, self.own | self.other), {})

    def test_r22_value_counts_only_readable(self):
        found = self.progress(self.own_user, self.own | self.other)
        self.assertEqual(found[self.own.id]['value'], 2)
        self.assertEqual(found[self.other.id]['value'], 0)

    def test_r22_max_computed_with_system_rights(self):
        found = self.progress(self.own_user, self.own | self.other)
        self.assertEqual(found[self.other.id]['max_value'], 8)
        self.assertEqual(found[self.own.id]['max_value'], 8)
        self.assertFalse(found[self.other.id]['hag_tracked'])
        self.assertFalse(found[self.other.id]['hag_fully_flexible'])

    def test_r22_user_sees_only_readable_records(self):
        # the records of the data call follow the read rules too
        user_model = self.env['hr.attendance'].with_user(self.own_user)
        self.assertEqual(user_model.search([('employee_id', '=', self.other.id)]).ids, [])
