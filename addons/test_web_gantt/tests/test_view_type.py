# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests.common import TransactionCase


class TestViewType(TransactionCase):
    def test_a1_view_type_and_action_line(self):
        view = self.env['ir.ui.view'].create({
            'name': 'Pill gantt',
            'model': 'test.web.gantt.pill',
            'type': 'gantt',
            'arch': '<gantt date_start="date_start" date_stop="date_stop"/>',
        })
        self.assertEqual(view.type, 'gantt')
        self.assertEqual(dict(self.env['ir.ui.view']._fields['type'].selection)['gantt'], 'Gantt')

        action = self.env['ir.actions.act_window'].create({
            'name': 'Pills',
            'res_model': 'test.web.gantt.pill',
            'view_mode': 'gantt',
            'view_ids': [(0, 0, {'view_mode': 'gantt', 'view_id': view.id})],
        })
        self.assertEqual(action.view_ids.view_mode, 'gantt')
        field = self.env['ir.actions.act_window.view']._fields['view_mode']
        self.assertEqual(dict(field.selection)['gantt'], 'Gantt')
        self.assertEqual(field.ondelete['gantt'], 'cascade')

    def test_view_type_is_qweb_based_and_has_icon(self):
        view_model = self.env['ir.ui.view']
        self.assertTrue(view_model._is_qweb_based_view('gantt'))
        self.assertEqual(view_model._get_view_info()['gantt']['icon'], 'view_timeline')

    def test_test_models_shape(self):
        pill = self.env['test.web.gantt.pill']
        pill2 = self.env['test.web.gantt.pill2']
        self.assertEqual(pill._description, 'Test Web Gantt Pill')
        self.assertEqual(pill._fields['dependency_field'].relation, 'web_gantt_test_pill_dep')
        self.assertEqual(pill2._fields['dependency_field'].relation, 'web_gantt_test_pill_2_dep')
        self.assertEqual(pill._fields['date_start'].type, 'datetime')
        self.assertEqual(pill2._fields['date_start'].type, 'date')
        self.assertIn('pill_properties', pill._fields)
        self.assertNotIn('pill_properties', pill2._fields)
        self.assertTrue(pill._fields['pill_properties'].copy)
