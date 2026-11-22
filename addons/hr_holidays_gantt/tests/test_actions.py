# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.addons.hr_holidays_gantt.hooks import restore_time_off_records
from odoo.fields import Domain
from odoo.tests.common import TransactionCase


class TestActions(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.dashboard = cls.env.ref('hr_holidays.action_hr_holidays_dashboard')
        cls.management = cls.env.ref('hr_holidays.hr_leave_action_action_approve_department')
        cls.overview = cls.env.ref('hr_holidays_gantt.action_hr_holidays_overview')
        cls.leave_view = cls.env.ref('hr_holidays_gantt.hr_leave_gantt_view')

    def _user(self, login, group):
        group_ids = [self.env.ref(xmlid).id for xmlid in ('base.group_user', group)]
        values = {
            'name': f'Overview {login}',
            'login': f'hhg_{login}',
            'email': f'hhg_{login}@example.com',
            'group_ids': [(6, 0, group_ids)],
        }
        return self.env['res.users'].create(values)

    def _run(self, user):
        return self.overview.with_user(user).run()

    def test_a02_records(self):
        menu = self.env.ref('hr_holidays.menu_hr_holidays_dashboard')
        self.assertEqual(menu.action, self.overview)
        self.assertEqual(self.dashboard.view_mode, 'gantt,calendar')
        self.assertEqual([mode for _id, mode in self.dashboard.views], ['gantt', 'calendar'])
        self.assertEqual(
            self.management.view_mode, 'list,kanban,form,calendar,activity,gantt')
        self.assertEqual(
            [mode for _id, mode in self.management.views],
            ['list', 'kanban', 'form', 'calendar', 'activity', 'gantt'],
        )
        self.assertEqual(self.management.views[-1][0], self.leave_view.id)
        self.assertEqual(self.overview.model_id.model, 'hr.leave')
        self.assertEqual(self.overview.state, 'code')

    def test_a03_uninstall_restores(self):
        restore_time_off_records(self.env)
        menu = self.env.ref('hr_holidays.menu_hr_holidays_dashboard')
        self.assertEqual(menu.action, self.dashboard)
        self.assertEqual(self.dashboard.view_mode, 'calendar')
        self.assertEqual(self.management.view_mode, 'list,kanban,form,calendar,activity')
        module = self.env['ir.module.module'].search([('name', '=', 'hr_gantt')])
        self.assertIn(
            'hr_holidays_gantt', module.downstream_dependencies().mapped('name'))

    def _check_officer_action(self, action):
        self.assertEqual(
            {key: action.get(key) for key in ('id', 'path', 'res_model', 'view_mode')},
            {
                'id': self.management.id,
                'path': self.management.path,
                'res_model': 'hr.leave',
                'view_mode': 'gantt',
            },
        )
        self.assertEqual(
            [tuple(view) for view in action['views']], [(self.leave_view.id, 'gantt')])
        self.assertEqual(action['name'], self.dashboard.read(['name'])[0]['name'])
        expected = Domain.AND([
            Domain('employee_id.company_id', 'in', self.env.companies.ids),
            Domain('employee_id.active', '=', True),
            Domain('state', 'not in', ['refuse', 'cancel']),
        ])
        self.assertEqual(Domain(action['domain']).optimize(self.env['hr.leave']),
                         expected.optimize(self.env['hr.leave']))
        self.assertEqual(action['context'], {'hide_employee_name': 1})

    def test_a07_server_action_by_role(self):
        officer = self._user('officer', 'hr_holidays.group_hr_holidays_user')
        self._check_officer_action(self._run(officer))
        manager = self._user('manager', 'hr_holidays.group_hr_holidays_manager')
        self._check_officer_action(self._run(manager))
        employee = self._user('employee', 'hr_holidays.group_hr_holidays_employee')
        self.assertEqual(self._run(employee)['id'], self.dashboard.id)

    def test_a07_without_gantt_view_everyone_gets_the_dashboard(self):
        officer = self._user('officer2', 'hr_holidays.group_hr_holidays_user')
        self.management.view_ids.filtered(lambda view: view.view_mode == 'gantt').unlink()
        self.management.view_mode = 'list,kanban,form,calendar,activity'
        self.assertEqual(self._run(officer)['id'], self.dashboard.id)
