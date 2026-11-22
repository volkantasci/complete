# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.exceptions import UserError
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from . import time_off_fixtures as fx


@tagged('post_install', '-at_install')
class TestRows(fx.TimeOffGanttMixin, TransactionCase):
    """R13 which employees get rows, in the request's and the report's data call."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.users = fx.make_role_users(cls.env)
        cls.admin = fx.find_admin(cls.env)
        cls.world = fx.make_demo_like(cls.env)
        cls.Employee = cls.env['hr.employee']

    def groups_with_records(self, result):
        return [bool(group['__record_ids']) for group in result['groups']]

    def test_a29_employee_search_rows(self):
        result = self.call_gantt(
            user=self.admin, user_domain=[('employee_id.name', '=', 'Marc Demo')])
        self.assertEqual(self.row_names(result), ['Marc Demo'])
        self.assertEqual(len(result['groups'][0]['__record_ids']), 2)
        # an employee without a leave still gets a group, with no record
        result = self.call_gantt(
            user=self.admin, user_domain=[('employee_id.name', '=', fx.PEER_NAME)])
        self.assertEqual(self.row_names(result), [fx.PEER_NAME])
        self.assertEqual(result['groups'][0]['__record_ids'], [])
        self.assertEqual(result['records'], [])

    def test_a30_report_job_position(self):
        job = self.env['hr.job'].create({'name': 'Toff Consultant'})
        schedule = fx.find_schedule(self.env)
        consultants = self.env['hr.employee']
        for number in range(7):
            consultants |= fx._employee(
                self.env, f'Toff Consultant {number}', schedule, job_id=job.id)
        result = self.call_gantt(
            'hr.leave.report.calendar', user=self.users['toff_emp'],
            user_domain=[('job_id', 'ilike', 'Toff Consultant')])
        self.assertEqual(len(result['groups']), 7)
        self.assertEqual(result['length'], 7)
        self.assertEqual(set(self.row_names(result)), set(consultants.mapped('name')))
        self.assertEqual(self.groups_with_records(result), [False] * 7)
        # the company is the employee's too
        result = self.call_gantt(
            'hr.leave.report.calendar', user=self.users['toff_emp'],
            user_domain=[('job_id', 'ilike', 'Toff Consultant'),
                         ('company_id', 'in', self.env.company.ids)])
        self.assertEqual(result['length'], 7)
        # a company the employees do not belong to: no row (a dropped condition would show 7)
        other = self.env['res.company'].create({'name': 'Toff Other Company'})
        result = self.call_gantt(
            'hr.leave.report.calendar', user=self.users['toff_emp'],
            user_domain=[('job_id', 'ilike', 'Toff Consultant'),
                         ('company_id', 'in', other.ids)])
        self.assertEqual(result['length'], 0)
        self.assertEqual(result['groups'], [])

    def test_a77_negated_search(self):
        mixed = ['!', '&', ('employee_id.name', 'ilike', 'Marc Demo'), ('state', '=', 'validate')]
        result = self.call_gantt(user=self.admin, user_domain=mixed)
        names = self.row_names(result)
        self.assertNotIn('Marc Demo', names)
        self.assertIn('Anita Oliver', names)
        self.assertTrue(all(self.groups_with_records(result)))
        self.assertNotIn(fx.PEER_NAME, names)
        # only about the employee: every employee but Marc has a row
        about_employee = ['!', ('employee_id.name', 'ilike', 'Marc Demo')]
        result = self.call_gantt(user=self.admin, user_domain=about_employee, limit=1000)
        names = self.row_names(result)
        self.assertNotIn('Marc Demo', names)
        self.assertIn(fx.PEER_NAME, names)
        expected = self.Employee.search_count([('name', 'not ilike', 'Marc Demo')])
        self.assertEqual(result['length'], expected)
        self.assertEqual(len(names), expected)
        paged = self.call_gantt(user=self.admin, user_domain=about_employee)
        self.assertEqual(len(paged['groups']), min(20, expected))
        self.assertEqual(paged['length'], expected)

    def test_a78_refusals(self):
        search = [('employee_id.name', '=', 'Anita Oliver')]
        result = self.call_gantt(
            user=self.admin, user_domain=search, groupby=('employee_id', 'work_entry_type_id'))
        self.assertTrue(result['groups'])
        self.assertTrue(all(self.groups_with_records(result)))
        # a search on an employee that has no request in the period gives no group at all
        result = self.call_gantt(
            user=self.admin, user_domain=[('employee_id.name', '=', fx.PEER_NAME)],
            groupby=('employee_id', 'work_entry_type_id'))
        self.assertEqual(result['groups'], [])
        for model in ('hr.leave', 'hr.leave.report.calendar'):
            for groupby in (('employee_id',), ('employee_id', 'work_entry_type_id')):
                with self.subTest(model=model, groupby=groupby), self.assertRaises(UserError):
                    self.call_gantt(
                        model, user=self.admin, groupby=groupby, start_date=False, stop_date=False)

    def test_a63_rows_every_role(self):
        for login in ('toff_emp', 'toff_approver', 'toff_manager', 'toff_officer', 'toff_admin'):
            user = self.users[login]
            with self.subTest(login=login):
                expected = self.env['hr.employee'].with_user(user).search_count([])
                result = self.call_gantt('hr.leave.report.calendar', user=user)
                self.assertEqual(result['length'], expected)
                self.assertEqual(len(result['groups']), min(20, expected))
                self.assertGreaterEqual(expected, len(fx.DEMO_LEAVES) + len(self.users) + 1)

    def test_a85_department(self):
        department = self.env['hr.department'].create({'name': 'Toff Department'})
        schedule = fx.find_schedule(self.env)
        with_leave = fx._employee(self.env, 'Toff Dept Busy', schedule, department_id=department.id)
        without = fx._employee(self.env, 'Toff Dept Free', schedule, department_id=department.id)
        user = self.users['toff_emp']
        user.employee_id.department_id = department
        fx.make_leave(self.env, with_leave, fx.find_type(self.env, 'STO'), fx.date(2026, 11, 12))
        self.env.flush_all()
        # the report's department is its own column: only employees with requests of it
        result = self.call_gantt(
            'hr.leave.report.calendar', user=user,
            user_domain=[('department_id', 'ilike', 'Toff Department')])
        self.assertEqual(self.row_names(result), ['Toff Dept Busy'])
        self.assertTrue(all(self.groups_with_records(result)))
        # the filter My Department goes through the employee: every employee of the department
        result = self.call_gantt(
            'hr.leave.report.calendar', user=user,
            user_domain=[('member_of_department', '=', True)])
        self.assertEqual(
            set(self.row_names(result)),
            {'Toff Dept Busy', 'Toff Dept Free', user.employee_id.name})
        self.assertIn(without.name, self.row_names(result))
        self.assertIn(False, self.groups_with_records(result))

    def test_a84_approver_rows(self):
        approver = self.users['toff_approver']
        peer = self.Employee.search([('name', '=', fx.PEER_NAME)])
        fx.make_leave(self.env, peer, fx.find_type(self.env, 'STO'), fx.date(2026, 11, 12))
        fx.make_leave(self.env, approver.employee_id, fx.find_type(self.env, 'STO'),
                      fx.date(2026, 11, 13))
        result = self.call_gantt(
            user=approver, extra=[('employee_id.company_id', 'in', self.env.companies.ids)])
        self.assertEqual(
            sorted(self.row_names(result)), sorted([fx.PEER_NAME, approver.employee_id.name]))
        self.assertEqual(result['length'], 2)
        self.assertTrue(all(self.groups_with_records(result)))

    def test_a83_report_empty_flag(self):
        """R7, R21: the report answers whether the user sees no report record at all."""
        self.env['hr.leave'].with_context(active_test=False).sudo().search([]).unlink()
        self.env.flush_all()
        user = self.users['toff_emp']
        result = self.call_gantt('hr.leave.report.calendar', user=user)
        self.assertIs(result['hhg_report_empty'], True)
        # the rows are still those of R13: an employee without a request is a row
        self.assertTrue(result['groups'])
        fx.make_leave(
            self.env, user.employee_id, fx.find_type(self.env, 'STO'), fx.date(2026, 12, 14))
        # one request, in a month the view does not show: the report is not empty
        result = self.call_gantt('hr.leave.report.calendar', user=user)
        self.assertIs(result['hhg_report_empty'], False)
        # the search and the period are ignored: a search that matches nothing changes nothing
        result = self.call_gantt(
            'hr.leave.report.calendar', user=user, user_domain=[('employee_id.name', '=', 'zzz')])
        self.assertIs(result['hhg_report_empty'], False)
