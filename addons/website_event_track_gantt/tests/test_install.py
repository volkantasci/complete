# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests.common import TransactionCase


class TestInstall(TransactionCase):
    def test_a27_installs_by_itself(self):
        module = self.env['ir.module.module'].search([('name', '=', 'website_event_track_gantt')])
        self.assertEqual(
            set(module.dependencies_id.mapped('name')), {'website_event_track', 'web_gantt'}
        )
        self.assertFalse(module.application)
        self.assertTrue(module.auto_install)
        self.assertEqual(module.category_id.name, 'Marketing')
