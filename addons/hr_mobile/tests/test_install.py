# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class CwmHrInstall(TransactionCase):
    def test_A60_auto_install(self):
        installed_check = self.env['ir.module.module'].search
        module = installed_check([('name', '=', 'hr_mobile')])
        self.assertTrue(module.auto_install)
        self.assertFalse(module.application)
        self.assertEqual(module.state, 'installed')
        for name in ('hr', 'web_mobile'):
            self.assertEqual(installed_check([('name', '=', name)]).state, 'installed')

    def test_R_OC_6_hr_form_type_wins(self):
        view = self.env.ref('hr.res_users_view_form_preferences')
        arch = self.env['res.users'].get_view(view.id)['arch']
        self.assertIn('js_class="hr_user_preferences_form"', arch)
        self.assertNotIn('cwm_account_prefs_form', arch)
