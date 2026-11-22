# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from . import time_off_fixtures as fx


@tagged('post_install', '-at_install')
class TestFixtures(TransactionCase):
    """The shared builders: what they make, with and without demo data (A60)."""

    def test_a60_role_groups(self):
        users = fx.make_role_users(self.env)
        responsible = 'hr_holidays.group_hr_holidays_responsible'
        self.assertEqual(set(users), set(fx.ROLES))
        self.assertTrue(users['toff_approver'].has_group(responsible))
        self.assertFalse(users['toff_manager'].has_group(responsible))
        self.assertTrue(users['toff_none'].has_group('base.group_user'))
        self.assertFalse(users['toff_none'].has_group('hr_holidays.group_hr_holidays_employee'))
        self.assertTrue(users['toff_emp'].has_group('hr_holidays.group_hr_holidays_employee'))
        self.assertFalse(users['toff_emp'].has_group('hr_holidays.group_hr_holidays_user'))
        self.assertTrue(users['toff_officer'].has_group('hr_holidays.group_hr_holidays_user'))
        self.assertFalse(users['toff_officer'].has_group('hr_holidays.group_hr_holidays_manager'))
        self.assertTrue(users['toff_admin'].has_group('hr_holidays.group_hr_holidays_manager'))
        export = 'base.group_allow_export'
        self.assertEqual(
            {login for login, user in users.items() if user.has_group(export)},
            {'toff_officer', 'toff_admin'})
        peer = self.env['hr.employee'].search([('name', '=', fx.PEER_NAME)])
        self.assertEqual(peer.leave_manager_id, users['toff_approver'])
        self.assertEqual(peer.parent_id, users['toff_manager'].employee_id)
        for user in users.values():
            self.assertEqual(user.tz, fx.TZ)
            self.assertEqual(user.employee_id.name, user.name)
            self.assertEqual(user.employee_id.tz, fx.TZ)

    def test_prepared_states(self):
        flexible = fx.make_flexible(self.env)
        states = fx.make_states(self.env)
        fx.make_tokyo(self.env)
        bulk = fx.make_bulk(self.env)
        self.assertEqual(len(bulk), 30)
        leaves = self.env['hr.leave'].search(
            [('employee_id', '=', states.id)], order='request_date_from')
        self.assertEqual(leaves.mapped('state'), ['confirm', 'validate1', 'validate', 'refuse'])
        fixed = self.env['hr.leave'].search(
            [('employee_id', '=', flexible['Toff Fixed'].id)], order='request_date_from')
        self.assertEqual(fixed.mapped('state'), ['validate'] * 3)
        self.assertEqual(fixed.mapped('number_of_days')[:2], [1.0, 0.5])
        self.assertEqual(fixed[2].number_of_hours, 4.0)

    def test_demo_like_and_drop(self):
        made = fx.make_demo_like(self.env)
        anita = made['Anita Oliver']
        leaves = self.env['hr.leave'].search([
            ('employee_id', '=', anita.id), ('state', '=', 'validate')], order='request_date_from')
        self.assertEqual(
            leaves.mapped('number_of_days'), [4.0, 1.0, 6.0], leaves.mapped('request_date_from'))
        self.assertEqual({leave.work_entry_type_id.display_code for leave in leaves}, {'PTO'})
        self.assertEqual({leave.color for leave in leaves}, {11})
        fx.make_role_users(self.env)
        fx.make_flexible(self.env)
        fx.drop_time_off_records(self.env)
        self.assertFalse(self.env['res.users'].search([('login', '=like', 'toff\\_%')]))
        self.assertFalse(self.env['hr.employee'].with_context(active_test=False).search(
            [('name', '=like', 'Toff %')]))
        self.assertFalse(self.env['hr.work.entry.type'].search([('name', '=like', 'Toff %')]))
