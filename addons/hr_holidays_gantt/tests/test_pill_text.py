# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from lxml import etree
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from . import time_off_fixtures as fx


@tagged('post_install', '-at_install')
class TestPillText(fx.TimeOffGanttMixin, TransactionCase):
    """R10 and decision D1: the pill's text follows the scale of the call; R11 colours."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.users = fx.make_role_users(cls.env)
        cls.admin = fx.find_admin(cls.env)
        cls.world = fx.make_demo_like(cls.env)
        cls.flexible = fx.make_flexible(cls.env)
        cls.anita = [('employee_id.name', '=', 'Anita Oliver')]
        cls.fixed = [('employee_id.name', '=', 'Toff Fixed')]

    def read(self, user_domain, model='hr.leave', user=None, **kwargs):
        result = self.call_gantt(model, user=user, user_domain=user_domain, **kwargs)
        return result, self.texts(result)

    def test_a74_pill_text(self):
        # the administrator: Anita Oliver has four days, one day and six days in November
        _result, month = self.read(self.anita, user=self.admin)
        self.assertEqual(month, ['1d', 'PTO 4 days', 'PTO 6 days'])
        _result, quarter = self.read(
            self.anita, user=self.admin, period=fx.QUARTER, scale='quarter')
        self.assertEqual(quarter, ['1d', 'PTO 4 days', 'PTO 6 days'])
        _result, week = self.read(
            self.anita, user=self.admin, period=fx.WEEK, scale='week')
        self.assertEqual(week, ['PTO 1d'])
        # four hours of an hour type
        _result, week = self.read(
            self.fixed, user=self.admin, period=fx.WEEK, scale='week')
        self.assertIn('TH 04:00', week)
        _result, month = self.read(self.fixed, user=self.admin)
        self.assertIn('04:00', month)
        self.assertNotIn('TH 04:00', month)

    def test_a74_report_texts_of_an_employee(self):
        user = self.users['toff_emp']
        _result, month = self.read(self.anita, 'hr.leave.report.calendar', user=user)
        self.assertEqual(month, ['1d', '4 days', '6 days'])
        _result, week = self.read(
            self.anita, 'hr.leave.report.calendar', user=user, period=fx.WEEK, scale='week')
        self.assertEqual(week, ['1 day'])

    def test_a13_report_texts_by_role(self):
        _result, officer = self.read(
            self.anita, 'hr.leave.report.calendar', user=self.admin)
        self.assertEqual(officer, ['1d', 'PTO 4 days', 'PTO 6 days'])
        _result, employee = self.read(
            self.anita, 'hr.leave.report.calendar', user=self.users['toff_emp'])
        self.assertEqual(employee, ['1d', '4 days', '6 days'])

    def test_a74_state_search_keeps_the_scale(self):
        # D1: a condition on the request takes the plain path; the scale is still sent
        approved = [('state', '=', 'validate')]
        for model in ('hr.leave', 'hr.leave.report.calendar'):
            with self.subTest(model=model):
                result = self.call_gantt(
                    model, user=self.admin, user_domain=approved, extra=self.anita)
                self.assertEqual(
                    self.texts(result), ['1d', 'PTO 4 days', 'PTO 6 days'])
        # the helper path with a condition on the request: the first group has records only
        result = self.call_gantt(
            user=self.admin, user_domain=approved, extra=self.anita, period=fx.WEEK, scale='week')
        self.assertEqual(self.texts(result), ['PTO 1d'])

    def test_a74_scale_is_in_the_context_of_the_read(self):
        # without the scale a one-day request would read with its type: the original's defect
        result = self.call_gantt(
            user=self.admin, user_domain=[('state', '=', 'validate')], extra=self.anita)
        self.assertIn('1d', self.texts(result))
        self.assertNotIn('PTO 1d', self.texts(result))

    def test_a75_colours(self):
        # the leave view's colour is the type's; the report's is the employee's
        result = self.call_gantt(
            user=self.admin, user_domain=self.anita, specification=fx.LEAVE_SPEC)
        self.assertTrue(result['records'])
        for record in result['records']:
            self.assertEqual(record['color'], 11)
        report = etree.fromstring(
            self.env.ref('hr_holidays_gantt.hhg_report_gantt_view').arch)
        self.assertEqual(report.get('color'), 'employee_id')
        data = self.call_gantt(
            'hr.leave.report.calendar', user=self.users['toff_emp'], user_domain=self.anita)
        employee_ids = {record['employee_id']['id'] for record in data['records']}
        self.assertEqual(
            employee_ids, {self.world['Anita Oliver'].id})
