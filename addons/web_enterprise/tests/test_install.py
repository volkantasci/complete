# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests.common import TransactionCase


class TestInstall(TransactionCase):
    def test_module_installed(self):
        module = self.env['ir.module.module'].search([('name', '=', 'web_enterprise')])
        self.assertEqual(module.state, 'installed')
