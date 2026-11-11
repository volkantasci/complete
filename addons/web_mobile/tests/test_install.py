# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class CwmInstall(TransactionCase):
    def _state(self, name):
        return self.env['ir.module.module'].search([('name', '=', name)])

    def test_A60_auto_install(self):
        for name, base in (('web_mobile', None), ('hr_mobile', 'hr'), ('pos_hr_mobile', 'pos_hr')):
            module = self._state(name)
            if name != 'web_mobile' and not module:
                continue
            self.assertTrue(module, name)
            self.assertTrue(module.auto_install, name)
            self.assertFalse(module.application, name)
            if base is None:
                self.assertEqual(module.state, 'installed')
            else:
                base_installed = self._state(base).state == 'installed'
                self.assertEqual(module.state == 'installed', base_installed, name)
