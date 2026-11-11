# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from lxml import etree
from odoo import Command
from odoo.tests.common import TransactionCase


class TestAccessRights(TransactionCase):
    def _gantt_arch_for(self, operation):
        """Arch of a Gantt view as loaded by a user whose only access line is `operation`."""
        group = self.env['res.groups'].create({'name': f'Gantt pill limited {operation}'})
        self.env['ir.access'].create({
            'name': f'Limited pill access {operation}',
            'model_id': self.env['ir.model']._get_id('test.web.gantt.pill'),
            'group_id': group.id,
            'operation': operation,
        })
        user = self.env['res.users'].create({
            'name': f'Limited {operation}',
            'login': f'limited_{operation}',
            'group_ids': [Command.set([group.id])],
        })
        view = self.env.ref('test_web_gantt.host_view_h1')
        result = self.env['test.web.gantt.pill'].with_user(user).get_views([(view.id, 'gantt')])
        return etree.fromstring(result['views']['gantt']['arch'])

    def test_a110_access_rights_switch_options_off(self):
        # read, create and write but no delete right
        arch = self._gantt_arch_for('cru')
        self.assertEqual(arch.get('delete'), 'False')
        self.assertIsNone(arch.get('create'))
        self.assertIsNone(arch.get('edit'))
        # no create right
        arch = self._gantt_arch_for('ru')
        self.assertEqual(arch.get('create'), 'False')
        self.assertIsNone(arch.get('edit'))
