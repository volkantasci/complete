# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests.common import TransactionCase


class TestInstall(TransactionCase):
    def test_a2_attendance_bridge_installs_by_itself(self):
        module = self.env['ir.module.module'].search([('name', '=', 'hr_attendance_gantt')])
        self.assertEqual(module.state, 'installed')
        self.assertTrue(module.auto_install)
        self.assertFalse(module.application)
        self.assertEqual(
            set(module.dependencies_id.mapped('name')), {'hr_attendance', 'hr_gantt'}
        )
        category = module.category_id
        self.assertEqual(
            (category.parent_id.name, category.name), ('Human Resources', 'Attendances')
        )
        installed = self.env['ir.module.module'].search([('name', 'in', ['hr', 'hr_gantt'])])
        self.assertEqual(set(installed.mapped('state')), {'installed'})
        owned = self.env['ir.model.data'].search([('module', '=', 'hr_attendance_gantt')])
        owned_models = set(owned.mapped('model'))
        for model in (
            'ir.ui.menu', 'ir.actions.act_window', 'res.groups',
        ):
            self.assertNotIn(model, owned_models, f'hr_attendance_gantt owns no {model}')
        # extending hr.attendance gives the module the model's field records, but no new field
        for name, field in self.env['hr.attendance']._fields.items():
            self.assertNotEqual(
                getattr(field, '_module', None), 'hr_attendance_gantt', f'no field {name}')
