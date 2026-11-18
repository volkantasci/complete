# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests.common import TransactionCase


class TestInstall(TransactionCase):
    def test_a1_employees_bridge_installs_by_itself(self):
        module = self.env['ir.module.module'].search([('name', '=', 'hr_gantt')])
        self.assertEqual(module.state, 'installed')
        self.assertTrue(module.auto_install)
        self.assertFalse(module.application)
        self.assertEqual(set(module.dependencies_id.mapped('name')), {'hr', 'web_gantt'})
        category = module.category_id
        self.assertEqual((category.parent_id.name, category.name), ('Human Resources', 'Employees'))
        owned = self.env['ir.model.data'].search([('module', '=', 'hr_gantt')])
        owned_models = set(owned.mapped('model'))
        for model in (
            'ir.ui.menu', 'ir.actions.act_window', 'ir.ui.view', 'res.groups', 'ir.model.fields',
        ):
            self.assertNotIn(model, owned_models, f'hr_gantt must own no {model}')
