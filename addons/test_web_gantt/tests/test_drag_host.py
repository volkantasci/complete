# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import ast

from lxml import etree
from odoo.tests.common import TransactionCase, tagged

PILL = 'test.web.gantt.pill'
XML = 'test_web_gantt.'


@tagged('post_install', '-at_install')
class TestTimelineDragHost(TransactionCase):
    def _arch(self, xmlid):
        view = self.env.ref(XML + xmlid)
        views = self.env[PILL].get_views([(view.id, 'gantt')])['views']
        return etree.fromstring(views['gantt']['arch'])

    def _context(self, number):
        return ast.literal_eval(self.env.ref(f'{XML}host_action_h{number}').context)

    def _check_base(self, arch, xmlid):
        self.assertEqual(arch.tag, 'gantt', xmlid)
        self.assertEqual(arch.get('string'), 'Pills', xmlid)
        self.assertEqual(arch.get('date_start'), 'date_start', xmlid)
        self.assertEqual(arch.get('date_stop'), 'date_stop', xmlid)
        self.assertEqual(arch.get('default_range'), 'week', xmlid)
        self.assertEqual(arch.get('color'), 'x_color', xmlid)
        self.assertEqual(arch.get('plan'), '0', xmlid)

    def _check_action(self, number, view_xmlid):
        action = self.env.ref(f'{XML}host_action_h{number}')
        self.assertEqual(action.res_model, PILL)
        self.assertEqual(action.view_mode, 'gantt,list,form')
        self.assertEqual(action.view_id, self.env.ref(XML + view_xmlid))
        menu = self.env.ref(f'{XML}host_menu_h{number}')
        self.assertEqual(menu.parent_id, self.env.ref(XML + 'host_menu_root'))
        self.assertEqual(menu.action, action)

    def test_h30_view_and_grouping(self):
        arch = self._arch('host_view_h30')
        self._check_base(arch, 'h30')
        self.assertIsNone(arch.get('disable_drag_drop'))
        self._check_action(30, 'host_view_h30')
        self.assertEqual(self._context(30)['group_by'], ['parent_id', 'create_uid'])

    def test_h31_drag_drop_off(self):
        arch = self._arch('host_view_h31')
        self._check_base(arch, 'h31')
        self.assertEqual(arch.get('disable_drag_drop'), '1')
        self._check_action(31, 'host_view_h31')
        self.assertFalse(self._context(31).get('group_by'))

    def test_h32_grouping(self):
        # the view of H30, one more grouping level
        self._check_action(32, 'host_view_h30')
        self.assertEqual(
            self._context(32)['group_by'], ['parent_id', 'create_uid', 'x_contact'])
        self.assertEqual(self.env[PILL]._fields['create_uid'].readonly, True)

    def test_rtl_user(self):
        user = self.env[PILL]._tl_rtl_user(self.env)
        admin = self.env.ref('base.user_admin')
        self.assertTrue(user.active)
        self.assertEqual(user.name, 'RTL Admin')
        self.assertEqual(user.login, 'rtl')
        self.assertEqual(user.lang, 'ar_001')
        self.assertTrue(self.env['res.lang']._lang_get('ar_001').active)
        self.assertEqual(user.group_ids, admin.group_ids)
        self.assertEqual(user.tz, admin.tz)
        # asking again returns the same user
        self.assertEqual(self.env[PILL]._tl_rtl_user(self.env), user)
