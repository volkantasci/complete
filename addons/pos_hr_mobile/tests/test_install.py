# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class CwmPosInstall(TransactionCase):
    def test_A60_auto_install(self):
        module = self.env.ref('base.module_pos_hr_mobile')
        self.assertTrue(module.auto_install)
        self.assertFalse(module.application)
        self.assertEqual(module.state, 'installed')
        for name in ('pos_hr', 'web_mobile'):
            self.assertEqual(self.env.ref(f'base.module_{name}').state, 'installed')
        self.assertEqual(
            set(module.dependencies_id.mapped('name')), {'pos_hr', 'web_mobile'},
        )
