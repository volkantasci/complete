# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.exceptions import AccessError
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from . import time_off_fixtures as fx

RESPONSIBLE = 'hr_holidays.group_hr_holidays_responsible'


@tagged('post_install', '-at_install')
class TestRoles(TransactionCase):
    """What each role may read on the server (R20); the screens are in ``test_report_tours``."""

    def _user(self, login, extra=None):
        groups = self.env.ref('base.group_user') | self.env.ref(
            'hr_holidays.group_hr_holidays_employee')
        if extra:
            groups |= extra
        return self.env['res.users'].with_context(no_reset_password=True).create({
            'name': login, 'login': login, 'password': login, 'group_ids': [(6, 0, groups.ids)],
        })

    def _employee(self, name, **values):
        return self.env['hr.employee'].create({'name': name, **values})

    def test_a60_responsible_group_alone(self):
        """The group "Time Off Responsible" cannot be held alone: set explicitly on a user who
        approves nobody it goes, naming the user approver gives it back, naming the user manager
        gives it too unless the approver is cleared."""
        responsible = self.env.ref(RESPONSIBLE)
        user = self._user('toff_a60_alone', extra=responsible)
        self.assertFalse(user.has_group(RESPONSIBLE), 'a user who approves nobody does not hold it')
        # approver: the group comes back
        employee = self._employee('Toff A60 One')
        employee.leave_manager_id = user
        self.assertTrue(user.has_group(RESPONSIBLE), 'naming the approver gives it back')
        employee.leave_manager_id = False
        self.assertFalse(user.has_group(RESPONSIBLE), 'and clearing the approver takes it away')
        # manager: the approver defaults to the manager, who gets the group...
        boss = self._user('toff_a60_boss')
        boss_employee = self._employee('Toff A60 Boss', user_id=boss.id)
        self._employee('Toff A60 Two', parent_id=boss_employee.id)
        self.assertTrue(boss.has_group(RESPONSIBLE), 'naming a manager names the approver too')
        # ... unless the approver is cleared
        chief = self._user('toff_a60_chief')
        chief_employee = self._employee('Toff A60 Chief', user_id=chief.id)
        staff = self._employee('Toff A60 Three', parent_id=chief_employee.id)
        staff.leave_manager_id = False
        self.assertFalse(chief.has_group(RESPONSIBLE), 'a manager whose approver is cleared')
        # a manager named with the approver cleared from the start
        lead = self._user('toff_a60_lead')
        lead_employee = self._employee('Toff A60 Lead', user_id=lead.id)
        self._employee('Toff A60 Four', parent_id=lead_employee.id, leave_manager_id=False)
        self.assertFalse(lead.has_group(RESPONSIBLE))

    def test_a56_a63_report_read_rights(self):
        """Every role but No role reads the report and the public employees (R13 point 5, R20)."""
        users = fx.make_role_users(self.env)
        Report = self.env['hr.leave.report.calendar']
        with self.assertRaises(AccessError):
            Report.with_user(users['toff_none']).check_access('read')
        for login, user in users.items():
            if login == 'toff_none':
                continue
            Report.with_user(user).check_access('read')
            self.env['hr.employee.public'].with_user(user).check_access('read')
        # every internal user may run the Overview's server action: it answers the report for
        # a user with no Time Off group too, whose access error is the report's (E1)
        server_action = self.env.ref('hr_holidays_gantt.action_hr_holidays_overview')
        for login, user in users.items():
            action = server_action.with_user(user).with_context(active_model='hr.leave').run()
            leave_view = login in ('toff_officer', 'toff_admin')
            expected = 'hr.leave' if leave_view else 'hr.leave.report.calendar'
            self.assertEqual(action['res_model'], expected, login)
