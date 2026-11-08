# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import json

from odoo.tests import HttpCase, new_test_user, tagged


@tagged('post_install', '-at_install')
class TestWebShellTours(HttpCase):
    """End-to-end tours of the shell against the real server."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user1 = new_test_user(
            cls.env, login='cws_u1', groups='base.group_user', name='Shell U1',
        )
        cls.admin1 = new_test_user(
            cls.env, login='cws_a1', groups='base.group_user,base.group_system',
            name='Shell A1',
        )
        cls.partner = cls.env['res.partner'].create({'name': 'Shell Alpha'})
        cls.env['res.partner'].create({'name': 'Shell Beta'})
        Action = cls.env['ir.actions.act_window']
        cls.action_contacts = Action.create({
            'name': 'Shell Contacts', 'res_model': 'res.partner',
            'view_mode': 'list,form', 'path': 'cws-contacts',
        })
        cls.action_notes = Action.create({
            'name': 'Shell Notes', 'res_model': 'res.partner', 'view_mode': 'list,form',
        })
        cls.action_extras = Action.create({
            'name': 'Shell Extras', 'res_model': 'res.partner', 'view_mode': 'list,form',
        })
        menus = cls.env['ir.ui.menu'].create([
            {'name': 'Shell Contacts', 'sequence': 9001,
             'action': f'ir.actions.act_window,{cls.action_contacts.id}'},
            {'name': 'Shell Notes', 'sequence': 9002,
             'action': f'ir.actions.act_window,{cls.action_notes.id}',
             'group_ids': [(6, 0, [cls.env.ref('base.group_system').id])]},
            {'name': 'Shell Extras', 'sequence': 9003,
             'action': f'ir.actions.act_window,{cls.action_extras.id}'},
        ])
        cls.menus = menus
        names = ('menu_contacts', 'menu_notes', 'menu_extras')
        for menu, name in zip(menus, names, strict=True):
            cls.env['ir.model.data'].create({
                'module': 'cws_tour', 'name': name, 'model': 'ir.ui.menu', 'res_id': menu.id,
            })

    def _settings(self, user):
        return self.env['res.users.settings'].search([('user_id', '=', user.id)])

    def _visible_fixture_menus(self, user):
        visible = self.env['ir.ui.menu'].with_user(user)._visible_menu_ids()
        return self.menus.filtered(lambda menu: menu.id in visible).mapped('name')

    def test_A1_landing_page(self):
        self.start_tour('/odoo', 'web_shell_landing_page', login='cws_a1')

    def test_A2_action_address_skips_home(self):
        self.start_tour('/odoo/cws-contacts', 'web_shell_action_address', login='cws_a1')

    def test_A3_tiles_follow_visible_apps(self):
        # the tours assert the tiles in the browser; this is the same visibility on the server
        self.assertEqual(
            self._visible_fixture_menus(self.user1), ['Shell Contacts', 'Shell Extras'],
        )
        self.assertEqual(
            self._visible_fixture_menus(self.admin1),
            ['Shell Contacts', 'Shell Notes', 'Shell Extras'],
        )
        self.start_tour('/odoo', 'web_shell_tiles_user', login='cws_u1')
        self.start_tour('/odoo', 'web_shell_tiles_admin', login='cws_a1')

    def test_A4_A14_open_tile_then_back(self):
        self.start_tour('/odoo', 'web_shell_open_tile_then_back', login='cws_a1')

    def test_A9_A11_toggle_restore_and_new_stack(self):
        self.start_tour(
            '/odoo/cws-contacts', 'web_shell_toggle_restore_and_new_stack', login='cws_a1',
        )

    def test_A87_name_toggles_home_menu(self):
        self.start_tour(
            '/odoo/cws-contacts', 'web_shell_name_toggles_home_menu', login='cws_a1',
        )

    def test_A12_unsaved_changes_saved_on_toggle(self):
        self.start_tour(
            f'/odoo/cws-contacts/{self.partner.id}',
            'web_shell_unsaved_changes_saved_on_toggle', login='cws_a1',
        )
        self.partner.invalidate_recordset()
        self.assertEqual(self.partner.name, 'Shell Renamed')

    def test_A33_order_survives_reload(self):
        self.assertFalse(self._settings(self.admin1).homemenu_config)
        self.start_tour('/odoo', 'web_shell_order_survives_reload', login='cws_a1')
        saved = json.loads(self._settings(self.admin1).homemenu_config)
        self.assertEqual(saved, ['cws_tour.menu_notes', 'cws_tour.menu_contacts'])

    def test_A37_order_only_for_its_user(self):
        self.env['res.users.settings']._find_or_create_for_user(self.admin1).homemenu_config = (
            json.dumps(['cws_tour.menu_extras', 'cws_tour.menu_contacts'])
        )
        self.assertFalse(self._settings(self.user1).homemenu_config)
        self.start_tour('/odoo', 'web_shell_default_order_for_user', login='cws_u1')
        self.assertFalse(self._settings(self.user1).homemenu_config)

    def test_A49_admin_message_audience(self):
        self.env['ir.config_parameter'].set_str(
            'sysadmin.message',
            json.dumps({'message': '<p>Tour notice</p>', 'warning_type': 'admin'}),
        )
        self.start_tour('/odoo', 'web_shell_admin_message_shown', login='cws_a1')
        self.start_tour('/odoo', 'web_shell_admin_message_hidden', login='cws_u1')

    def test_A54_theme_field_in_preferences(self):
        self.start_tour('/odoo', 'web_shell_theme_field', login='cws_u1')

    def test_A57_dark_reloads_once(self):
        # Two runs, since the save reloads the page and the tour then restarts.
        self.assertEqual(self._settings(self.user1).color_scheme or 'system', 'system')
        self.start_tour('/odoo', 'web_shell_dark_save', login='cws_u1')
        self.assertEqual(self._settings(self.user1).color_scheme, 'dark')
        self.start_tour('/odoo', 'web_shell_dark_loaded', login='cws_u1')

    def test_A73_missing_action_falls_back(self):
        self.start_tour('/odoo/action-999999', 'web_shell_missing_action', login='cws_a1')

    def test_A74_back_from_first_screen(self):
        self.start_tour(
            f'/odoo/res.partner/{self.partner.id}', 'web_shell_back_from_first_screen',
            login='cws_a1',
        )


class StickyKanbanFixture(HttpCase):
    """A grouped partner kanban tall enough to scroll, reachable three ways."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        new_test_user(
            cls.env, login='cws_k1', groups='base.group_user,base.group_system',
            name='Shell K1',
        )
        cls.env['res.partner'].create([
            {'name': f'Sticky Card {index:02d}', 'type': 'contact'} for index in range(40)
        ])
        Action = cls.env['ir.actions.act_window']
        values = {
            'name': 'Sticky Cards', 'res_model': 'res.partner',
            'domain': [('name', '=like', 'Sticky Card%')],
            'context': {'group_by': 'type'},
        }
        action = Action.create({**values, 'view_mode': 'kanban,list', 'path': 'cws-sticky'})
        listed = Action.create({**values, 'view_mode': 'list,kanban', 'path': 'cws-sticky-list'})
        cls.env['ir.ui.menu'].create({
            'name': 'Sticky Cards', 'sequence': 9100,
            'action': f'ir.actions.act_window,{action.id}',
        })
        cls.listed = listed


@tagged('post_install', '-at_install')
class TestStickyKanbanHeaderTours(StickyKanbanFixture):
    """The pinned kanban column headers in a live, scrolling grouped view (A64)."""

    browser_size = '1600x900'

    def test_A64_sticky_header_live(self):
        self.start_tour('/odoo/cws-sticky', 'web_shell_sticky_kanban_header', login='cws_k1')

    def test_A64_sticky_header_from_home(self):
        self.start_tour('/odoo', 'web_shell_sticky_kanban_header_from_home', login='cws_k1')

    def test_A64_sticky_header_after_view_switch(self):
        self.start_tour(
            '/odoo/cws-sticky-list', 'web_shell_sticky_kanban_header_after_switch',
            login='cws_k1',
        )


@tagged('post_install', '-at_install')
class TestStickyKanbanHeaderMobileTours(StickyKanbanFixture):
    """The same on a phone, where `.o_content` scrolls too.

    The columns do not scroll on their own.
    """

    browser_size = '390x844'
    touch_enabled = True

    def test_A64_sticky_header_live_mobile(self):
        self.start_tour('/odoo/cws-sticky', 'web_shell_sticky_kanban_header', login='cws_k1')


@tagged('post_install', '-at_install')
class TestStickyPipelineHeaderTours(HttpCase):
    """The CRM pipeline header has its own template copy; it must stick as well (A64).

    This tour runs only with `-i crm` (it skips itself otherwise). The always-on guard for
    the template copy is the Hoot test "A64 header with its own template copy".
    """

    browser_size = '1600x900'

    def test_A64_sticky_header_pipeline(self):
        if 'crm.lead' not in self.env:
            self.skipTest('crm is not installed')
        admin = self.env.ref('base.user_admin')
        self.env['crm.lead'].create([
            {'name': f'Sticky lead {index:02d}', 'type': 'opportunity', 'user_id': admin.id}
            for index in range(30)
        ])
        self.start_tour(
            '/odoo/action-crm.crm_lead_action_pipeline', 'web_shell_sticky_kanban_header',
            login='admin',
        )
