# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class CwmPosInstall(TransactionCase):
    def test_A60_auto_install(self):
        modules = self.env['ir.module.module']
        module = modules.search([('name', '=', 'pos_hr_mobile')])
        self.assertTrue(module.auto_install)
        self.assertFalse(module.application)
        self.assertEqual(module.state, 'installed')
        for name in ('pos_hr', 'web_mobile'):
            self.assertEqual(modules.search([('name', '=', name)]).state, 'installed')
        self.assertEqual(
            set(module.dependencies_id.mapped('name')), {'pos_hr', 'web_mobile'},
        )
