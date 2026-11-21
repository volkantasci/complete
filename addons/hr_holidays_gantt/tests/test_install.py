# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests.common import TransactionCase


class TestInstall(TransactionCase):
    def test_bridge_is_installed(self):
        module = self.env['ir.module.module'].search([('name', '=', 'hr_holidays_gantt')])
        self.assertEqual(module.state, 'installed')
        self.assertTrue(module.auto_install)
        self.assertFalse(module.application)

    def test_a01_bridge_installs_by_itself(self):
        module = self.env['ir.module.module'].search([('name', '=', 'hr_holidays_gantt')])
        self.assertEqual(module.state, 'installed')
        self.assertTrue(module.auto_install)
        self.assertFalse(module.application)
        self.assertEqual(
            set(module.dependencies_id.mapped('name')),
            {'hr_holidays', 'base_import', 'hr_gantt'},
        )
        gantt_bridge = self.env['ir.module.module'].search([('name', '=', 'hr_gantt')])
        self.assertIn('web_gantt', gantt_bridge.dependencies_id.mapped('name'))
        owned_models = set(
            self.env['ir.model.data'].search([('module', '=', 'hr_holidays_gantt')]).mapped('model')
        )
        for model in ('res.groups', 'ir.ui.menu'):
            self.assertNotIn(model, owned_models, f'the bridge owns no {model}')
        for name, field in self.env['res.config.settings']._fields.items():
            self.assertNotEqual(
                getattr(field, '_module', None), 'hr_holidays_gantt', f'no setting {name}')
